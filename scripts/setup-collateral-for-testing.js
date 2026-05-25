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
        collateralFacet: contracts.CollateralFacet || process.env.COLLATERAL_FACET_ADDRESS,
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
  console.log("Deployer (owner):", deployer.address);

  const addresses = loadBuildBearAddresses();

  const diamond = addresses.diamond;
  const collateralFacetAddress = addresses.collateralFacet;
  const usdcAddress = addresses.usdc;

  if (!diamond || !collateralFacetAddress) {
    console.error("❌ Could not determine Diamond or CollateralFacet address.");
    console.error("   Run `npm run deploy:buildbear` first, or set DIAMOND_ADDRESS + COLLATERAL_FACET_ADDRESS.");
    process.exit(1);
  }

  console.log("\n=== Collateral Full Safe Setup for Testing ===");
  console.log("Diamond:          ", diamond);
  console.log("CollateralFacet:  ", collateralFacetAddress);
  console.log("USDC Address:     ", usdcAddress);

  const collateral = await ethers.getContractAt("CollateralFacet", diamond, deployer);
  const erc20 = await ethers.getContractAt("ERC20Facet", diamond, deployer);

  // 1. Set USDC Address
  console.log("\n[1/5] Setting USDC address...");
  const currentUsdc = await collateral.usdcToken();
  if (currentUsdc.toLowerCase() !== usdcAddress.toLowerCase()) {
    const tx = await collateral.setUSDCAddress(usdcAddress);
    await tx.wait();
    console.log("✅ USDC address set. Tx:", tx.hash);
  } else {
    console.log("✅ USDC already correctly set.");
  }

  // 2. Set Collateral Manager (must be the CollateralFacet address, not the diamond)
  console.log("\n[2/5] Setting Collateral Manager...");
  let currentManager = "0x0000000000000000000000000000000000000000";
  try {
    currentManager = await erc20.getCollateralManager();
  } catch (err) {
    console.log("getCollateralManager() not available on this diamond yet (will set anyway).");
  }

  if (currentManager.toLowerCase() !== collateralFacetAddress.toLowerCase()) {
    const tx = await erc20.setCollateralManager(collateralFacetAddress);
    await tx.wait();
    console.log("✅ Collateral Manager set to CollateralFacet. Tx:", tx.hash);
  } else {
    console.log("✅ Collateral Manager already correctly set.");
  }

  // 3. Unpause if needed
  console.log("\n[3/5] Checking pause status...");
  const isPaused = await collateral.paused();
  console.log("Currently paused:", isPaused);
  if (isPaused) {
    const tx = await collateral.unpause();
    await tx.wait();
    console.log("✅ Contract unpaused. Tx:", tx.hash);
  } else {
    console.log("✅ Contract already unpaused.");
  }

  // 4. Set feeDistributor to address(0) to avoid the second mintForCollateral call
  // (This was a major source of silent reverts during testing)
  console.log("\n[4/5] Setting feeDistributor to address(0)...");
  const currentFeeDistributor = await collateral.feeDistributor();
  if (currentFeeDistributor !== ethers.ZeroAddress) {
    const tx = await collateral.setFeeDistributor(ethers.ZeroAddress);
    await tx.wait();
    console.log("✅ feeDistributor set to zero address (skips fee mint branch). Tx:", tx.hash);
  } else {
    console.log("✅ feeDistributor already set to zero.");
  }

  // 5. Set minimal safe withdrawal limits (prevents some edge case reverts)
  console.log("\n[5/5] Setting basic withdrawal limits...");
  const currentMaxPerTx = await collateral.maxWithdrawPerTx();
  if (currentMaxPerTx === 0n) {
    // Allow up to 10,000 USDC per tx as a safe default for testing
    const tx = await collateral.setMaxWithdrawPerTx(ethers.parseUnits("10000", 6));
    await tx.wait();
    console.log("✅ maxWithdrawPerTx set to 10,000 USDC.");
  } else {
    console.log("✅ Withdrawal limits already configured.");
  }

  // === Final Verification ===
  console.log("\n=== Final Verification ===");
  console.log("USDC on Collateral:      ", await collateral.usdcToken());
  console.log("Collateral Manager:      ", await erc20.getCollateralManager());
  console.log("Paused:                  ", await collateral.paused());
  console.log("feeDistributor:          ", await collateral.feeDistributor());
  console.log("maxWithdrawPerTx:        ", ethers.formatUnits(await collateral.maxWithdrawPerTx(), 6), "USDC");

  const reserves = await collateral.getUSDCReserves();
  console.log("Current USDC Reserves:   ", ethers.formatUnits(reserves, 6), "USDC");

  console.log("\n✅ Collateral is now ready for testing!");
  console.log("You can now safely run: npx hardhat run scripts/test-deposit-usdc.js --network buildbear");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
