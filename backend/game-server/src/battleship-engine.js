// backend/game-server/src/battleship-engine.js
/**
 * Battleship Game Engine
 * Pure logic - works for both humans and AI agents.
 * Handles board state, ship placement, firing, and win detection.
 */

class BattleshipEngine {
  constructor() {
    this.boardSize = 10;
    this.ships = [
      { name: 'Carrier', length: 5 },
      { name: 'Battleship', length: 4 },
      { name: 'Cruiser', length: 3 },
      { name: 'Submarine', length: 3 },
      { name: 'Destroyer', length: 2 }
    ];
  }

  /**
   * Create an empty board
   */
  createEmptyBoard() {
    return Array.from({ length: this.boardSize }, () =>
      Array.from({ length: this.boardSize }, () => ({
        ship: null,
        hit: false,
        miss: false
      }))
    );
  }

  /**
   * Validate and place ships on the board (for initial placement)
   * @param {Array} placements - [{ ship: 'Carrier', start: [x,y], direction: 'horizontal' | 'vertical' }]
   */
  placeShips(board, placements) {
    const newBoard = JSON.parse(JSON.stringify(board)); // deep clone

    for (const placement of placements) {
      const ship = this.ships.find(s => s.name === placement.ship);
      if (!ship) throw new Error(`Unknown ship: ${placement.ship}`);

      const { start, direction } = placement;
      const [x, y] = start;

      // Check bounds and overlap
      for (let i = 0; i < ship.length; i++) {
        const nx = direction === 'horizontal' ? x + i : x;
        const ny = direction === 'vertical' ? y + i : y;

        if (nx >= this.boardSize || ny >= this.boardSize) {
          throw new Error(`Ship ${ship.name} out of bounds`);
        }
        if (newBoard[ny][nx].ship) {
          throw new Error(`Overlap on ${ship.name}`);
        }
      }

      // Place ship
      for (let i = 0; i < ship.length; i++) {
        const nx = direction === 'horizontal' ? x + i : x;
        const ny = direction === 'vertical' ? y + i : y;
        newBoard[ny][nx].ship = ship.name;
      }
    }

    return newBoard;
  }

  /**
   * Fire at a coordinate
   * Returns: { hit: boolean, sunk: boolean, ship?: string, gameOver: boolean }
   */
  fire(board, x, y) {
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      throw new Error('Invalid coordinate');
    }

    const cell = board[y][x];
    if (cell.hit || cell.miss) {
      throw new Error('Already fired here');
    }

    const result = {
      hit: !!cell.ship,
      sunk: false,
      ship: cell.ship || null,
      gameOver: false
    };

    if (cell.ship) {
      cell.hit = true;

      // Check if ship is sunk
      const shipCells = this._getShipCells(board, cell.ship);
      const allHit = shipCells.every(c => c.hit);
      result.sunk = allHit;

      // Check win condition
      result.gameOver = this._isGameOver(board);
    } else {
      cell.miss = true;
    }

    return result;
  }

  _getShipCells(board, shipName) {
    const cells = [];
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        if (board[y][x].ship === shipName) cells.push(board[y][x]);
      }
    }
    return cells;
  }

  _isGameOver(board) {
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const cell = board[y][x];
        if (cell.ship && !cell.hit) return false;
      }
    }
    return true;
  }

  /**
   * Get a simple text representation of the board (for debugging / agent logs)
   */
  printBoard(board, hideShips = false) {
    let output = '   0 1 2 3 4 5 6 7 8 9\n';
    for (let y = 0; y < this.boardSize; y++) {
      let row = `${y}  `;
      for (let x = 0; x < this.boardSize; x++) {
        const cell = board[y][x];
        if (cell.hit) row += 'X ';
        else if (cell.miss) row += 'o ';
        else if (cell.ship && !hideShips) row += 'S ';
        else row += '. ';
      }
      output += row + '\n';
    }
    return output;
  }
}

module.exports = { BattleshipEngine };
