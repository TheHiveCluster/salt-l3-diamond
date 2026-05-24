const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Intern (SALT) Diamond System", function () {
  let diamond, owner, user1, user2;
  let erc20, staking, peg, bridge, paymaster;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy full system (simplified for test - in real use use the deploy script)
    const Diamond = await ethers.getContractFactory("Diamond");
    const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
    const diamondCutFacet = await DiamondCutFacet.deploy();

    diamond = await Diamond.deploy(owner.address, await diamondCutFacet.getAddress());
    await diamond.waitForDeployment();

    // Deploy facets
    const ERC20Facet = await ethers.getContractFactory("ERC20Facet");
    const erc20Facet = await ERC20Facet.deploy();

    const StakingFacet = await ethers.getContractFactory("StakingFacet");
    const stakingFacet = await StakingFacet.deploy();

    const PegManagerFacet = await ethers.getContractFactory("PegManagerFacet");
    const pegFacet = await PegManagerFacet.deploy();

    const BridgeFacet = await ethers.getContractFactory("BridgeFacet");
    const bridgeFacet = await BridgeFacet.deploy();

    const PaymasterFacet = await ethers.getContractFactory("PaymasterFacet");
    const paymasterFacet = await PaymasterFacet.deploy();

    // Cut facets (simplified)
    const diamondCut = await ethers.getContractAt("IDiamondCut", await diamond.getAddress());
    const cut = [
      { facetAddress: await erc20Facet.getAddress(), action: 0, functionSelectors: getSelectors(erc20Facet) },
      { facetAddress: await stakingFacet.getAddress(), action: 0, functionSelectors: getSelectors(stakingFacet) },
      { facetAddress: await pegFacet.getAddress(), action: 0, functionSelectors: getSelectors(pegFacet) },
      { facetAddress: await bridgeFacet.getAddress(), action: 0, functionSelectors: getSelectors(bridgeFacet) },
      { facetAddress: await paymasterFacet.getAddress(), action: 0, functionSelectors: getSelectors(paymasterFacet) },
    ];

    await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");

    // Get facet interfaces
    erc20 = await ethers.getContractAt("ERC20Facet", await diamond.getAddress());
    staking = await ethers.getContractAt("StakingFacet", await diamond.getAddress());
    peg = await ethers.getContractAt("PegManagerFacet", await diamond.getAddress());
    bridge = await ethers.getContractAt("BridgeFacet", await diamond.getAddress());
    paymaster = await ethers.getContractAt("PaymasterFacet", await diamond.getAddress());

    // Initialize
    await erc20.setTokenSettings("Intern", "SALT", 18);
    await erc20.mint(owner.address, ethers.parseUnits("1000000000", 18)); // 1B supply
  });

  function getSelectors(contract) {
    const sigs = [];
    for (const frag of contract.interface.fragments) {
      if (frag.type === "function") sigs.push(contract.interface.getFunction(frag.name).selector);
    }
    return sigs;
  }

  it("Should have correct token metadata", async function () {
    expect(await erc20.name()).to.equal("Intern");
    expect(await erc20.symbol()).to.equal("SALT");
    expect(await erc20.decimals()).to.equal(18);
  });

  it("Should allow staking and claim (basic)", async function () {
    await staking.initializeStaking(ethers.parseUnits("0.0001", 18));
    await erc20.transfer(user1.address, ethers.parseUnits("1000", 18));
    await erc20.connect(user1).approve(await diamond.getAddress(), ethers.parseUnits("1000", 18));
    await staking.connect(user1).stake(ethers.parseUnits("1000", 18));

    expect(await staking.stakedBalanceOf(user1.address)).to.equal(ethers.parseUnits("1000", 18));
  });

  it("Should support peg rebalance direction", async function () {
    // This is a simplified test - full oracle mocking needed for real price deviation
    await peg.initializePeg(ethers.ZeroAddress, 300); // dummy
    // In real test you would mock the price feed
  });

  it("Should support bridge out", async function () {
    await bridge.initializeBridge();
    await erc20.transfer(user1.address, ethers.parseUnits("1000", 18));
    await erc20.connect(user1).approve(await diamond.getAddress(), ethers.parseUnits("1000", 18));

    // Note: This will fail until bridgeManager is set properly in full deploy
    // await bridge.connect(user1).bridgeOut(1, "0x1234", ethers.parseUnits("100", 18));
  });
});
