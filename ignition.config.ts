import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  ignition: {
    requiredConfirmations: 1, // For local testing
    // For mainnet/testnet you may want higher values
  },
};

export default config;
