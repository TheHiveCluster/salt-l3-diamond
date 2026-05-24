import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import SaltCore from "./SaltCore";
import SaltGame from "./SaltGame";

export default buildModule("SaltFullSystem", (m) => {
  const core = m.useModule(SaltCore);
  const game = m.useModule(SaltGame, { coreDiamond: core.diamond });

  // Deploy NFT contracts (outside Diamond for now, then register)
  const reputationNFT = m.contract("InternReputationNFT", [
    core.diamond,
    "Intern Reputation",
    "REP",
  ]);

  const gamingAssetNFT = m.contract("GamingAssetNFT", [
    core.diamond,
    "Gaming Asset",
    "GAME",
  ]);

  // Register NFTs into NFTManager (after game module is cut)
  m.call(game.nftManager, "registerCollection", [
    reputationNFT,
    5, // REPUTATION type
    "Intern Reputation",
  ], { id: "register_reputation" });

  m.call(game.nftManager, "registerCollection", [
    gamingAssetNFT,
    2, // GAMING type
    "Gaming Asset",
  ], { id: "register_gaming" });

  return {
    diamond: core.diamond,
    ...core,
    ...game,
    reputationNFT,
    gamingAssetNFT,
  };
});
