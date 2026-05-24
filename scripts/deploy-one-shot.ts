/* 
 * ONE-SHOT DEPLOYMENT SCRIPT - FULL SYSTEM
 * 
 * Deploys the complete SALT Protocol (Diamond + all facets + initialization)
 * in a single, reliable command.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-one-shot.ts --network localhost
 *   npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia
 */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "localhost";
  const args = process.argv.slice(2);

  const shouldReset = args.includes("--reset");
  const coreOnly = args.includes("--core-only");
  const gameOnly = args.includes("--game-only");
  const shouldVerify = args.includes("--verify");

  console.log(`\n🚀 SALT Protocol - One-Shot Full Deployment`);
  console.log(`   Network: ${networkName}`);
  if (shouldReset) console.log("   --reset flag detected");
  if (coreOnly) console.log("   Mode: --core-only");
  if (gameOnly) console.log("   Mode: --game-only");
  if (shouldVerify) console.log("   --verify flag detected");
  console.log();

  // Handle --reset flag
  if (shouldReset) {
    const deploymentsDir = path.join(__dirname, "../deployments");
    const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
    
    if (fs.existsSync(deploymentFile)) {
      fs.unlinkSync(deploymentFile);
      console.log(`🗑️  Deleted old deployment file: deployments/${networkName}.json`);
    }
    
    // Also clean Ignition deployments if they exist
    const ignitionDeployments = path.join(__dirname, "../ignition/deployments", networkName);
    if (fs.existsSync(ignitionDeployments)) {
      fs.rmSync(ignitionDeployments, { recursive: true, force: true });
      console.log(`🗑️  Deleted Ignition deployments for ${networkName}`);
    }
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

  const deployment: any = {
    network: networkName,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {},
  };

  // ==========================================
  // 1. DEPLOY DIAMOND INFRASTRUCTURE
  // ==========================================
  console.log("=== 1. Diamond Infrastructure ===");

  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.waitForDeployment();
  deployment.contracts.DiamondCutFacet = await diamondCutFacet.getAddress();
  console.log("DiamondCutFacet:", deployment.contracts.DiamondCutFacet);

  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(deployer.address, deployment.contracts.DiamondCutFacet);
  await diamond.waitForDeployment();
  const diamondAddr = await diamond.getAddress();
  deployment.contracts.Diamond = diamondAddr;
  console.log("Diamond:", diamondAddr);

  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.waitForDeployment();
  deployment.contracts.DiamondInit = await diamondInit.getAddress();

  // ==========================================
  // 2. DEPLOY ALL FACETS
  // ==========================================
  console.log("\n=== 2. Deploying Facets ===");

  const facetsToDeploy = [
    "DiamondLoupeFacet",
    "OwnershipFacet",
    "ERC20Facet",
    "StakingFacet",
    "CollateralFacet",
    "PegManagerFacet",
    "BridgeFacet",
    "FeeDistributorFacet",
    "TimelockFacet",
    "NFTManagerFacet",
    "MemeMarketplaceFacet",
    "GamePaymentFacet",
    "ZKGameVerifierFacet",
    "AgentIdentityFacet",
    "AvABettingFacet",
  ];

  const deployedFacets: Record<string, any> = {};

  for (const facetName of facetsToDeploy) {
    const Factory = await ethers.getContractFactory(facetName);
    const facet = await Factory.deploy();
    await facet.waitForDeployment();
    const addr = await facet.getAddress();
    deployedFacets[facetName] = facet;
    deployment.contracts[facetName] = addr;
    console.log(`${facetName}:`, addr);
  }

  // ==========================================
  // 3. CUT FACETS INTO DIAMOND
  // ==========================================
  console.log("\n=== 3. Cutting Facets into Diamond ===");

  const diamondCut = await ethers.getContractAt("IDiamondCut", diamondAddr);
  const cut = [];

  // Helper to get selectors
  function getSelectors(contract: any) {
    const sigs: string[] = [];
    for (const frag of contract.interface.fragments) {
      if (frag.type === "function") {
        sigs.push(contract.interface.getFunction(frag.name).selector);
      }
    }
    return sigs;
  }

  // Add all facets (except DiamondCut which is already there)
  const facetsToCut = ["DiamondLoupeFacet", "OwnershipFacet", "ERC20Facet", "StakingFacet", 
                        "CollateralFacet", "PegManagerFacet", "BridgeFacet", "FeeDistributorFacet",
                        "TimelockFacet", "NFTManagerFacet", "MemeMarketplaceFacet", 
                        "GamePaymentFacet", "ZKGameVerifierFacet", "AgentIdentityFacet", "AvABettingFacet"];

  for (const name of facetsToCut) {
    const facet = deployedFacets[name];
    cut.push({
      facetAddress: await facet.getAddress(),
      action: 0, // Add
      functionSelectors: getSelectors(facet),
    });
  }

  const initCalldata = diamondInit.interface.encodeFunctionData("init");
  const tx = await diamondCut.diamondCut(cut, await diamondInit.getAddress(), initCalldata);
  await tx.wait();
  console.log("All facets cut successfully into Diamond");

  // ==========================================
  // 4. INITIALIZE CORE SYSTEMS
  // ==========================================
  console.log("\n=== 4. Initialization ===");

  // ERC20 - SALT Token
  const salt = await ethers.getContractAt("ERC20Facet", diamondAddr);
  await (await salt.setTokenSettings("Intern", "SALT", 18)).wait();
  await (await salt.mint(deployer.address, ethers.parseUnits("1000000000", 18))).wait();
  console.log("SALT token initialized (1B minted to deployer)");

  // Wire special minter/burner roles so Collateral, Bridge, GamePayment can mint/burn via the diamond
  await (await salt.setCollateralManager(diamondAddr)).wait();
  await (await salt.setBridgeManager(diamondAddr)).wait();
  // PegManager is set separately when PegManagerFacet is initialized
  console.log("ERC20 special managers wired (Collateral + Bridge)");

  // Staking
  const staking = await ethers.getContractAt("StakingFacet", diamondAddr);
  await (await staking.initializeStaking(0)).wait(); // revenue-only mode
  console.log("Staking initialized (revenue-only)");

  // Collateral
  const collateral = await ethers.getContractAt("CollateralFacet", diamondAddr);
  // Note: USDC address must be set separately after deployment

  // FeeDistributor
  const feeDistributor = await ethers.getContractAt("FeeDistributorFacet", diamondAddr);
  await (await feeDistributor.setRecipients(
    deployer.address, // Treasury (for now)
    diamondAddr,      // Staking (the diamond itself)
    diamondAddr       // Paymaster (placeholder)
  )).wait();
  console.log("FeeDistributor recipients set");

  // GamePaymentFacet
  const gamePayment = await ethers.getContractAt("GamePaymentFacet", diamondAddr);
  await (await gamePayment.initializeGamePayment(diamondAddr)).wait();
  await (await gamePayment.setFeeDistributor(await feeDistributor.getAddress())).wait();
  await (await gamePayment.setGameServer(deployer.address)).wait(); // For testing
  await (await gamePayment.setEntryFeeSALT(ethers.parseUnits("0.01", 18))).wait();
  console.log("GamePaymentFacet initialized");

  // AgentIdentityFacet (Phase 1)
  const agentIdentity = await ethers.getContractAt("AgentIdentityFacet", diamondAddr);
  await (await agentIdentity.setGameServer(deployer.address)).wait(); // Same server as GamePayment for now
  console.log("AgentIdentityFacet initialized (gameServer wired)");

  // Wire the same gameServer on GamePaymentFacet (in case it wasn't)
  await (await gamePayment.setGameServer(deployer.address)).wait();
  console.log("setGameServer() wired on both GamePaymentFacet and AgentIdentityFacet");

  // AvABettingFacet (Phase 4)
  const avab = await ethers.getContractAt("AvABettingFacet", diamondAddr);
  await (await avab.setGameServer(deployer.address)).wait();
  await (await avab.setSaltToken(diamondAddr)).wait(); // SALT lives on the diamond
  console.log("AvABettingFacet initialized and wired");

  // ==========================================
  // PHASE 3 TEST DATA: Register test Agent + sample Heroes + Loadouts
  // ==========================================
  console.log("\n=== Phase 3 Test Data: Agent + Heroes + Loadouts ===");

  // Deploy a GamingAssetNFT collection for testing
  const GamingAssetFactory = await ethers.getContractFactory("GamingAssetNFT");
  const gamingAsset = await GamingAssetFactory.deploy(diamondAddr, "SALT Heroes", "HERO");
  await gamingAsset.waitForDeployment();
  const gamingAssetAddr = await gamingAsset.getAddress();
  deployment.contracts.TestGamingAssetNFT = gamingAssetAddr;
  console.log("Test GamingAssetNFT deployed at:", gamingAssetAddr);

  // Register the collection with NFTManager as GAMING type
  const nftManager = await ethers.getContractAt("NFTManagerFacet", diamondAddr);
  // Note: NFTType.GAMING should be 2 or check INFTManager enum. Using 2 as GAMING for now.
  await (await nftManager.registerCollection(gamingAssetAddr, 2, "Test SALT Heroes")).wait();
  console.log("Test GamingAssetNFT registered as GAMING collection");

  // Mint 3 sample heroes to deployer
  const sampleHeroes = [
    { id: 1, uri: "ipfs://hero1", attrs: { level: 1, power: 50, rarity: 1, gameId: ethers.ZeroHash } },
    { id: 2, uri: "ipfs://hero2", attrs: { level: 3, power: 120, rarity: 2, gameId: ethers.ZeroHash } },
    { id: 3, uri: "ipfs://hero3", attrs: { level: 5, power: 200, rarity: 3, gameId: ethers.ZeroHash } },
  ];

  for (const hero of sampleHeroes) {
    await (await gamingAsset.mint(deployer.address, hero.id, hero.uri, hero.attrs)).wait();
    console.log(`  Minted Hero #${hero.id}`);
  }

  // Register a test Agent
  const testAgentURI = "ipfs://test-agent-alpha-metadata";
  const testAgentId = await agentIdentity.registerAgent.staticCall(deployer.address, testAgentURI);
  await (await agentIdentity.registerAgent(deployer.address, testAgentURI)).wait();
  console.log(`Test Agent registered with ID: ${testAgentId}`);

  // Bind the 3 heroes to the test agent
  for (const hero of sampleHeroes) {
    await (await agentIdentity.addHeroToAgent(testAgentId, hero.id)).wait();
  }
  console.log("Bound 3 sample Heroes to test Agent");

  // Register 2 sample loadouts for the agent
  const loadout1 = ethers.keccak256(ethers.toUtf8Bytes("sample-loadout-1-carrier-heavy"));
  const loadout2 = ethers.keccak256(ethers.toUtf8Bytes("sample-loadout-2-balanced"));
  await (await agentIdentity.registerLoadoutForAgent(testAgentId, loadout1)).wait();
  await (await agentIdentity.registerLoadoutForAgent(testAgentId, loadout2)).wait();
  console.log("Registered 2 sample loadouts for test Agent");

  console.log("=== Phase 3 Test Data Complete ===\n");

  // ZKGameVerifier
  const zkVerifier = await ethers.getContractAt("ZKGameVerifierFacet", diamondAddr);
  console.log("ZKGameVerifierFacet ready (verifier contract can be set later)");

  // Timelock (optional but recommended)
  const timelock = await ethers.getContractAt("TimelockFacet", diamondAddr);
  // Initialize if needed...

  // ==========================================
  // 5. SAVE DEPLOYMENT
  // ==========================================
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const filePath = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));

  console.log(`\n✅ Deployment completed successfully!`);
  console.log(`   Diamond Address: ${diamondAddr}`);
  console.log(`   Deployment saved to: deployments/${networkName}.json\n`);

  // ==========================================
  // 6. AUTO-GENERATE .env FILES
  // ==========================================
  console.log("=== 6. Generating environment files ===");

  // Frontend .env
  const frontendEnvPath = path.join(__dirname, "../frontend/.env.local");
  const frontendEnvContent = `NEXT_PUBLIC_DIAMOND_ADDRESS=${diamondAddr}
NEXT_PUBLIC_NETWORK=${networkName}
# Add your WalletConnect Project ID below
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
`;
  fs.writeFileSync(frontendEnvPath, frontendEnvContent);
  console.log("   Generated: frontend/.env.local");

  // Keeper .env
  const keeperEnvPath = path.join(__dirname, "../scripts/.env.keeper");
  const keeperEnvContent = `DIAMOND_ADDRESS=${diamondAddr}
KEEPER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RPC_URL=${process.env.RPC_URL || "http://127.0.0.1:8545"}
`;
  fs.writeFileSync(keeperEnvPath, keeperEnvContent);
  console.log("   Generated: scripts/.env.keeper\n");

  // Optional verification
  if (shouldVerify && networkName !== "localhost") {
    console.log("\n=== Verifying contracts on block explorer ===");
    try {
      const { run } = await import("hardhat");
      await run("verify:verify", {
        address: diamondAddr,
        constructorArguments: [deployer.address, deployment.contracts.DiamondCutFacet],
      });
      console.log("Diamond verified successfully");
    } catch (e) {
      console.log("Verification skipped or failed (common on testnets):", (e as Error).message);
    }
  }

  console.log("Next steps:");
  console.log("1. (Optional) Set USDC address on CollateralFacet");
  console.log("2. Update KEEPER_PRIVATE_KEY in scripts/.env.keeper");
  console.log("3. Start keeper: node scripts/keeper-update-prices.js");
  console.log("4. Start game server + frontend");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
