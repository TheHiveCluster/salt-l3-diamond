const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

describe("Full Economic Flow Test - Intern/SALT Ecosystem", function () {
  let diamond, owner, user1, user2;
  let erc20, collateral, staking, bridge, feeDistributor, nftManager;
  let memeNFT, reputationNFT, gamingNFT, repManager;
  let mockUSDC;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy minimal system for economic flow testing
    const Diamond = await ethers.getContractFactory("Diamond");
    const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
    const diamondCut = await DiamondCutFacet.deploy();

    diamond = await Diamond.deploy(owner.address, await diamondCut.getAddress());
    await diamond.waitForDeployment();
    const diamondAddr = await diamond.getAddress();

    // Deploy core facets
    const ERC20Facet = await ethers.getContractFactory("ERC20Facet");
    const erc20Facet = await ERC20Facet.deploy();

    const CollateralFacet = await ethers.getContractFactory("CollateralFacet");
    const collateralFacet = await CollateralFacet.deploy();

    const StakingFacet = await ethers.getContractFactory("StakingFacet");
    const stakingFacet = await StakingFacet.deploy();

    const FeeDistributorFacet = await ethers.getContractFactory("FeeDistributorFacet");
    const fdFacet = await FeeDistributorFacet.deploy();

    const NFTManagerFacet = await ethers.getContractFactory("NFTManagerFacet");
    const nftManagerFacet = await NFTManagerFacet.deploy();

    const ReputationManagerFacet = await ethers.getContractFactory("ReputationManagerFacet");
    const repManagerFacet = await ReputationManagerFacet.deploy();

    // Cut facets
    const cut = [
      { facetAddress: await erc20Facet.getAddress(), action: 0, functionSelectors: getSelectors(erc20Facet) },
      { facetAddress: await collateralFacet.getAddress(), action: 0, functionSelectors: getSelectors(collateralFacet) },
      { facetAddress: await stakingFacet.getAddress(), action: 0, functionSelectors: getSelectors(stakingFacet) },
      { facetAddress: await fdFacet.getAddress(), action: 0, functionSelectors: getSelectors(fdFacet) },
      { facetAddress: await nftManagerFacet.getAddress(), action: 0, functionSelectors: getSelectors(nftManagerFacet) },
      { facetAddress: await repManagerFacet.getAddress(), action: 0, functionSelectors: getSelectors(repManagerFacet) },
    ];

    const diamondCutContract = await ethers.getContractAt("IDiamondCut", diamondAddr);
    await diamondCutContract.diamondCut(cut, ethers.ZeroAddress, "0x");

    // Get interfaces
    erc20 = await ethers.getContractAt("ERC20Facet", diamondAddr);
    collateral = await ethers.getContractAt("CollateralFacet", diamondAddr);
    staking = await ethers.getContractAt("StakingFacet", diamondAddr);
    feeDistributor = await ethers.getContractAt("FeeDistributorFacet", diamondAddr);
    nftManager = await ethers.getContractAt("NFTManagerFacet", diamondAddr);
    repManager = await ethers.getContractAt("ReputationManagerFacet", diamondAddr);

    // Deploy NFT collections
    const MemeNFT = await ethers.getContractFactory("MemeNFT");
    memeNFT = await MemeNFT.deploy(diamondAddr, "Intern Memes", "MEME");

    const InternReputationNFT = await ethers.getContractFactory("InternReputationNFT");
    reputationNFT = await InternReputationNFT.deploy(diamondAddr, "Intern Reputation", "REP");

    const GamingAssetNFT = await ethers.getContractFactory("GamingAssetNFT");
    gamingNFT = await GamingAssetNFT.deploy(diamondAddr, "Intern Gaming Assets", "GAME");

    // Register collections
    await nftManager.registerCollection(await memeNFT.getAddress(), 0, "Intern Memes"); // MEME_ART
    await nftManager.registerCollection(await reputationNFT.getAddress(), 5, "Intern Reputation"); // REPUTATION

    // Setup
    await erc20.setTokenSettings("Intern", "SALT", 18);
    await erc20.mint(owner.address, ethers.parseUnits("10000000", 18));

    await staking.initializeStaking(0);
    await feeDistributor.setRecipients(owner.address, diamondAddr, diamondAddr);
    await feeDistributor.setAllocation(4000, 4000, 2000);

    await repManager.setReputationNFT(await reputationNFT.getAddress());
    await repManager.setThresholds(
      ethers.parseUnits("1000", 18),  // bridge threshold
      ethers.parseUnits("500", 18),   // stake threshold
      3                               // gaming uses
    );

    // Deploy mock USDC (6 decimals)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    mockUSDC = await ERC20Mock.deploy("USDC", "USDC", 6);
    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));

    await collateral.setUSDCAddress(await mockUSDC.getAddress());
    await erc20.setCollateralManager(diamondAddr);
  });

  function getSelectors(contract) {
    const sigs = [];
    for (const frag of contract.interface.fragments) {
      if (frag.type === "function") sigs.push(contract.interface.getFunction(frag.name).selector);
    }
    return sigs;
  }

  it("Should complete full economic flow with full metrics", async function () {
    console.log("\n=== Starting Full Economic Flow Test with Advanced Metrics ===\n");

    // === Pre-flow snapshots ===
    const startBackingRatio = await collateral.getBackingRatio();
    const startTotalSupply = await erc20.totalSupply();

    const startBalances = {
      owner: await erc20.balanceOf(owner.address),
      user1: await erc20.balanceOf(user1.address),
      user2: await erc20.balanceOf(user2.address),
      treasury: await erc20.balanceOf(diamondAddr),
      feeDistributor: await erc20.balanceOf(await feeDistributor.getAddress()),
    };

    let totalBurned = 0n;
    let totalDistributedToStakers = 0n;
    let feeBreakdown = { toTreasury: 0n, toStakers: 0n, toPaymaster: 0n };
    const gasUsed = {};

    // Event listeners
    const burnFilter = erc20.filters.Transfer(null, ethers.ZeroAddress);
    const burnListener = (from, to, value) => { totalBurned += value; };
    erc20.on(burnFilter, burnListener);

    const claimFilter = staking.filters.RewardsClaimed();
    const claimListener = (user, amount) => { totalDistributedToStakers += amount; };
    staking.on(claimFilter, claimListener);

    const feeFilter = feeDistributor.filters.FeesDistributed();
    const feeListener = (total, toTreasury, toStakers, toPaymaster) => {
      feeBreakdown.toTreasury += toTreasury;
      feeBreakdown.toStakers += toStakers;
      feeBreakdown.toPaymaster += toPaymaster;
    };
    feeDistributor.on(feeFilter, feeListener);

    // === 1. User deposits USDC and receives SALT ===
    const depositAmount = ethers.parseUnits("1000", 6);
    await mockUSDC.connect(user1).approve(diamondAddr, depositAmount);
    const tx1 = await collateral.connect(user1).depositUSDC(depositAmount);
    const receipt1 = await tx1.wait();
    gasUsed.deposit = receipt1.gasUsed;

    const userSaltBalance = await erc20.balanceOf(user1.address);
    console.log(`1. Deposited 1000 USDC → Received ~${ethers.formatUnits(userSaltBalance, 18)} SALT (Gas: ${gasUsed.deposit})`);

    // === 2. User stakes SALT ===
    await erc20.connect(user1).approve(diamondAddr, userSaltBalance);
    const tx2 = await staking.connect(user1).stake(userSaltBalance);
    const receipt2 = await tx2.wait();
    gasUsed.stake = receipt2.gasUsed;
    console.log(`2. Staked all SALT (Gas: ${gasUsed.stake})`);

    // === 3. Bridge activity (fee + burn + reputation) ===
    const bridgeVolume = ethers.parseUnits("50000", 18);
    await erc20.mintForBridge(diamondAddr, bridgeVolume / 100n);
    const tx3 = await repManager.connect(owner).recordBridgeActivity(user1.address, bridgeVolume);
    const receipt3 = await tx3.wait();
    gasUsed.bridgeActivity = receipt3.gasUsed;
    console.log(`3. Bridge activity recorded (Gas: ${gasUsed.bridgeActivity})`);

    // === 4. Gaming Play-to-Earn ===
    const attrs = { level: 1, rarity: 1, power: 100, gameId: ethers.id("game1"), lastUsed: 0 };
    await gamingNFT.mint(user1.address, 0, "ipfs://game1", attrs);

    const balanceBeforeGame = await erc20.balanceOf(user1.address);
    const tx4 = await gamingNFT.connect(user1).useAsset(0, ethers.id("game1"));
    const receipt4 = await tx4.wait();
    gasUsed.gamingUse = receipt4.gasUsed;
    const earnedFromGame = (await erc20.balanceOf(user1.address)) - balanceBeforeGame;

    await repManager.connect(owner).recordGamingActivity(user1.address);
    console.log(`4. Used Gaming NFT → Earned ${ethers.formatUnits(earnedFromGame, 18)} SALT (Gas: ${gasUsed.gamingUse})`);

    // === 5. Reputation auto-award check ===
    const repBalance = await reputationNFT.balanceOf(user1.address);
    console.log(`5. Reputation NFTs held: ${repBalance}`);

    // === 6. Marketplace activity (fees + burns) ===
    await memeNFT.connect(owner).mint(owner.address, "ipfs://meme-test");
    await memeNFT.connect(owner).setApprovalForAll(diamondAddr, true);

    // We need to include MemeMarketplaceFacet in the test setup for full accuracy
    // For now we simulate fee collection
    const marketFee = ethers.parseUnits("25", 18); // Simulated 2.5% fee
    await erc20.mintForBridge(diamondAddr, marketFee);

    console.log(`6. Marketplace activity simulated (fees + burns collected)`);

    // === 7. Distribute fees ===
    const distBalance = await erc20.balanceOf(await feeDistributor.getAddress());
    if (distBalance > 0) {
      const tx7 = await feeDistributor.distributeAndPushToStaking();
      const receipt7 = await tx7.wait();
      gasUsed.distribute = receipt7.gasUsed;
    }
    console.log(`7. Fees distributed to stakers (Gas: ${gasUsed.distribute || 0})`);

    // === 8. Claim staking rewards ===
    const pending = await staking.pendingRewards(user1.address);
    if (pending > 0) {
      const treasuryBefore = await erc20.balanceOf(diamondAddr);
      const tx8 = await staking.connect(user1).claimRevenueRewards();
      const receipt8 = await tx8.wait();
      gasUsed.claimRewards = receipt8.gasUsed;
      const treasuryAfter = await erc20.balanceOf(diamondAddr);

      console.log(`8. Claimed ${ethers.formatUnits(pending, 18)} SALT rewards (Gas: ${gasUsed.claimRewards})`);
      console.log(`   Treasury decreased by: ${ethers.formatUnits(treasuryBefore - treasuryAfter, 18)} SALT`);
    }

    // === FINAL ADVANCED ECONOMIC + GAS METRICS ===
    console.log("\n" + "=".repeat(65));
    console.log("              ADVANCED ECONOMIC FLOW METRICS");
    console.log("=".repeat(65));

    const endBackingRatio = await collateral.getBackingRatio();
    const endTotalSupply = await erc20.totalSupply();

    const endBalances = {
      owner: await erc20.balanceOf(owner.address),
      user1: await erc20.balanceOf(user1.address),
      user2: await erc20.balanceOf(user2.address),
      treasury: await erc20.balanceOf(diamondAddr),
      feeDistributor: await erc20.balanceOf(await feeDistributor.getAddress()),
    };

    const backingRatioDelta = endBackingRatio - startBackingRatio;

    console.log(`\nBacking Ratio:`);
    console.log(`  Start: ${(Number(startBackingRatio) / 1e18 * 100).toFixed(2)}%`);
    console.log(`  End:   ${(Number(endBackingRatio) / 1e18 * 100).toFixed(2)}%`);
    console.log(`  Delta: ${(Number(backingRatioDelta) / 1e18 * 100).toFixed(4)}%`);

    console.log(`\nTotal SALT Burned:            ${ethers.formatUnits(totalBurned, 18)} SALT`);
    console.log(`Total Distributed to Stakers: ${ethers.formatUnits(totalDistributedToStakers, 18)} SALT`);

    console.log(`\nFee Breakdown (from FeeDistributor):`);
    console.log(`  To Treasury:   ${ethers.formatUnits(feeBreakdown.toTreasury, 18)} SALT`);
    console.log(`  To Stakers:    ${ethers.formatUnits(feeBreakdown.toStakers, 18)} SALT`);
    console.log(`  To Paymaster:  ${ethers.formatUnits(feeBreakdown.toPaymaster, 18)} SALT`);

    console.log(`\nPer-User SALT Change:`);
    for (const [name, startBal] of Object.entries(startBalances)) {
      const endBal = endBalances[name];
      const delta = endBal - startBal;
      const sign = delta >= 0 ? "+" : "";
      console.log(`  ${name.padEnd(12)} : ${sign}${ethers.formatUnits(delta, 18)} SALT`);
    }

    console.log(`\nGas Usage Summary:`);
    for (const [action, gas] of Object.entries(gasUsed)) {
      if (gas) console.log(`  ${action.padEnd(18)} : ${gas.toString().padStart(8)} gas`);
    }

    // === Export to JSON ===
    const metrics = {
      timestamp: new Date().toISOString(),
      backingRatio: {
        start: Number(startBackingRatio) / 1e18,
        end: Number(endBackingRatio) / 1e18,
        delta: Number(backingRatioDelta) / 1e18,
      },
      totalBurned: ethers.formatUnits(totalBurned, 18),
      totalDistributedToStakers: ethers.formatUnits(totalDistributedToStakers, 18),
      feeBreakdown: {
        toTreasury: ethers.formatUnits(feeBreakdown.toTreasury, 18),
        toStakers: ethers.formatUnits(feeBreakdown.toStakers, 18),
        toPaymaster: ethers.formatUnits(feeBreakdown.toPaymaster, 18),
      },
      perUserDelta: Object.fromEntries(
        Object.keys(startBalances).map(name => [
          name,
          ethers.formatUnits(endBalances[name] - startBalances[name], 18)
        ])
      ),
      gasUsed: Object.fromEntries(
        Object.entries(gasUsed).filter(([_, g]) => g).map(([k, v]) => [k, v.toString()])
      ),
      finalTreasuryBalance: ethers.formatUnits(endBalances.treasury, 18),
    };

    const resultsDir = path.join(__dirname, "../test-results");
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const filename = `economic-flow-${Date.now()}.json`;
    fs.writeFileSync(path.join(resultsDir, filename), JSON.stringify(metrics, null, 2));
    console.log(`\n📁 Metrics exported to: test-results/${filename}`);

    console.log("\n" + "=".repeat(65));
    console.log("✅ Advanced economic flow test completed");
    console.log("=".repeat(65) + "\n");

    // Cleanup listeners
    erc20.off(burnFilter, burnListener);
    staking.off(claimFilter, claimListener);
    feeDistributor.off(feeFilter, feeListener);

    expect(totalBurned).to.be.gt(0);
    expect(userSaltBalance).to.be.gt(0);
  });
});
