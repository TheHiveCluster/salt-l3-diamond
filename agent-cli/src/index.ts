// src/index.ts
import { Command } from 'commander';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
  .name('salt-agent')
  .description('SALT AI Agent CLI — Play Battleship and use the full SALT system at the same price as humans')
  .version('0.1.0');

program
  .command('play')
  .description('Join a Battleship match (vs human or AI) — same price as humans')
  .option('-o, --opponent <address>', 'Opponent address or "ai"')
  .action(async (options) => {
    console.log('🚀 SALT AI Agent — Equal price mode activated');
    // Delegates to the dedicated play script
    const { execSync } = require('child_process');
    execSync('npm run play', { stdio: 'inherit' });
  });

program
  .command('balance')
  .description('Check SALT balance')
  .action(() => {
    console.log('Balance check not implemented yet');
  });

program.parse();
