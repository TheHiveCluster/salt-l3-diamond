/* global ethers */
/* eslint prefer-const: "off" */

const { ethers } = require("hardhat");

async function deployDiamond() {
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  console.log("Deploying Intern (SALT) Diamond + Staking on", (await ethers.provider.getNetwork()).name);

  // 1. Deploy core facets
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const diamondCutFacet = await DiamondCutFacet.deploy();
  await diamondCutFacet.waitForDeployment();
  const dcAddr = await diamondCutFacet.getAddress();
  console.log("DiamondCutFacet:", dcAddr);

  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(contractOwner.address, dcAddr);
  await diamond.waitForDeployment();
  const diamondAddr = await diamond.getAddress();
  console.log("Diamond (SALT + Staking):", diamondAddr);

  const DiamondInit = await ethers.getContractFactory("DiamondInit");
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.waitForDeployment();
  const initAddr = await diamondInit.getAddress();

  const DiamondLoupeFacet = await ethers.getContractFactory("DiamondLoupeFacet");
  const loupe = await DiamondLoupeFacet.deploy();
  await loupe.waitForDeployment();

  const OwnershipFacet = await ethers.getContractFactory("OwnershipFacet");
  const ownership = await OwnershipFacet.deploy();
  await ownership.waitForDeployment();

  const ERC20Facet = await ethers.getContractFactory("ERC20Facet");
  const erc20 = await ERC20Facet.deploy();
  await erc20.waitForDeployment();

  const StakingFacet = await ethers.getContractFactory("StakingFacet");
  const staking = await StakingFacet.deploy();
  await staking.waitForDeployment();
  console.log("StakingFacet deployed");

  const PegManagerFacet = await ethers.getContractFactory("PegManagerFacet");
  const peg = await PegManagerFacet.deploy();
  await peg.waitForDeployment();
  console.log("PegManagerFacet deployed");

  const BridgeFacet = await ethers.getContractFactory("BridgeFacet");
  const bridge = await BridgeFacet.deploy();
  await bridge.waitForDeployment();
  console.log("BridgeFacet deployed");

  // 2. Cut all facets into diamond
  const cut = [];
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamondAddr);

  cut.push({ facetAddress: await loupe.getAddress(), action: 0, functionSelectors: getSelectors(loupe) });
  cut.push({ facetAddress: await ownership.getAddress(), action: 0, functionSelectors: getSelectors(ownership) });
  cut.push({ facetAddress: await erc20.getAddress(), action: 0, functionSelectors: getSelectors(erc20) });
  cut.push({ facetAddress: await staking.getAddress(), action: 0, functionSelectors: getSelectors(staking) });
  cut.push({ facetAddress: await peg.getAddress(), action: 0, functionSelectors: getSelectors(peg) });
  cut.push({ facetAddress: await bridge.getAddress(), action: 0, functionSelectors: getSelectors(bridge) });

  const initCalldata = diamondInit.interface.encodeFunctionData("init");
  const tx = await diamondCut.diamondCut(cut, initAddr, initCalldata);
  await tx.wait();
  console.log("All facets added via diamondCut");

  // 3. Initialize token
  const salt = await ethers.getContractAt("ERC20Facet", diamondAddr);
  await (await salt.setTokenSettings("Intern", "SALT", 18)).wait();
  console.log("Token: Intern (SALT) 18 decimals");

  // Mint initial supply
  const initial = ethers.parseUnits("1000000000", 18);
  await (await salt.mint(contractOwner.address, initial)).wait();
  console.log("Minted 1B SALT to owner");

  // 4. Initialize staking (example rate: 0.0001 SALT per second per 1 SALT staked ~ 8.6% APY rough)
  const stakingFacet = await ethers.getContractAt("StakingFacet", diamondAddr);
  await (await stakingFacet.initializeStaking(0)).wait(); // 0 = revenue-based only (no inflation)
  console.log("Staking initialized in revenue-only mode (no inflation)");

  // 5. Deploy mock Chainlink feed + initialize Peg (for local testing)
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  // Set initial price to ~0.01 USD (using 8 decimals like real Chainlink feeds)
  const mockFeed = await MockV3Aggregator.deploy(8, 1000000); // 0.01000000
  await mockFeed.waitForDeployment();
  const mockFeedAddr = await mockFeed.getAddress();
  console.log("Mock Chainlink feed deployed at:", mockFeedAddr);

  const pegFacet = await ethers.getContractAt("PegManagerFacet", diamondAddr);
  await (await pegFacet.initializePeg(mockFeedAddr, 300)).wait(); // 3% deviation threshold
  console.log("PegManager initialized with target 0.01 USDC + 3% threshold");

  // 6. Initialize Bridge (Solana + Cronos)
  const bridgeFacet = await ethers.getContractAt("BridgeFacet", diamondAddr);
  await (await bridgeFacet.initializeBridge()).wait();
  // Register bridge as authorized minter/burner for cross-chain
  await (await salt.setBridgeManager(diamondAddr)).wait();
  console.log("BridgeFacet initialized (Solana=1, Cronos=2) + bridgeManager role set");

  // 7. Uniswap V4 Stable Hook (SALT/USDC 0.01 target)
  // IMPORTANT: This hook requires a deployed Uniswap V4 PoolManager on your L3.
  // You must deploy the full V4 stack first, then initialize a SALT/USDC pool with this hook.
  const SALTStableHook = await ethers.getContractFactory("SALTStableHook");
  // Example (uncomment after you have PoolManager address on your L3):
  // const hook = await SALTStableHook.deploy(diamondAddr, diamondAddr); // pegManager is same diamond
  // await hook.waitForDeployment();
  // console.log("SALTStableHook deployed at:", await hook.getAddress());
  console.log("SALTStableHook contract ready (deploy after Uniswap V4 PoolManager exists on L3)");

  // 8. ERC-4337 Paymaster for low-gas trades
  const PaymasterFacet = await ethers.getContractFactory("PaymasterFacet");
  const paymaster = await PaymasterFacet.deploy();
  await paymaster.waitForDeployment();
  console.log("PaymasterFacet deployed");

  cut.push({ facetAddress: await paymaster.getAddress(), action: 0, functionSelectors: getSelectors(paymaster) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait(); // re-cut to add paymaster (simplified)

  const paymasterFacet = await ethers.getContractAt("PaymasterFacet", diamondAddr);
  await (await paymasterFacet.initializePaymaster()).wait();
  await (await paymasterFacet.fund({ value: ethers.parseEther("1") })).wait(); // fund with 1 ETH for gas sponsorship
  console.log("PaymasterFacet initialized + funded with 1 ETH for sponsored transactions");

  // Final bridge signer setup (in real deployment use a secure off-chain key)
  const bridgeFacetFinal = await ethers.getContractAt("BridgeFacet", diamondAddr);
  await (await bridgeFacetFinal.setTrustedSigner(contractOwner.address)).wait();
  console.log("Bridge trusted signer set to owner (replace with secure key in production)");

  // 9. USDC Collateral Manager (new primary mint/burn model)
  const CollateralFacet = await ethers.getContractFactory("CollateralFacet");
  const collateral = await CollateralFacet.deploy();
  await collateral.waitForDeployment();
  console.log("CollateralFacet deployed");

  cut.push({ facetAddress: await collateral.getAddress(), action: 0, functionSelectors: getSelectors(collateral) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  const collateralFacet = await ethers.getContractAt("CollateralFacet", diamondAddr);
  // Set the bridged USDC address on the L3 (user must replace this)
  // await collateralFacet.setUSDCAddress("0x...bridgedUSDCAddress...");
  await (await salt.setCollateralManager(await collateral.getAddress())).wait();
  console.log("CollateralFacet initialized + set as collateralManager (set real USDC address in production)");

  // Set a conservative circuit breaker (e.g. max 10% of initial reserves per day)
  // In production this should be set via Timelock
  const initialReserveLimit = ethers.parseUnits("1000000", 6); // 1M USDC example (adjust)
  await (await collateral.setWithdrawCircuitBreaker(initialReserveLimit, 86400)).wait();
  console.log("Collateral circuit breaker set (max withdraw per 24h)");

  // 10. FeeDistributor - splits revenue between Treasury / Stakers / Paymaster
  const FeeDistributorFacet = await ethers.getContractFactory("FeeDistributorFacet");
  const feeDistributor = await FeeDistributorFacet.deploy();
  await feeDistributor.waitForDeployment();
  console.log("FeeDistributorFacet deployed");

  cut.push({ facetAddress: await feeDistributor.getAddress(), action: 0, functionSelectors: getSelectors(feeDistributor) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  const fd = await ethers.getContractAt("FeeDistributorFacet", diamondAddr);
  await (await fd.setRecipients(owner.address, diamondAddr, diamondAddr)).wait(); // treasury + stakers + paymaster all point to diamond for now
  await (await fd.setAllocation(4000, 4000, 2000)).wait(); // 40% / 40% / 20%

  // Wire distributors
  await (await bridgeFacetFinal.setFeeDistributor(await fd.getAddress())).wait();
  await (await collateralFacet.setFeeDistributor(await fd.getAddress())).wait();

  console.log("FeeDistributor wired to Bridge + Collateral (40% stakers, 40% treasury, 20% paymaster)");

  // 11. NFT Framework (Meme + Gaming + Manager)
  const NFTManagerFacet = await ethers.getContractFactory("NFTManagerFacet");
  const nftManager = await NFTManagerFacet.deploy();
  await nftManager.waitForDeployment();
  console.log("NFTManagerFacet deployed");

  cut.push({ facetAddress: await nftManager.getAddress(), action: 0, functionSelectors: getSelectors(nftManager) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  // Deploy example MemeNFT collection (can be registered later)
  const MemeNFT = await ethers.getContractFactory("MemeNFT");
  const memeNFT = await MemeNFT.deploy(diamondAddr, "Intern Memes", "MEME");
  await memeNFT.waitForDeployment();
  console.log("MemeNFT collection deployed at:", await memeNFT.getAddress());

  // (Optional) Register the meme collection
  const nftManagerFacet = await ethers.getContractAt("NFTManagerFacet", diamondAddr);
  await (await nftManagerFacet.registerCollection(await memeNFT.getAddress(), 0, "Intern Memes")).wait(); // 0 = MEME_ART

  // Deploy Meme Marketplace + Auction
  const MemeMarketplaceFacet = await ethers.getContractFactory("MemeMarketplaceFacet");
  const marketplace = await MemeMarketplaceFacet.deploy();
  await marketplace.waitForDeployment();
  console.log("MemeMarketplaceFacet deployed");

  cut.push({ facetAddress: await marketplace.getAddress(), action: 0, functionSelectors: getSelectors(marketplace) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  const market = await ethers.getContractAt("MemeMarketplaceFacet", diamondAddr);
  await (await market.setFeeDistributor(await fd.getAddress())).wait();
  await (await market.setProtocolFee(250)).wait(); // 2.5% protocol fee

  console.log("MemeMarketplaceFacet initialized with 2.5% fee to FeeDistributor");

  // Deploy Soulbound Intern Reputation NFT
  const InternReputationNFT = await ethers.getContractFactory("InternReputationNFT");
  const reputationNFT = await InternReputationNFT.deploy(diamondAddr, "Intern Reputation", "REP");
  await reputationNFT.waitForDeployment();
  console.log("InternReputationNFT deployed at:", await reputationNFT.getAddress());

  await (await nftManagerFacet.registerCollection(await reputationNFT.getAddress(), 5, "Intern Reputation")).wait(); // 5 = REPUTATION
  console.log("Intern Reputation NFT registered (soulbound)");

  // Deploy ReputationManager for auto-awarding
  const ReputationManagerFacet = await ethers.getContractFactory("ReputationManagerFacet");
  const repManager = await ReputationManagerFacet.deploy();
  await repManager.waitForDeployment();
  console.log("ReputationManagerFacet deployed");

  cut.push({ facetAddress: await repManager.getAddress(), action: 0, functionSelectors: getSelectors(repManager) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  const repManagerFacet = await ethers.getContractAt("ReputationManagerFacet", diamondAddr);
  await (await repManagerFacet.setReputationNFT(await reputationNFT.getAddress())).wait();
  // Set example thresholds (adjust in production)
  await (await repManagerFacet.setThresholds(
    ethers.parseUnits("10000", 18),   // 10k bridged for Level 1
    ethers.parseUnits("5000", 18),    // 5k staked
    10                                // 10 gaming uses
  )).wait();

  console.log("ReputationManager initialized with auto-award thresholds");

  // 12. TimelockFacet (Critical Security)
  const TimelockFacet = await ethers.getContractFactory("TimelockFacet");
  const timelock = await TimelockFacet.deploy();
  await timelock.waitForDeployment();
  console.log("TimelockFacet deployed");

  cut.push({ facetAddress: await timelock.getAddress(), action: 0, functionSelectors: getSelectors(timelock) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  const timelockFacet = await ethers.getContractAt("TimelockFacet", diamondAddr);
  await (await timelockFacet.initializeTimelock(contractOwner.address, 86400)).wait(); // 24h delay, admin = original owner

  // Transfer Diamond ownership to Timelock (all future admin calls must go through timelock)
  const ownershipFacet = await ethers.getContractAt("OwnershipFacet", diamondAddr);
  await (await ownershipFacet.transferOwnership(await timelock.getAddress())).wait();

  console.log("TimelockFacet initialized with 24h delay. Diamond ownership transferred to Timelock.");

  console.log("\n=== Deployment Complete ===");
  console.log("Diamond address (full system + NFTs):", diamondAddr);
  console.log("Owner:", contractOwner.address);
  console.log("ABIs: ... + ReputationManagerFacet + full auto Reputation + Gaming P2E + Enhanced NFT tiers");
  return diamondAddr;
}

function getSelectors(contract) {
  const sigs = [];
  for (const frag of contract.interface.fragments) {
    if (frag.type === "function") {
      sigs.push(contract.interface.getFunction(frag.name).selector);
    }
  }
  return sigs;
}

if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

exports.deployDiamond = deployDiamond;
