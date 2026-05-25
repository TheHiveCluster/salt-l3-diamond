const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const diamond = "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B";
  const collateralFacetAddress = "0x84F2B536cfbcd72565C06918940Aa658f3e130f3";

  console.log("Setting Collateral Manager on ERC20Facet...");
  console.log("Diamond:", diamond);
  console.log("Collateral Manager (CollateralFacet):", collateralFacetAddress);

  const erc20 = await ethers.getContractAt("ERC20Facet", diamond, deployer);

  const tx = await erc20.setCollateralManager(collateralFacetAddress);
  await tx.wait();

  console.log("✅ Collateral Manager set successfully!");
  console.log("Transaction:", tx.hash);
  console.log("\nYou can now test depositUSDC again.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
