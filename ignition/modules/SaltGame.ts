import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SaltGame", (m, { coreDiamond }: { coreDiamond: any }) => {
  const gamePayment = m.contract("GamePaymentFacet");
  const zkVerifier = m.contract("ZKGameVerifierFacet");
  const nftManager = m.contract("NFTManagerFacet");
  const memeMarketplace = m.contract("MemeMarketplaceFacet");

  // Cut game-related facets
  const cut = [
    { facetAddress: gamePayment, action: 0, functionSelectors: m.getFunctionSelectors(gamePayment) },
    { facetAddress: zkVerifier, action: 0, functionSelectors: m.getFunctionSelectors(zkVerifier) },
    { facetAddress: nftManager, action: 0, functionSelectors: m.getFunctionSelectors(nftManager) },
    { facetAddress: memeMarketplace, action: 0, functionSelectors: m.getFunctionSelectors(memeMarketplace) },
  ];

  m.call(coreDiamond, "diamondCut", [cut, "0x", "0x"]);

  // Initialize GamePayment
  m.call(gamePayment, "initializeGamePayment", [coreDiamond], { id: "init_game_payment" });
  m.call(gamePayment, "setFeeDistributor", [m.getParameter("feeDistributor")], { id: "set_fee_dist" });
  m.call(gamePayment, "setEntryFeeSALT", [ethers.parseUnits("0.01", 18)], { id: "set_entry_fee" });

  return { gamePayment, zkVerifier, nftManager, memeMarketplace };
});
