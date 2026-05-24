// backend/game-server/src/ai-opponent.js
/**
 * Simple AI Opponent for Battleship
 * Used by the game server when matching against "ai"
 */
const { BattleshipEngine } = require('./battleship-engine');
const engine = new BattleshipEngine();

function generateRandomPlacement() {
  const placements = [];
  const used = new Set();

  for (const ship of engine.ships) {
    let placed = false;
    while (!placed) {
      const direction = Math.random() > 0.5 ? 'horizontal' : 'vertical';
      const maxX = direction === 'horizontal' ? 10 - ship.length : 9;
      const maxY = direction === 'vertical' ? 10 - ship.length : 9;

      const x = Math.floor(Math.random() * (maxX + 1));
      const y = Math.floor(Math.random() * (maxY + 1));

      let valid = true;
      for (let i = 0; i < ship.length; i++) {
        const nx = direction === 'horizontal' ? x + i : x;
        const ny = direction === 'vertical' ? y + i : y;
        if (used.has(`${nx},${ny}`)) valid = false;
      }

      if (valid) {
        for (let i = 0; i < ship.length; i++) {
          const nx = direction === 'horizontal' ? x + i : x;
          const ny = direction === 'vertical' ? y + i : y;
          used.add(`${nx},${ny}`);
        }
        placements.push({ ship: ship.name, start: [x, y], direction });
        placed = true;
      }
    }
  }
  return placements;
}

function getAIMove(board) {
  // Very basic AI: random unfired cell
  let x, y;
  do {
    x = Math.floor(Math.random() * 10);
    y = Math.floor(Math.random() * 10);
  } while (board[y][x].hit || board[y][x].miss);

  return { x, y };
}

module.exports = { generateRandomPlacement, getAIMove };
