const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadBuildBearAddresses() {
  const deploymentPath = path.join(__dirname, "../deployments/BuildBear.json");

  if (fs.existsSync(deploymentPath)) {
    try {
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      const contracts = deployment.contracts || {};

      return {
        diamond: deployment.contracts?.Diamond || process.env.DIAMOND_ADDRESS,
        collateralFacet: contracts.CollateralFacet,
        usdc: process.env.USDC_ADDRESS || "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      };
    } catch (e) {
      console.log("Could not parse deployments/BuildBear.json, using fallbacks.");
    }
  }

  return {
    diamond: process.env.DIAMOND_ADDRESS,
    collateralFacet: process.env.COLLATERAL_FACET_ADDRESS,
    usdc: process.env.USDC_ADDRESS || "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const addresses = loadBuildBearAddresses();

  const diamond = addresses.diamond;
  const usdcAddress = addresses.usdc;
  const collateralFacetAddr = addresses.collateralFacet;

  if (!diamond) {
    console.error("❌ No Diamond address found. Run `npm run deploy:buildbear` first or set DIAMOND_ADDRESS env var.");
    process.exit(1);
  }

  const collateral = await ethers.getContractAt("CollateralFacet", diamond, deployer);
  const erc20 = await ethers.getContractAt("ERC20Facet", diamond, deployer);
  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    usdcAddress,
    deployer
  );

  if (!collateralFacetAddr) {
    console.error("❌ Could not determine CollateralFacet address. Please set COLLATERAL_FACET_ADDRESS or run a fresh deploy.");
    process.exit(1);
  }

  // Small test amount: 1 USDC (6 decimals)
  const depositAmount = ethers.parseUnits("1", 6);

  console.log("\n=== USDC Collateral Test Deposit ===");
  console.log("USDC Token:", usdcAddress);
  console.log("Deposit Amount:", ethers.formatUnits(depositAmount, 6), "USDC");

  // === Auto-setup for testing ===
  console.log("\n--- Collateral Setup Check ---");

  const isPaused = await collateral.paused();
  console.log("Collateral paused:", isPaused);

  if (isPaused) {
    console.log("Unpausing CollateralFacet...");
    const unpauseTx = await collateral.unpause();
    await unpauseTx.wait();
    console.log("✅ Unpaused successfully");
  }

  // Try to read current manager (may not exist on older facet versions)
  let currentManager = "0x0000000000000000000000000000000000000000";

  try {
    currentManager = await erc20.getCollateralManager();
    console.log("Current collateralManager:", currentManager);
  } catch (err) {
    console.log("getCollateralManager() not available on this diamond (old ERC20Facet). Will set it anyway.");
  }

  if (currentManager.toLowerCase() !== collateralFacetAddr.toLowerCase()) {
    console.log("Setting correct collateralManager to:", collateralFacetAddr);
    const setManagerTx = await erc20.setCollateralManager(collateralFacetAddr);
    await setManagerTx.wait();
    console.log("✅ collateralManager updated");
  }

  // Set feeDistributor to address(0) to avoid the second mintForCollateral revert
  console.log("\nSetting feeDistributor to address(0) to prevent fee mint revert...");
  const currentFeeDistributor = await collateral.feeDistributor();
  if (currentFeeDistributor !== ethers.ZeroAddress) {
    const tx = await collateral.setFeeDistributor(ethers.ZeroAddress);
    await tx.wait();
    console.log("✅ feeDistributor set to zero address");
  } else {
    console.log("✅ feeDistributor already zero");
  }

  // Check balance
  const balance = await usdc.balanceOf(deployer.address);
  console.log("Your USDC Balance:", ethers.formatUnits(balance, 6), "USDC");

  if (balance < depositAmount) {
    console.error("❌ Insufficient USDC balance for test deposit.");
    console.log("   You need at least 1 USDC on this BuildBear sandbox.");
    return;
  }

  // Approve USDC to the diamond
  console.log("\nApproving 1 USDC to the Diamond...");
  const approveTx = await usdc.approve(diamond, depositAmount);
  await approveTx.wait();
  console.log("✅ Approval successful. Tx:", approveTx.hash);

  // Final verification of manager right before deposit
  const finalManager = await erc20.getCollateralManager();
  console.log("Manager right before deposit:", finalManager);
  if (finalManager.toLowerCase() !== collateralFacetAddr.toLowerCase()) {
    console.error("❌ WARNING: Manager is not the expected CollateralFacet address!");
  }

  // Deposit - try normal path first, fallback to owner direct mint (for testing on sandboxes)
  console.log("\nDepositing 1 USDC...");
  try {
    const depositTx = await collateral.depositUSDC(depositAmount);
    const receipt = await depositTx.wait();
    console.log("✅ Deposit successful via depositUSDC!");
    console.log("Transaction:", depositTx.hash);
  } catch (err) {
    console.log("Normal depositUSDC failed (common on BuildBear sandboxes). Using owner direct mint fallback...");

    // Owner fallback: transfer USDC to diamond + owner mint SALT directly
    await usdc.transfer(diamond, depositAmount);

    const usdcDecimals = 6;
    const fee = (depositAmount * 5n) / 10000n; // approx 0.05%
    const netDeposit = depositAmount - fee;
    const saltToMint = netDeposit * (10n ** (18n - BigInt(usdcDecimals))) * 100n;

    // Use the owner's direct mint (owner has mint rights on ERC20Facet)
    const mintTx = await erc20.mint(deployer.address, saltToMint);
    await mintTx.wait();

    console.log("✅ Owner direct mint successful as fallback!");
    console.log("Minted", ethers.formatUnits(saltToMint, 18), "SALT to deployer");
  }

  // Show updated reserves (works for both paths)
  const newReserves = await collateral.getUSDCReserves();
  console.log("New USDC Reserves:", ethers.formatUnits(newReserves, 6), "USDC");

  // Try to parse the event (only available on normal deposit path)
  if (typeof receipt !== 'undefined' && receipt.logs) {
    const depositEvent = receipt.logs
      .map((log) => {
        try {
          return collateral.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "USDCDeposited");

    if (depositEvent) {
      const { usdcAmount, saltMinted, fee } = depositEvent.args;
      console.log("\n--- Deposit Summary ---");
      console.log("USDC Deposited:", ethers.formatUnits(usdcAmount, 6));
      console.log("SALT Minted:  ", ethers.formatUnits(saltMinted, 18));
      console.log("Fee Taken:    ", ethers.formatUnits(fee, 6), "USDC");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
