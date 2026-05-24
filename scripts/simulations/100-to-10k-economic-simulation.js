/**
 * SALT / Intern Economic Simulation
 * 
 * Simulates normal growth from 100 → 1,000,000+ users over 5 years (60 months) from dev launch
 * Tracks:
 *   - USDC Deposits (backing)
 *   - SALT Supply & Treasury
 *   - Revenue (Bridge + Collateral + Marketplace)
 *   - Burns vs Distributions
 *   - Backing Ratio
 *   - YTD Revenue
 */

const fs = require("fs");
const path = require("path");

// ==================== SIMULATION PARAMETERS ====================
const START_USERS = 100;
const TARGET_USERS = 1_000_000;
const MONTHS = 60; // 5 years

const AVG_DEPOSIT_USDC = 2500;           // Average USDC deposited per new user
const STAKE_PERCENT = 0.65;              // % of SALT that gets staked
const MONTHLY_BRIDGE_VOLUME_PER_USER = 8000; // Avg SALT bridged per active user/month
const MARKETPLACE_VOLUME_PER_USER = 1200;    // Avg marketplace volume per user/month

// === NEW: Gaming Revenue Parameters ===
const GAMES_PER_USER_PER_MONTH = 4;      // How many games an active user plays per month
const GAME_ENTRY_FEE_USD = 0.01;         // Same price for humans and AI agents
const GAME_PROTOCOL_FEE_BPS = 500;       // 5% protocol fee on game entry
const GAME_BURN_BPS = 200;               // 2% burn from protocol fee

// Fee rates
const BRIDGE_FEE_BPS = 10;               // 0.10%
const COLLATERAL_FEE_BPS = 5;            // 0.05%
const MARKETPLACE_FEE_BPS = 250;         // 2.5%

// Burn rate
const BURN_BPS = 10;                     // 0.1% of volume

// Revenue split (from FeeDistributor)
const TREASURY_SHARE = 0.40;
const STAKERS_SHARE = 0.40;
const PAYMASTER_SHARE = 0.20;

// Assumptions
const GAS_PRICE_GWEI = 20;
const ETH_PRICE = 3000;
const SALT_PRICE_USD = 0.85;   // Assumed average SALT price for TVL & APY calculations

// ==================== SIMULATION STATE ====================
let users = START_USERS;
let totalUSDCDeposited = 0;
let totalSALTSupply = 0;
let treasuryBalance = 0;
let stakedSALT = 0;
let totalBurned = 0;
let totalRevenue = 0;
let distributedToStakers = 0;

const monthlyData = [];

