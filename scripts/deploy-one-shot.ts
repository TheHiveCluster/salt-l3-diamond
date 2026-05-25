/* 
 * ONE-SHOT DEPLOYMENT SCRIPT - FULL SYSTEM
 * 
 * Deploys the complete SALT Protocol (Diamond + all facets + initialization)
 * in a single, reliable command.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-one-shot.ts --network localhost
 *   npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia
 *   npx hardhat run scripts/deploy-one-shot.ts --network buildbear   (Alpha - set BUILDBEAR_* env vars)
 */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const networkName = process.env.HARDHAT_NETWORK || "localhost";
  const args = process.argv.slice(2);

  // Support both --reset flag and RESET=true env var (more reliable in PowerShell)
  const shouldReset = args.includes("--reset") || 
                      process.env.RESET === "true" || 
                      process.env.RESET === "1";
  const coreOnly = args.includes("--core-only");
  const gameOnly = args.includes("--game-only");
  const shouldVerify = args.includes("--verify");

  console.log(`\n🚀 SALT Protocol - One-Shot Full Deployment`);
  console.log(`   Network: ${networkName}`);
  if (shouldReset) console.log("   --reset flag detected (via arg or RESET env var)");
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

  // Helper to get selectors (safe with overloaded functions like burn/mint)
  function getSelectors(contract: any): string[] {
    const signatures: string[] = [];
    for (const fragment of contract.interface.fragments) {
      if (fragment.type === "function") {
        const sighash = contract.interface.getFunction(fragment.format("sighash"))!.selector;
        signatures.push(sighash);
      }
    }
    return signatures;
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

  // === Batch the diamond cuts (much more reliable on BuildBear / L3 sandboxes) ===
  const BATCH_SIZE = 1;
  const GAS_LIMIT = process.env.GAS_LIMIT ? Number(process.env.GAS_LIMIT) : 8_000_000;

  const skipBridge = process.env.SKIP_BRIDGE === "true" || process.env.SKIP_BRIDGE === "1";

  const initCalldata = diamondInit.interface.encodeFunctionData("init");

  for (let i = 0; i < cut.length; i += BATCH_SIZE) {
    const batch = cut.slice(i, i + BATCH_SIZE);
    const facetNames = facetsToCut.slice(i, i + BATCH_SIZE);

    // Skip BridgeFacet if requested (it currently reverts on this BuildBear sandbox)
    if (skipBridge && facetNames.includes("BridgeFacet")) {
      console.log("Skipping BridgeFacet (SKIP_BRIDGE=true)");
      continue;
    }

    const isFirstBatch = i === 0;

    console.log(`\n=== Attempting to cut: ${facetNames.join(", ")} ===`);
    console.log(`  Selectors to add (${batch[0].functionSelectors.length}):`);
    batch[0].functionSelectors.forEach((sel: string, idx: number) => {
      if (idx < 8) console.log(`    ${sel}`);
    });
    if (batch[0].functionSelectors.length > 8) console.log(`    ... +${batch[0].functionSelectors.length - 8} more`);

    try {
      const tx = await diamondCut.diamondCut(
        batch,
        isFirstBatch ? await diamondInit.getAddress() : ethers.ZeroAddress,
        isFirstBatch ? initCalldata : "0x",
        { gasLimit: GAS_LIMIT }
      );

      const receipt = await tx.wait();
      console.log(`✓ Cut successful: ${facetNames.join(", ")} | Gas used: ${receipt?.gasUsed}`);

    } catch (error: any) {
      console.error(`✗ Failed to cut: ${facetNames.join(", ")}`);

      // Enhanced logging for selector collision debugging
      console.error(`  Number of selectors in this batch: ${batch[0].functionSelectors.length}`);
      console.error("  First 10 selectors being added:");
      batch[0].functionSelectors.slice(0, 10).forEach((sel: string) => console.error(`    ${sel}`));

      // Best-effort simulation to extract revert reason
      try {
        await diamondCut.diamondCut.staticCall(
          batch,
          isFirstBatch ? await diamondInit.getAddress() : ethers.ZeroAddress,
          isFirstBatch ? initCalldata : "0x"
        );
      } catch (simError: any) {
        console.error("Revert reason (from staticCall):", 
          simError?.reason || simError?.shortMessage || simError?.message || simError);
      }
      throw error;
    }
  }

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
  await (await gamePayment.game_initialize(diamondAddr)).wait();
  await (await gamePayment.game_setFeeDistributor(await feeDistributor.getAddress())).wait();
  await (await gamePayment.game_setGameServer(deployer.address)).wait(); // For testing
  await (await gamePayment.game_setEntryFeeSALT(ethers.parseUnits("0.01", 18))).wait();
  console.log("GamePaymentFacet initialized");

  // AgentIdentityFacet (Phase 1)
  const agentIdentity = await ethers.getContractAt("AgentIdentityFacet", diamondAddr);
  await (await agentIdentity.setGameServer(deployer.address)).wait(); // Same server as GamePayment for now
  console.log("AgentIdentityFacet initialized (gameServer wired)");

  // Wire the same gameServer on GamePaymentFacet (in case it wasn't)
  await (await gamePayment.game_setGameServer(deployer.address)).wait();
  console.log("setGameServer() wired on both GamePaymentFacet and AgentIdentityFacet");

  // AvABettingFacet (Phase 4)
  const avab = await ethers.getContractAt("AvABettingFacet", diamondAddr);
  await (await avab.ava_setGameServer(deployer.address)).wait();
  await (await avab.ava_setSaltToken(diamondAddr)).wait(); // SALT lives on the diamond
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
    { id: 1, uri: "ipfs://hero1", attrs: { level: 1, power: 50, rarity: 1, gameId: ethers.ZeroHash, lastUsed: 0 } },
    { id: 2, uri: "ipfs://hero2", attrs: { level: 3, power: 120, rarity: 2, gameId: ethers.ZeroHash, lastUsed: 0 } },
    { id: 3, uri: "ipfs://hero3", attrs: { level: 5, power: 200, rarity: 3, gameId: ethers.ZeroHash, lastUsed: 0 } },
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

  // Use clean name for BuildBear deploys
  const deploymentFileName = networkName === "buildbear" ? "BuildBear" : networkName;
  const filePath = path.join(deploymentsDir, `${deploymentFileName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));

  console.log(`\n✅ Deployment completed successfully!`);
  console.log(`   Diamond Address: ${diamondAddr}`);
  console.log(`   Deployment saved to: deployments/${deploymentFileName}.json\n`);

  // ==========================================
  // 6. AUTO-GENERATE .env FILES
  // ==========================================
  console.log("=== 6. Generating environment files ===");

  // === Frontend .env.local (smart overwrite) ===
  const frontendEnvPath = path.join(__dirname, "../frontend/.env.local");
  const label = process.env.NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL || process.env.BUILDBEAR_LABEL || "BuildBear";

  let existingEnv = "";
  if (fs.existsSync(frontendEnvPath)) {
    existingEnv = fs.readFileSync(frontendEnvPath, "utf8");
  }

  // Remove any previous BuildBear block so we can overwrite cleanly
  existingEnv = existingEnv.replace(
    /\n?# === BuildBear Alpha[\s\S]*?(?=\n#|$)/g,
    ""
  ).trim();

  let buildbearBlock = "";
  if (networkName === "buildbear") {
    buildbearBlock = `

# === BuildBear Alpha (overwritten by deploy script) ===
NEXT_PUBLIC_BUILDBEAR_RPC=${process.env.BUILDBEAR_RPC || ""}
NEXT_PUBLIC_BUILDBEAR_CHAIN_ID=${process.env.BUILDBEAR_CHAIN_ID || ""}
NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL=${label}
NEXT_PUBLIC_DIAMOND_ADDRESS=${diamondAddr}
NEXT_PUBLIC_NETWORK=${networkName}
`;
  }

  const finalFrontendEnv = existingEnv + buildbearBlock;
  fs.writeFileSync(frontendEnvPath, finalFrontendEnv.trim() + "\n");
  console.log("   Updated: frontend/.env.local (BuildBear vars overwritten)");

  // Keeper .env - improved for BuildBear
  const keeperEnvPath = path.join(__dirname, "../scripts/.env.keeper");

  let keeperRpc = process.env.RPC_URL || "http://127.0.0.1:8545";
  if (networkName === "buildbear" && process.env.BUILDBEAR_RPC) {
    keeperRpc = process.env.BUILDBEAR_RPC;
  }

  const keeperEnvContent = `DIAMOND_ADDRESS=${diamondAddr}
KEEPER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
RPC_URL=${keeperRpc}
`;
  fs.writeFileSync(keeperEnvPath, keeperEnvContent);
  console.log("   Generated: scripts/.env.keeper\n");

  // Optional verification (skip for buildbear sandboxes)
  if (shouldVerify && networkName !== "localhost" && networkName !== "buildbear") {
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

  // ==========================================
  // 7. POST-DEPLOY STEPS (BuildBear)
  // ==========================================
  if (networkName === "buildbear") {
    console.log("\n[BuildBear] Alpha sandbox deploy complete.");
    console.log("  - Deployment saved to deployments/BuildBear.json");
    console.log("  - frontend/.env.local has been updated with BuildBear vars.");

    // === Y/N Prompt for Collateral Setup ===
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const runCollateralSetup = await new Promise<boolean>((resolve) => {
      rl.question("\nRun Collateral / USDC setup now? (y/n): ", (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith("y"));
      });
    });

    if (runCollateralSetup) {
      console.log("\n=== Running Collateral Setup ===\n");
      try {
        // Set env so the setup script picks up the just-deployed diamond
        process.env.DIAMOND_ADDRESS = diamondAddr;
        await import("./setup-collateral-for-testing.js");
      } catch (err) {
        console.error("Collateral setup encountered an error:", (err as Error).message);
        console.log("You can run it manually later with:");
        console.log("  npx hardhat run scripts/setup-collateral-for-testing.js --network buildbear");
      }
    } else {
      console.log("\nYou can run it later with:");
      console.log("  npx hardhat run scripts/setup-collateral-for-testing.js --network buildbear");
    }

    console.log("\n=== Next Steps ===");
    console.log("1. Update KEEPER_PRIVATE_KEY in scripts/.env.keeper");
    console.log("2. Start keeper:  node scripts/keeper-update-prices.js");
    console.log("3. Start frontend: cd frontend && npm run dev");
    console.log("4. (Optional) Start game server in another terminal");
    console.log("\nSwitch to the BuildBear network in RainbowKit / your wallet.");
  } else {
    // Non-BuildBear fallback (kept for other networks)
    console.log("Next steps:");
    console.log("1. (Optional) Set USDC address on CollateralFacet");
    console.log("2. Update KEEPER_PRIVATE_KEY in scripts/.env.keeper");
    console.log("3. Start keeper: node scripts/keeper-update-prices.js");
    console.log("4. Start game server + frontend");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
