import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SaltCore", (m) => {
  // Deploy Diamond infrastructure
  const diamondCutFacet = m.contract("DiamondCutFacet");
  const diamond = m.contract("Diamond", [m.getAccount(0), diamondCutFacet]);
  const diamondInit = m.contract("DiamondInit");

  // Deploy core facets
  const diamondLoupe = m.contract("DiamondLoupeFacet");
  const ownership = m.contract("OwnershipFacet");
  const erc20 = m.contract("ERC20Facet");
  const staking = m.contract("StakingFacet");
  const collateral = m.contract("CollateralFacet");
  const peg = m.contract("PegManagerFacet");
  const bridge = m.contract("BridgeFacet");
  const feeDistributor = m.contract("FeeDistributorFacet");
  const timelock = m.contract("TimelockFacet");

  // Cut all core facets
  const cut = [
    { facetAddress: diamondLoupe, action: 0, functionSelectors: m.getFunctionSelectors(diamondLoupe) },
    { facetAddress: ownership, action: 0, functionSelectors: m.getFunctionSelectors(ownership) },
    { facetAddress: erc20, action: 0, functionSelectors: m.getFunctionSelectors(erc20) },
    { facetAddress: staking, action: 0, functionSelectors: m.getFunctionSelectors(staking) },
    { facetAddress: collateral, action: 0, functionSelectors: m.getFunctionSelectors(collateral) },
    { facetAddress: peg, action: 0, functionSelectors: m.getFunctionSelectors(peg) },
    { facetAddress: bridge, action: 0, functionSelectors: m.getFunctionSelectors(bridge) },
    { facetAddress: feeDistributor, action: 0, functionSelectors: m.getFunctionSelectors(feeDistributor) },
    { facetAddress: timelock, action: 0, functionSelectors: m.getFunctionSelectors(timelock) },
  ];

  m.call(diamond, "diamondCut", [cut, diamondInit, "0x"]);

  // Initialize ERC20
  m.call(erc20, "setTokenSettings", ["Intern", "SALT", 18], { id: "init_erc20" });
  m.call(erc20, "mint", [m.getAccount(0), 1_000_000_000n * 10n ** 18n], { id: "mint_initial" });

  // Initialize Staking (revenue only)
  m.call(staking, "initializeStaking", [0], { id: "init_staking" });

  // Initialize FeeDistributor
  m.call(feeDistributor, "setRecipients", [
    m.getAccount(0), // Treasury
    diamond,         // Stakers (the diamond itself)
    diamond,         // Paymaster placeholder
  ], { id: "init_fee_distributor" });

  return { diamond, erc20, staking, collateral, feeDistributor };
});
