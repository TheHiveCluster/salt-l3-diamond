const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const diamond = "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B";
  const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

  const collateral = await ethers.getContractAt("CollateralFacet", diamond, deployer);
  const salt = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    diamond,
    deployer
  ); // SALT token = the diamond itself
  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdcAddress,
    deployer
  );

  // Withdraw amount: SALT equivalent to ~0.5 USDC
  // 1 USDC backs 100 SALT, so 0.5 USDC ≈ 50 SALT
  const saltToWithdraw = ethers.parseUnits("50", 18);

  console.log("\n=== USDC Collateral Test Withdraw ===");
  console.log("SALT to burn:", ethers.formatUnits(saltToWithdraw, 18), "SALT");

  const saltBalance = await salt.balanceOf(deployer.address);
  console.log("Your SALT Balance:", ethers.formatUnits(saltBalance, 18), "SALT");

  if (saltBalance < saltToWithdraw) {
    console.error("❌ Insufficient SALT balance for test withdraw.");
    console.log("   You need at least 50 SALT (roughly 0.5 USDC worth).");
    console.log("   Tip: Run the deposit test first to acquire some SALT.");
    return;
  }

  const reservesBefore = await collateral.getUSDCReserves();
  console.log("USDC Reserves before:", ethers.formatUnits(reservesBefore, 6), "USDC");

  console.log("\nWithdrawing...");
  const tx = await collateral.withdrawUSDC(saltToWithdraw);
  const receipt = await tx.wait();

  console.log("✅ Withdraw successful!");
  console.log("Transaction:", tx.hash);

  // Try to parse the USDCWithdrawn event
  const withdrawEvent = receipt.logs
    .map((log) => {
      try {
        return collateral.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "USDCWithdrawn");

  if (withdrawEvent) {
    const { saltAmount, usdcWithdrawn, fee } = withdrawEvent.args;
    console.log("\n--- Withdraw Summary ---");
    console.log("SALT Burned:   ", ethers.formatUnits(saltAmount, 18));
    console.log("USDC Received: ", ethers.formatUnits(usdcWithdrawn, 6));
    console.log("Fee Taken:     ", ethers.formatUnits(fee, 6), "USDC");
  }

  const reservesAfter = await collateral.getUSDCReserves();
  console.log("\nUSDC Reserves after:", ethers.formatUnits(reservesAfter, 6), "USDC");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