// ==================== HELPER FUNCTIONS ====================
function formatUSD(amount) {
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatSALT(amount) {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " SALT";
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// ==================== MONTHLY STEP ====================
function simulateMonth(month) {
  const previousUsers = users;
  
  // Normal phased growth from dev launch to 1M+ users over 5 years
  let growthRate;
  if (month <= 12)       growthRate = 0.45;   // Year 1: Dev + early adopters
  else if (month <= 24)  growthRate = 0.28;   // Year 2: Product-market fit
  else if (month <= 36)  growthRate = 0.18;   // Year 3: Scaling
  else if (month <= 48)  growthRate = 0.12;   // Year 4: Expansion
  else                   growthRate = 0.09;   // Year 5: Maturation toward 1M+

  // Dampen as we approach target (softer for reaching 1M+)
  const saturation = Math.min(Math.pow(users / TARGET_USERS, 1.2), 0.92);
  const newUsers = Math.floor(users * growthRate * (1 - saturation));
  users += newUsers;

  // New deposits
  const newDeposits = newUsers * AVG_DEPOSIT_USDC;
  totalUSDCDeposited += newDeposits;

  // New SALT minted from deposits — 1:1 collateralized (realistic)
  const newSALTFromDeposits = newDeposits; // 1 USDC backs 1 SALT
  totalSALTSupply += newSALTFromDeposits;

  // Staking behavior
  const newStaked = newSALTFromDeposits * STAKE_PERCENT;
  stakedSALT += newStaked;

  // === Revenue Generation ===

  // 1. Bridge Revenue
  const activeBridgeUsers = Math.floor(users * 0.55);
  const bridgeVolume = activeBridgeUsers * MONTHLY_BRIDGE_VOLUME_PER_USER * randomBetween(0.8, 1.2);
  const bridgeFees = (bridgeVolume * BRIDGE_FEE_BPS) / 10000;
  const bridgeBurn = (bridgeVolume * BURN_BPS) / 10000;

  // 2. Collateral Fees (on new deposits + some withdrawals)
  const collateralFees = (newDeposits * COLLATERAL_FEE_BPS) / 10000;

  // 3. Marketplace Revenue
  const marketplaceVolume = users * MARKETPLACE_VOLUME_PER_USER * randomBetween(0.7, 1.3);
  const marketplaceFees = (marketplaceVolume * MARKETPLACE_FEE_BPS) / 10000;
  const marketplaceBurn = (marketplaceVolume * BURN_BPS) / 10000;

  // === NEW: Gaming Revenue (Battleship + future games) ===
  // Agents and humans pay the exact same price
  const activeGamers = Math.floor(users * 0.35); // % of users who play games
  const gamesPlayed = activeGamers * GAMES_PER_USER_PER_MONTH * randomBetween(0.8, 1.2);
  const gameEntryUSD = gamesPlayed * GAME_ENTRY_FEE_USD;
  const gameProtocolFee = (gameEntryUSD * GAME_PROTOCOL_FEE_BPS) / 10000;
  const gameBurn = (gameProtocolFee * GAME_BURN_BPS) / 10000;

  const monthlyRevenue = bridgeFees + collateralFees + marketplaceFees + gameProtocolFee;
  const monthlyBurn = bridgeBurn + marketplaceBurn + gameBurn;

  totalRevenue += monthlyRevenue;
  totalBurned += monthlyBurn;

  // Revenue split
  const toTreasury = monthlyRevenue * TREASURY_SHARE;
  const toStakers = monthlyRevenue * STAKERS_SHARE;
  const toPaymaster = monthlyRevenue * PAYMASTER_SHARE;

  treasuryBalance += toTreasury;
  distributedToStakers += toStakers;

  // Update SALT supply (burns reduce it)
  totalSALTSupply -= monthlyBurn;

  // Backing ratio
  const backingRatio = totalUSDCDeposited > 0 
    ? (totalUSDCDeposited * 100) / totalSALTSupply 
    : 0;

  // Record monthly data
  monthlyData.push({
    month,
    users: Math.round(users),
    newUsers: Math.round(newUsers),
    usdcDeposited: Math.round(totalUSDCDeposited),
    saltSupply: Math.round(totalSALTSupply),
    treasury: Math.round(treasuryBalance),
    staked: Math.round(stakedSALT),
    monthlyRevenue: Math.round(monthlyRevenue),
    ytdRevenue: Math.round(totalRevenue),
    burnedThisMonth: Math.round(monthlyBurn),
    totalBurned: Math.round(totalBurned),
    backingRatio: parseFloat(backingRatio.toFixed(2)),
    distributedToStakers: Math.round(distributedToStakers),
  });

  return monthlyRevenue;
}

// ==================== RUN SIMULATION ====================
console.log("Running 100 → 1,000,000 User Economic Simulation (5 Years / Normal Growth)...\n");

for (let month = 1; month <= MONTHS; month++) {
  simulateMonth(month);
}

// ==================== FINAL REPORT ====================
console.log("\n" + "=".repeat(80));
console.log("                    SALT / INTERN - 5 YEAR ECONOMIC SIMULATION (100 → 1M+ Users)");
console.log("=".repeat(80));

console.log(`\nUsers: ${START_USERS} → ${Math.round(users)} (5-year normal growth from dev launch)`);
console.log(`Total USDC Deposited: $${Math.round(totalUSDCDeposited).toLocaleString()}`);
console.log(`Total SALT Supply:    ${Math.round(totalSALTSupply).toLocaleString()} SALT`);
console.log(`Total Revenue (5-Year Cumulative):  $${Math.round(totalRevenue).toLocaleString()}`);
console.log(`Total SALT Burned:    ${Math.round(totalBurned).toLocaleString()} SALT`);
console.log(`Distributed to Stakers: $${Math.round(distributedToStakers).toLocaleString()}`);
console.log(`Final Backing Ratio:  ${monthlyData[MONTHS-1].backingRatio}%`);

// Key Milestones
console.log("\nKey Milestones:");
const milestones = [1000, 10000, 50000, 100000, 250000, 500000, 1000000];
milestones.forEach(target => {
  const hit = monthlyData.find(r => r.users >= target);
  if (hit) {
    console.log(`  Reached ${target.toLocaleString()} users in Month ${hit.month} (Year ${Math.ceil(hit.month/12)})`);
  }
});

// Staking TVL & APY Projections (per year)
console.log("\nStaking TVL & APY Projections (per year):\n");
console.log("Year | End Users | Staked SALT     | Staking TVL (USD) | Annual Staker Rewards | Implied APY");
console.log("-----|-----------|-----------------|-------------------|-----------------------|------------");

const yearlyStaking = [];
for (let year = 1; year <= 5; year++) {
  const month = year * 12;
  const prevMonth = (year - 1) * 12;
  const row = monthlyData[month - 1];
  const prevRow = prevMonth > 0 ? monthlyData[prevMonth - 1] : { distributedToStakers: 0, staked: 0 };

  const yearlyRewards = row.distributedToStakers - (prevRow.distributedToStakers || 0);
  const tvl = row.staked * SALT_PRICE_USD;
  const apy = tvl > 0 ? (yearlyRewards / tvl) * 100 : 0;

  yearlyStaking.push({
    year,
    users: row.users,
    staked: row.staked,
    tvlUSD: Math.round(tvl),
    yearlyRewards: Math.round(yearlyRewards),
    apy: parseFloat(apy.toFixed(1))
  });

  console.log(
    ` ${year}   | ` +
    `${String(row.users).padStart(9)} | ` +
    `${String(row.staked).padStart(15)} | ` +
    `$${String(Math.round(tvl)).padStart(17)} | ` +
    `$${String(yearlyRewards).padStart(21)} | ` +
    `${apy.toFixed(1)}%`
  );
}

// Export to JSON + CSV
const resultsDir = path.join(__dirname, "../../test-results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

const timestamp = Date.now();
const jsonPath = path.join(resultsDir, `100-to-1m-5year-simulation-${timestamp}.json`);
const csvPath = path.join(resultsDir, `100-to-1m-5year-simulation-${timestamp}.csv`);

// JSON
fs.writeFileSync(jsonPath, JSON.stringify({
  parameters: {
    startUsers: START_USERS,
    targetUsers: TARGET_USERS,
    months: MONTHS,
    assumptions: {
      avgDepositUSDC: AVG_DEPOSIT_USDC,
      stakePercent: STAKE_PERCENT,
      bridgeFeeBps: BRIDGE_FEE_BPS,
      marketplaceFeeBps: MARKETPLACE_FEE_BPS,
      burnBps: BURN_BPS,
      saltPriceUSD: SALT_PRICE_USD
    }
  },
  summary: {
    finalUsers: Math.round(users),
    totalUSDCDeposited: Math.round(totalUSDCDeposited),
    totalSALTSupply: Math.round(totalSALTSupply),
    fiveYearRevenue: Math.round(totalRevenue),
    totalBurned: Math.round(totalBurned),
    finalBackingRatio: monthlyData[MONTHS-1].backingRatio,
    finalStakedSALT: Math.round(stakedSALT)
  },
  yearlyStaking,
  monthlyData
}, null, 2));

// CSV (enhanced with staked for TVL charting)
let csv = "Month,Users,USDC Deposited,SALT Supply,Treasury,Staked SALT,Monthly Revenue,YTD Revenue,Backing Ratio,Total Burned,DistributedToStakers\n";
monthlyData.forEach(row => {
  csv += `${row.month},${row.users},${row.usdcDeposited},${row.saltSupply},${row.treasury},${row.staked},${row.monthlyRevenue},${row.ytdRevenue},${row.backingRatio},${row.totalBurned},${row.distributedToStakers}\n`;
});
fs.writeFileSync(csvPath, csv);

console.log(`\n📁 Results saved to:`);
console.log(`   ${jsonPath}`);
console.log(`   ${csvPath}`);

console.log("\n" + "=".repeat(80));
console.log("Simulation complete. 5-Year Cumulative Revenue: $" + Math.round(totalRevenue).toLocaleString());
console.log("=".repeat(80));
