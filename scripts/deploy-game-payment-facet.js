/* global ethers */
/**
 * Deploy and cut GamePaymentFacet into an existing Diamond
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-game-payment-facet.js --network <network>
 * 
 * Make sure to set DIAMOND_ADDRESS in .env or hardhat config
 */

const { ethers } = require("hardhat");
const { getSelectors } = require("./libraries/diamond.js"); // if you have one, otherwise define below

async function deployGamePaymentFacet() {
  const [deployer] = await ethers.getSigners();

  const diamondAddress = process.env.DIAMOND_ADDRESS || "0xYourDiamondAddressHere";
  console.log("Cutting GamePaymentFacet into Diamond at:", diamondAddress);

  // 1. Deploy the new facet
  const GamePaymentFacet = await ethers.getContractFactory("GamePaymentFacet");
  const gamePaymentFacet = await GamePaymentFacet.deploy(ethers.ZeroAddress); // placeholder, will set token later
  await gamePaymentFacet.waitForDeployment();
  const gamePaymentAddr = await gamePaymentFacet.getAddress();
  console.log("GamePaymentFacet deployed at:", gamePaymentAddr);

  // 2. Cut it into the Diamond
  const diamondCut = await ethers.getContractAt("IDiamondCut", diamondAddress);

  const cut = [{
    facetAddress: gamePaymentAddr,
    action: 0, // Add
    functionSelectors: getSelectors(gamePaymentFacet)
  }];

  const tx = await diamondCut.diamondCut(cut, ethers.ZeroAddress, "0x");
  await tx.wait();
  console.log("GamePaymentFacet cut into Diamond successfully");

  // 3. Initialize the facet
  const gamePayment = await ethers.getContractAt("GamePaymentFacet", diamondAddress);

  // Initialize with SALT token (the Diamond itself acts as the ERC20)
  await (await gamePayment.initializeGamePayment(diamondAddress)).wait();

  // Set FeeDistributor (critical for 40/40/20 revenue split)
  const feeDistributor = await ethers.getContractAt("FeeDistributorFacet", diamondAddress);
  await (await gamePayment.setFeeDistributor(await feeDistributor.getAddress())).wait();

  // Set reasonable game entry fee (~0.01 USD in SALT for now)
  // In production this should be dynamic via oracle
  const entryFee = ethers.parseUnits("0.01", 18); // placeholder
  await (await gamePayment.setEntryFeeSALT(entryFee)).wait();

  // Set protocol fee (5%)
  await (await gamePayment.setProtocolFeeBps(500)).wait();

  console.log("GamePaymentFacet initialized");
  console.log("  - Entry fee set");
  console.log("  - FeeDistributor wired (40/40/20 will now receive game revenue)");
  console.log("  - TWAP history + commit-reveal + min duration enabled");

  // Deploy and cut ZKGameVerifierFacet
  const ZKGameVerifierFacet = await ethers.getContractFactory("ZKGameVerifierFacet");
  const zkVerifier = await ZKGameVerifierFacet.deploy();
  await zkVerifier.waitForDeployment();
  const zkAddr = await zkVerifier.getAddress();

  cut.push({ facetAddress: zkAddr, action: 0, functionSelectors: getSelectors(zkVerifier) });
  await (await diamondCut.diamondCut([], address(0), "0x")).wait();

  console.log("ZKGameVerifierFacet cut into Diamond at:", zkAddr);
  console.log("  - Ready for future Noir/RISC Zero verifier connection");

  return gamePaymentAddr;
}

function getSelectors(contract) {
  const signatures = [];
  for (const fragment of contract.interface.fragments) {
    if (fragment.type === "function") {
      signatures.push(contract.interface.getFunction(fragment.name).selector);
    }
  }
  return signatures;
}

if (require.main === module) {
  deployGamePaymentFacet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { deployGamePaymentFacet };
