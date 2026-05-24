/**
 * Simple Keeper Bot for TWAP Price Updates
 * 
 * Runs every few minutes and pushes current SALT price to GamePaymentFacet.
 * 
 * Usage:
 *   node scripts/keeper-update-prices.js
 * 
 * For production: run with PM2 or as a systemd service.
 */

const { ethers } = require("ethers");
require("dotenv").config();

const DIAMOND_ADDRESS = process.env.DIAMOND_ADDRESS;
const PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const UPDATE_INTERVAL_MS = 3 * 60 * 1000; // every 3 minutes

async function main() {
  if (!DIAMOND_ADDRESS || !PRIVATE_KEY || !RPC_URL) {
    console.error("Missing env vars: DIAMOND_ADDRESS, KEEPER_PRIVATE_KEY, RPC_URL");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const gamePayment = new ethers.Contract(
    DIAMOND_ADDRESS,
    [
      "function updatePriceHistory(uint256 currentPrice) external",
      "function getTwapPrice() public view returns (uint256)"
    ],
    wallet
  );

  console.log("Keeper bot started for TWAP price updates");
  console.log("Diamond:", DIAMOND_ADDRESS);
  console.log("Interval: 3 minutes");

  async function updatePrice() {
    try {
      // TODO: Replace with real price oracle (Chainlink, Pyth, or your own SALT/USD feed)
      // For now we use a mock price (adjust to real value)
      const mockSALTPriceFor001USD = ethers.parseUnits("0.0123", 18); // example

      const tx = await gamePayment.updatePriceHistory(mockSALTPriceFor001USD);
      await tx.wait();

      const twap = await gamePayment.getTwapPrice();
      console.log(`[${new Date().toISOString()}] Price updated. Current TWAP: ${ethers.formatUnits(twap, 18)}`);
    } catch (err) {
      console.error("Failed to update price:", err.message);
    }
  }

  // Run immediately + on interval
  await updatePrice();
  setInterval(updatePrice, UPDATE_INTERVAL_MS);
}

main().catch(console.error);
