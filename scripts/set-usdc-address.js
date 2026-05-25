const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const diamond = "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B";
  const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

  console.log("Setting USDC on CollateralFacet...");
  console.log("Diamond:", diamond);
  console.log("USDC:", usdcAddress);

  const collateral = await ethers.getContractAt("CollateralFacet", diamond, deployer);

  const tx = await collateral.setUSDCAddress(usdcAddress);
  await tx.wait();

  console.log("✅ USDC address set successfully on CollateralFacet!");
  console.log("Transaction:", tx.hash);

  // Verification step
  const currentUsdc = await collateral.usdcToken();
  console.log("\nVerification:");
  console.log("  Expected USDC:", usdcAddress);
  console.log("  Current USDC on CollateralFacet:", currentUsdc);

  if (currentUsdc.toLowerCase() === usdcAddress.toLowerCase()) {
    console.log("✅ Verification successful! USDC address is correctly set.");
  } else {
    console.log("❌ Verification failed! Address mismatch.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
