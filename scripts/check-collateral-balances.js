const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n=== Collateral Balances Checker ===");
  console.log("Deployer:", deployer.address);

  const diamond = "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B";
  const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

  const collateral = await ethers.getContractAt("CollateralFacet", diamond, deployer);
  const salt = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    diamond,
    deployer
  ); // SALT = diamond
  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdcAddress,
    deployer
  );

  // Current USDC configured
  const configuredUsdc = await collateral.usdcToken();
  console.log("\nUSDC configured on CollateralFacet:", configuredUsdc);

  // Balances
  const usdcBalance = await usdc.balanceOf(deployer.address);
  const saltBalance = await salt.balanceOf(deployer.address);
  const usdcReserves = await collateral.getUSDCReserves();

  console.log("\n--- Balances ---");
  console.log("Your USDC Balance: ", ethers.formatUnits(usdcBalance, 6), "USDC");
  console.log("Your SALT Balance: ", ethers.formatUnits(saltBalance, 18), "SALT");
  console.log("USDC Reserves in Collateral:", ethers.formatUnits(usdcReserves, 6), "USDC");

  // Simple backing ratio (if reserves > 0)
  if (usdcReserves > 0) {
    // 1 USDC backs 100 SALT
    const backedSalt = usdcReserves * 100n * 10n ** 12n; // adjust for 6 -> 18 decimals
    const totalSaltSupply = await salt.totalSupply();
    const ratio = (backedSalt * 10000n) / totalSaltSupply;
    console.log("\nApprox. Backing Ratio:", (Number(ratio) / 100).toFixed(2) + "%");
  }

  console.log("\n================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
