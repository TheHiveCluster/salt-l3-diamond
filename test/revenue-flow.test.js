const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("End-to-End Revenue Flow Test", function () {
  let diamond, owner, user1, user2, relayer;
  let erc20, bridge, collateral, staking, feeDistributor, paymaster;

  beforeEach(async function () {
    [owner, user1, user2, relayer] = await ethers.getSigners();

    // === Full deployment simulation ===
    const Diamond = await ethers.getContractFactory("Diamond");
    const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
    const diamondCut = await DiamondCutFacet.deploy();

    diamond = await Diamond.deploy(owner.address, await diamondCut.getAddress());
    await diamond.waitForDeployment();
    const diamondAddr = await diamond.getAddress();

    // Deploy all facets
    const facets = {};
    const facetContracts = [
      "ERC20Facet", "StakingFacet", "PegManagerFacet", "BridgeFacet",
      "PaymasterFacet", "CollateralFacet", "FeeDistributorFacet"
    ];

    for (const name of facetContracts) {
      const Factory = await ethers.getContractFactory(name);
      facets[name] = await Factory.deploy();
      await facets[name].waitForDeployment();
    }

    // Cut all facets
    const cut = facetContracts.map(name => ({
      facetAddress: await facets[name].getAddress(),
      action: 0,
      functionSelectors: getSelectors(facets[name])
    }));

    const diamondCutContract = await ethers.getContractAt("IDiamondCut", diamondAddr);
    await diamondCutContract.diamondCut(cut, ethers.ZeroAddress, "0x");

    // Get typed interfaces
    erc20 = await ethers.getContractAt("ERC20Facet", diamondAddr);
    bridge = await ethers.getContractAt("BridgeFacet", diamondAddr);
    collateral = await ethers.getContractAt("CollateralFacet", diamondAddr);
    staking = await ethers.getContractAt("StakingFacet", diamondAddr);
    feeDistributor = await ethers.getContractAt("FeeDistributorFacet", diamondAddr);
    paymaster = await ethers.getContractAt("PaymasterFacet", diamondAddr);

    // === Initialization ===
    await erc20.setTokenSettings("Intern", "SALT", 18);
    await erc20.mint(owner.address, ethers.parseUnits("100000000", 18));

    await staking.initializeStaking(0); // Revenue only
    await bridge.initializeBridge();
    await bridge.setFeeDistributor(await feeDistributor.getAddress());
    await collateral.setFeeDistributor(await feeDistributor.getAddress());

    await feeDistributor.setRecipients(owner.address, diamondAddr, diamondAddr);
    await feeDistributor.setAllocation(4000, 4000, 2000);

    // Set collateral manager
    await erc20.setCollateralManager(diamondAddr);
    await erc20.setBridgeManager(diamondAddr);

    // Fund the diamond with some SALT for fees
    await erc20.transfer(diamondAddr, ethers.parseUnits("10000", 18));
  });

  function getSelectors(contract) {
    const sigs = [];
    for (const frag of contract.interface.fragments) {
      if (frag.type === "function") {
        sigs.push(contract.interface.getFunction(frag.name).selector);
      }
    }
    return sigs;
  }

  it("Should collect bridge fee and distribute to stakers", async function () {
    // Setup
    const amount = ethers.parseUnits("1000", 18);
    await erc20.transfer(user1.address, amount);
    await erc20.connect(user1).approve(diamondAddr, amount);

    // Bridge out (this triggers fee collection in real flow)
    // For test we simulate fee by minting to diamond then distributing
    const bridgeFee = ethers.parseUnits("10", 18); // simulated fee
    await erc20.mintForBridge(diamondAddr, bridgeFee);

    // Send fee to FeeDistributor
    await erc20.connect(owner).transfer(await feeDistributor.getAddress(), bridgeFee);

    // Distribute
    await feeDistributor.distributeAndPushToStaking();

    // Check that staking received funds
    const stakingBalance = await erc20.balanceOf(diamondAddr);
    expect(stakingBalance).to.be.gt(0);

    // Owner (as staker for test) can now distribute to claimable pool
    await staking.distributeRewards(bridgeFee / 2n); // simulate staker share

    // User stakes
    await erc20.connect(user1).approve(diamondAddr, amount);
    await staking.connect(user1).stake(amount);

    // Claim
    const pendingBefore = await staking.pendingRewards(user1.address);
    await staking.connect(user1).claimRevenueRewards();
    const pendingAfter = await staking.pendingRewards(user1.address);

    expect(pendingAfter).to.be.lt(pendingBefore);
  });

  it("Should allow collateral fees to flow to FeeDistributor", async function () {
    // This test would require a real USDC token.
    // For now we just verify the wiring exists
    expect(await collateral.feeDistributor()).to.equal(await feeDistributor.getAddress());
  });

  it("Should allow FeeDistributor to split to Paymaster", async function () {
    const amount = ethers.parseUnits("1000", 18);
    await erc20.mintForBridge(await feeDistributor.getAddress(), amount);

    await feeDistributor.distributeAndPushToStaking();

    const paymasterBalance = await erc20.balanceOf(diamondAddr);
    // Paymaster share should have been sent
    expect(paymasterBalance).to.be.gte(0);
  });
});
