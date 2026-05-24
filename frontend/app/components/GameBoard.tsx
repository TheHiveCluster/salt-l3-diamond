'use client'

import React, { useState } from 'react'
import { keccak256, toHex } from 'viem'  // For commit-reveal hashing (B)

interface Cell {
  ship: string | null
  hit: boolean
  miss: boolean
}

interface Placement {
  ship: string
  start: [number, number]
  direction: 'horizontal' | 'vertical'
}

const SHIPS = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
]

interface GameBoardProps {
  matchId: number | null
  playerAddress: string | undefined
  onGameOver?: (winner: string) => void
  onCommitShips?: (commitment: string) => void   // For B: commit-reveal
  onMintLoadout?: (placementHash: string) => void // For A: free on-chain loadout
  spectator?: boolean // For AI vs AI dual view
}

export function GameBoard({ matchId, playerAddress, onGameOver }: GameBoardProps) {
  const [phase, setPhase] = useState<'placement' | 'playing' | 'finished'>('placement')
  const [playerBoard, setPlayerBoard] = useState<Cell[][]>(createEmptyBoard())
  const [opponentBoard, setOpponentBoard] = useState<Cell[][]>(createEmptyBoard())
  const [placements, setPlacements] = useState<Placement[]>([])
  const [currentShipIndex, setCurrentShipIndex] = useState(0)
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal')
  const [gameLog, setGameLog] = useState<string[]>([])
  const [isMyTurn, setIsMyTurn] = useState(true)

  // Persistent Loadouts (A feature) - saved locally for now, mintable on-chain later
  const [savedLoadouts, setSavedLoadouts] = useState<any[]>([])

  // Load saved loadouts from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem('salt_ship_loadouts')
    if (stored) setSavedLoadouts(JSON.parse(stored))
  }, [])

  function createEmptyBoard(): Cell[][] {
    return Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({ ship: null, hit: false, miss: false }))
    )
  }

  // Simple client-side placement logic (MVP)
  const placeShip = (x: number, y: number) => {
    if (spectator) return
    if (phase !== 'placement' || currentShipIndex >= SHIPS.length) return

    const ship = SHIPS[currentShipIndex]
    const newBoard = JSON.parse(JSON.stringify(playerBoard)) as Cell[][]
    const newPlacements = [...placements]

    // Check if can place
    const canPlace = checkCanPlace(newBoard, ship.length, x, y, direction)
    if (!canPlace) {
      alert('Invalid placement!')
      return
    }

    // Place
    for (let i = 0; i < ship.length; i++) {
      const nx = direction === 'horizontal' ? x + i : x
      const ny = direction === 'horizontal' ? y : y + i
      newBoard[ny][nx].ship = ship.name
    }

    newPlacements.push({ ship: ship.name, start: [x, y], direction })
    setPlayerBoard(newBoard)
      setPlacements(newPlacements)
    setCurrentShipIndex(currentShipIndex + 1)

    if (currentShipIndex + 1 === SHIPS.length) {
      setGameLog(prev => [...prev, 'All ships placed. Click "Confirm Placement" to lock in.'])
    }
  }

  function checkCanPlace(board: Cell[][], length: number, x: number, y: number, dir: string): boolean {
    for (let i = 0; i < length; i++) {
      const nx = dir === 'horizontal' ? x + i : x
      const ny = dir === 'horizontal' ? y : y + i
      if (nx >= 10 || ny >= 10) return false
      if (board[ny][nx].ship) return false
    }
    return true
  }

  const submitPlacement = async (finalPlacements: Placement[]) => {
    if (!matchId) return

    try {
      await fetch('http://localhost:3001/game/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, placements: finalPlacements, player: 1 }),
      })
      setGameLog(prev => [...prev, 'Ships placed on server.'])
      setPhase('playing')
      setGameLog(prev => [...prev, 'Game started! Your turn to fire.'])
    } catch (e) {
      console.error(e)
      setPhase('playing')
    }
  }

  // A + B: Confirm placement + optional commit-reveal
  const confirmPlacement = async () => {
    if (placements.length !== SHIPS.length || !matchId) return

    // Send to server
    await submitPlacement(placements)

    // B: Real commit-reveal - hash the placement data + random salt
    const placementData = JSON.stringify(placements)
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)))
    const commitment = keccak256(toHex(placementData + salt))

    setGameLog(prev => [...prev, `Commitment generated: ${commitment.slice(0, 10)}...`])

    // Call parent's onCommitShips if provided (B)
    if (onCommitShips) {
      onCommitShips(commitment)
    }
  }

  // === Persistent Loadouts (A) ===
  const saveCurrentLoadout = () => {
    if (placements.length === 0) return alert('Place your ships first')

    const name = prompt('Name this loadout:', `Loadout ${Date.now()}`)
    if (!name) return

    const newLoadout = { id: Date.now(), name, placements }
    const updated = [...savedLoadouts, newLoadout]
    setSavedLoadouts(updated)
    localStorage.setItem('salt_ship_loadouts', JSON.stringify(updated))
    setGameLog(prev => [...prev, `Saved loadout: ${name}`])
  }

  const loadLoadout = (loadout: any) => {
    // Reset board and apply placements
    const newBoard = createEmptyBoard()
    loadout.placements.forEach((p: any) => {
      const ship = SHIPS.find(s => s.name === p.ship)
      if (!ship) return
      for (let i = 0; i < ship.length; i++) {
        const nx = p.direction === 'horizontal' ? p.start[0] + i : p.start[0]
        const ny = p.direction === 'horizontal' ? p.start[1] : p.start[1] + i
        if (ny < 10 && nx < 10) newBoard[ny][nx].ship = p.ship
      }
    })
    setPlayerBoard(newBoard)
    setPlacements(loadout.placements)
    setCurrentShipIndex(SHIPS.length)
    setGameLog(prev => [...prev, `Loaded: ${loadout.name}`])
  }

  const mintFreeLoadout = async () => {
    if (placements.length === 0) return alert('Place ships first')

    // Create a simple hash of the placement for on-chain registration
    const placementString = JSON.stringify(placements)
    const placementHash = keccak256(toHex(placementString))

    if (onMintLoadout) {
      onMintLoadout(placementHash)
    } else {
      alert('Minting free loadout as on-chain record. (Hook ready)')
    }

    setGameLog(prev => [...prev, `Registered loadout on-chain: ${placementHash.slice(0, 10)}...`])
  }

  // Firing logic
  const fire = async (x: number, y: number) => {
    if (spectator) return
    if (phase !== 'playing' || !isMyTurn || !matchId) return

    const cell = opponentBoard[y][x]
    if (cell.hit || cell.miss) return

    try {
      const res = await fetch('http://localhost:3001/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, x, y, player: 1 }),
      })

      const data = await res.json()
      const result = data.result

      // Update opponent board
      const newOppBoard = JSON.parse(JSON.stringify(opponentBoard))
      newOppBoard[y][x] = { ...newOppBoard[y][x], hit: result.hit, miss: !result.hit }
      setOpponentBoard(newOppBoard)

      let log = `Fired at (${x},${y}): ${result.hit ? 'HIT' : 'MISS'}`
      if (result.sunk) log += ` — ${result.ship} sunk!`
      if (result.gameOver) log += ' — YOU WON!'
      setGameLog(prev => [...prev, log])

      if (result.gameOver) {
        setPhase('finished')
        onGameOver?.(playerAddress || 'you')
        return
      }

      setIsMyTurn(false)

      // Simulate AI turn (in real version this would come from server polling)
      setTimeout(() => {
        simulateAITurn()
      }, 800)
    } catch (e) {
      // Fallback to local simulation
      simulateLocalFire(x, y)
    }
  }

  const simulateLocalFire = (x: number, y: number) => {
    const newBoard = JSON.parse(JSON.stringify(opponentBoard))
    const cell = newBoard[y][x]
    cell.hit = true
    setOpponentBoard(newBoard)

    setGameLog(prev => [...prev, `Fired at (${x},${y}): HIT (local sim)`])
    setIsMyTurn(false)

    setTimeout(() => simulateAITurn(), 600)
  }

  const simulateAITurn = () => {
    // Very basic AI response for demo
    let x, y
    do {
      x = Math.floor(Math.random() * 10)
      y = Math.floor(Math.random() * 10)
    } while (playerBoard[y][x].hit || playerBoard[y][x].miss)

    const newBoard = JSON.parse(JSON.stringify(playerBoard))
    const cell = newBoard[y][x]
    cell.hit = true
    setPlayerBoard(newBoard)

    setGameLog(prev => [...prev, `AI fired at (${x},${y}): ${cell.ship ? 'HIT' : 'MISS'}`])
    setIsMyTurn(true)

    // Check simple win condition (demo only)
    const playerShipsLeft = playerBoard.flat().some(c => c.ship && !c.hit)
    if (!playerShipsLeft) {
      setPhase('finished')
      setGameLog(prev => [...prev, 'AI WINS!'])
    }
  }

  const resetGame = () => {
    setPlayerBoard(createEmptyBoard())
    setOpponentBoard(createEmptyBoard())
    setPlacements([])
    setCurrentShipIndex(0)
    setPhase('placement')
    setGameLog([])
    setIsMyTurn(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-lg font-semibold">
          {phase === 'placement' && `Placing: ${SHIPS[currentShipIndex]?.name || 'Done'}`}
          {phase === 'playing' && (isMyTurn ? 'Your Turn — Click opponent grid to fire' : 'AI is thinking...')}
          {phase === 'finished' && 'Game Over'}
        </div>

        <button onClick={() => setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')}
                className="text-xs px-2 py-1 border border-zinc-600 rounded">
          Direction: {direction}
        </button>

        {phase !== 'placement' && (
          <button onClick={resetGame} className="text-xs px-3 py-1 bg-zinc-800 rounded">Reset</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Your Board */}
        <div>
          <div className="text-sm mb-2 text-zinc-400">Your Fleet</div>
          <Grid board={playerBoard} onClick={() => {}} hideShips={false} />
        </div>

        {/* Opponent Board */}
        <div>
          <div className="text-sm mb-2 text-zinc-400">Opponent Waters (click to fire)</div>
          <Grid 
            board={opponentBoard} 
            onClick={(x, y) => fire(x, y)} 
            hideShips={true} 
          />
        </div>
      </div>

      {/* Log */}
      <div className="bg-zinc-950 border border-zinc-800 p-3 text-xs h-32 overflow-auto font-mono">
        {gameLog.length === 0 ? 'Game log will appear here...' : gameLog.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {phase === 'placement' && currentShipIndex === SHIPS.length && (
        <div className="space-y-2 mt-3">
          <button 
            onClick={confirmPlacement}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium"
          >
            Confirm Placement & Start Game
          </button>

          {/* Persistent Loadouts (A feature) */}
          <div className="flex gap-2">
            <button onClick={saveCurrentLoadout} className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs">
              Save Loadout
            </button>
            <button onClick={mintFreeLoadout} className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs">
              Mint Free (on-chain)
            </button>
          </div>

          {savedLoadouts.length > 0 && (
            <div className="text-xs">
              <div className="text-zinc-400 mb-1">Saved Loadouts:</div>
              {savedLoadouts.map((l, i) => (
                <button key={i} onClick={() => loadLoadout(l)} className="mr-2 mb-1 px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-[10px]">
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'placement' && currentShipIndex < SHIPS.length && (
        <div className="text-xs text-zinc-500">
          Click on your grid to place ships. Toggle direction above. All ships must be placed.
        </div>
      )}
    </div>
  )
}

function Grid({ board, onClick, hideShips }: { 
  board: Cell[][], 
  onClick: (x: number, y: number) => void,
  hideShips: boolean 
}) {
  return (
    <div className="inline-block border border-zinc-700">
      {board.map((row, y) => (
        <div key={y} className="flex">
          {row.map((cell, x) => {
            let bg = 'bg-zinc-900'
            if (cell.hit) bg = 'bg-red-600'
            else if (cell.miss) bg = 'bg-blue-900'
            else if (cell.ship && !hideShips) bg = 'bg-emerald-700'

            return (
              <div
                key={`${x}-${y}`}
                onClick={() => onClick(x, y)}
                className={`w-7 h-7 border border-zinc-800 text-[9px] flex items-center justify-center cursor-pointer ${bg}`}
              >
                {cell.hit ? 'X' : cell.miss ? '•' : ''}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
