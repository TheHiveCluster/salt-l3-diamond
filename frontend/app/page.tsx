'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useState } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { getDiamondAddress, DIAMOND_ABI } from './lib/contracts'
import { GameBoard } from './components/GameBoard'

const DIAMOND = getDiamondAddress()

export default function Home() {
  const { address, isConnected } = useAccount()
  const [stakeAmount, setStakeAmount] = useState('10')
  const [withdrawSalt, setWithdrawSalt] = useState('100')
  const [depositUsdc, setDepositUsdc] = useState('1')

  // Game state
  const [currentMatchId, setCurrentMatchId] = useState<number | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'>('human-vs-ai')
  const [matchStatus, setMatchStatus] = useState<'idle' | 'waiting' | 'matched' | 'spectator'>('idle')
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [opponentAddress, setOpponentAddress] = useState<string | null>(null)

  // Agent registration state (Phase 1)
  const [agentURIToRegister, setAgentURIToRegister] = useState('')

  // Phase 3: Agent Assets Viewer state + reads
  const [viewAgentId, setViewAgentId] = useState('')

  // Phase 4: AvA Betting UI state
  const [betAmount, setBetAmount] = useState('0.05')
  const [betSide, setBetSide] = useState<'alpha' | 'beta'>('alpha')

  // Phase 4+: Dynamic AvA match config (supports arbitrary agentIds)
  const [avaMatchId, setAvaMatchId] = useState(172341)
  const [avaAgentId1, setAvaAgentId1] = useState(8001)
  const [avaAgentId2, setAvaAgentId2] = useState(8002)

  // Simple in-app toast system (no extra deps)
  type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' }
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4500)
  }

  const { data: agentHeroes } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getAgentHeroes',
    args: viewAgentId ? [BigInt(viewAgentId)] : undefined,
    query: { enabled: !!viewAgentId },
  })

  const { data: agentLoadouts } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getAgentLoadouts',
    args: viewAgentId ? [BigInt(viewAgentId)] : undefined,
    query: { enabled: !!viewAgentId },
  })

  // Phase 4: Live AvA Betting info (uses dynamic agentIds)
  const isAvABettingActive = matchStatus === 'spectator' && currentMatchId

  const { data: bettingInfo } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getAvABettingInfo',
    args: isAvABettingActive 
      ? [BigInt(avaMatchId), BigInt(avaAgentId1), BigInt(avaAgentId2)] 
      : undefined,
    query: { enabled: isAvABettingActive },
  })

  // User's personal bets on this match
  const { data: userBetsData } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getUserBets',
    args: (isAvABettingActive && address) 
      ? [BigInt(avaMatchId), address, BigInt(avaAgentId1), BigInt(avaAgentId2)] 
      : undefined,
    query: { enabled: isAvABettingActive && !!address },
  })

  // Real agent data from AgentIdentityFacet
  const { data: agent1Data } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getAgent',
    args: [BigInt(avaAgentId1)],
    query: { enabled: isAvABettingActive },
  })

  const { data: agent2Data } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getAgent',
    args: [BigInt(avaAgentId2)],
    query: { enabled: isAvABettingActive },
  })

  // Poll for H2H match
  const pollForMatch = (playerAddr: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3001/matchmaking/status?playerAddress=${playerAddr}`)
        const data = await res.json()

        if (data.status === 'matched') {
          clearInterval(interval)
          setCurrentMatchId(data.matchId)
          setOpponentAddress(data.opponent)
          setMatchStatus('matched')
          setQueuePosition(null)

          // Trigger on-chain payment
          const fee = parseUnits('0.01', 18)
          await writeContract({
            address: DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'payToEnterMatch',
            args: [BigInt(data.matchId), playerAddr as `0x${string}`],
          })

          setGameStarted(true)
        } else if (data.status === 'waiting') {
          setQueuePosition(data.queuePosition)
        }
      } catch (e) {
        console.log('Polling error', e)
      }
    }, 2000) // poll every 2 seconds
  }

  const { writeContract, data: hash, isPending } = useWriteContract()

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash })

  // === Reads (Staking + Collateral + Balance) ===
  const { data: saltBalance } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { data: staked } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'stakedBalanceOf',
    args: address ? [address] : undefined,
  })

  const { data: pending } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'pendingRewards',
    args: address ? [address] : undefined,
  })

  const { data: totalStaked } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'totalStaked',
  })

  const { data: backing } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getBackingRatio',
  })

  // My Stats (A polish)
  const { data: playerStats } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // === Actions ===
  const stake = () => {
    if (!address) return
    const amt = parseUnits(stakeAmount || '0', 18)
    writeContract({
      address: DIAMOND,
      abi: DIAMOND_ABI,
      functionName: 'stake',
      args: [amt],
    })
  }

  const claim = () => {
    writeContract({
      address: DIAMOND,
      abi: DIAMOND_ABI,
      functionName: 'claimRevenueRewards',
    })
  }

  const depositCollateral = () => {
    const amt = parseUnits(depositUsdc || '0', 6) // assume 6 dec USDC for demo
    writeContract({
      address: DIAMOND,
      abi: DIAMOND_ABI,
      functionName: 'depositUSDC',
      args: [amt],
    })
  }

  const withdrawCollateral = () => {
    const amt = parseUnits(withdrawSalt || '0', 18)
    writeContract({
      address: DIAMOND,
      abi: DIAMOND_ABI,
      functionName: 'withdrawUSDC',
      args: [amt],
    })
  }

  // Phase 4: Place bet on AvA match (supports arbitrary agentIds)
  const placeAvABet = async () => {
    if (!address || !currentMatchId) return

    const onAgentId = betSide === 'alpha' ? avaAgentId1 : avaAgentId2
    const amount = parseUnits(betAmount || '0', 18)

    try {
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'placeBet',
        args: [BigInt(avaMatchId), BigInt(onAgentId), amount],
      })
      showToast(`Bet of ${betAmount} SALT placed on ${betSide === 'alpha' ? 'Agent ' + avaAgentId1 : 'Agent ' + avaAgentId2}`, 'success')
    } catch (e: any) {
      console.error('Bet failed', e)
      showToast('Bet failed: ' + (e?.message || 'Unknown error'), 'error')
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-full" />
            <span className="font-semibold text-xl tracking-tight">SALT</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#game" className="hover:text-zinc-400">Game</a>
            <a href="#stake" className="hover:text-zinc-400">Stake</a>
            <a href="#collateral" className="hover:text-zinc-400">Collateral</a>
            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-6xl font-bold tracking-tighter mb-4">The Agent-Friendly Economy</h1>
        <p className="text-xl text-zinc-400 mb-8">Play. Stake. Backed by real USDC at 0.01. Revenue to stakers.</p>
        <div className="flex gap-4 justify-center">
          <a href="#game" className="btn-primary">Play Now</a>
          <a href="#stake" className="btn-secondary">Start Staking</a>
        </div>
      </div>

      {/* GAME — Fully wired lobby (C) */}
      <div id="game" className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800">
        <h2 className="text-4xl font-semibold tracking-tight mb-8">Play Battleship — Equal Price for Humans & Agents</h2>

        {/* Game Mode Selector */}
        <div className="mb-6">
          <div className="text-sm text-zinc-400 mb-2">Choose Match Type</div>
          <div className="flex flex-wrap gap-3">
            {[
              { value: 'human-vs-human', label: 'Human vs Human', desc: 'Play against other players' },
              { value: 'human-vs-ai', label: 'Human vs AI Agent', desc: 'Play against an autonomous agent' },
              { value: 'ai-vs-ai', label: 'Watch AI vs AI', desc: 'Spectate + bet on agent matches (coming)' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setSelectedMode(mode.value as any)}
                className={`px-4 py-2 rounded border text-left transition-all ${
                  selectedMode === mode.value 
                    ? 'border-white bg-zinc-800' 
                    : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs text-zinc-500">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* My Stats Panel */}
        {address && (
          <div className="mb-6 p-4 border border-zinc-700 rounded-lg bg-zinc-950">
            <div className="text-sm text-zinc-400 mb-2">Your On-Chain Record (Experience)</div>
            <div className="flex gap-8 text-sm">
              <div>Wins: <span className="text-emerald-400 font-semibold">{playerStats ? Number(playerStats[0]) : 0}</span></div>
              <div>Losses: <span className="text-red-400 font-semibold">{playerStats ? Number(playerStats[1]) : 0}</span></div>
              <div>Games: <span className="text-zinc-300">{playerStats ? Number(playerStats[2]) : 0}</span></div>
              <div>Win Rate: <span className="text-white">
                {playerStats && Number(playerStats[2]) > 0 
                  ? Math.round((Number(playerStats[0]) / Number(playerStats[2])) * 100) + '%' 
                  : '—'}
              </span></div>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Used for experience-based matchmaking</div>
          </div>
        )}

        {/* Agent Identity Registration (Phase 1 early UI) */}
        {address && (
          <div className="mb-6 p-4 border border-emerald-800 rounded-lg bg-zinc-950">
            <div className="text-sm text-emerald-400 mb-2 font-medium">Agent Identity (ERC-8004 style)</div>
            <div className="flex gap-3 items-center">
              <input 
                type="text" 
                placeholder="Agent metadata URI (ipfs://... or https://...)"
                value={agentURIToRegister}
                onChange={(e) => setAgentURIToRegister(e.target.value)}
                className="flex-1 bg-black border border-zinc-700 px-3 py-2 text-sm rounded"
              />
              <button 
                onClick={async () => {
                  if (!agentURIToRegister) return alert('Enter agent URI');
                  try {
                    await writeContract({
                      address: DIAMOND,
                      abi: DIAMOND_ABI,
                      functionName: 'registerAgent',
                      args: [address, agentURIToRegister],
                    });
                    showToast('Agent registration transaction sent!', 'success');
                    setAgentURIToRegister('');
                  } catch (e) {
                    showToast('Registration failed (AgentIdentityFacet not yet deployed or not authorized)', 'error');
                  }
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm whitespace-nowrap"
              >
                Register Agent
              </button>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Mints a real on-chain Agent ID (facet must be deployed first).</div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-2xl font-semibold mb-3">
              {selectedMode === 'ai-vs-ai' ? 'Watch AI Match' : 'Join Match'} (0.01 USD SALT)
            </h3>

            <button
              onClick={async () => {
                if (!address) { showToast('Connect wallet first', 'error'); return }

                // === AI vs AI Spectator (Phase 3 - user chooses agentIds) ===
                if (selectedMode === 'ai-vs-ai') {
                  const agentId1Str = prompt("Enter Agent ID for Alpha (e.g. 8001):", "8001");
                  const agentId2Str = prompt("Enter Agent ID for Beta (e.g. 8002):", "8002");
                  const agentId1 = Number(agentId1Str) || 8001;
                  const agentId2 = Number(agentId2Str) || 8002;

                  const res = await fetch('http://localhost:3001/matchmaking/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      playerAddress: address, 
                      mode: 'ai-vs-ai',
                      agentId1,
                      agentId2 
                    })
                  })
                  const data = await res.json()
                  const matchId = data.matchId || Date.now()

                  setCurrentMatchId(Number(matchId))
                  setMatchStatus('spectator')
                  setGameStarted(true)
                  return
                }

                // === Human vs Human - Real Queue ===
                if (selectedMode === 'human-vs-human') {
                  try {
                    const res = await fetch('http://localhost:3001/matchmaking/join', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ playerAddress: address, mode: 'human-vs-human' })
                    })
                    const data = await res.json()

                    if (data.status === 'waiting') {
                      setMatchStatus('waiting')
                      setQueuePosition(data.queuePosition)
                      // Start polling for match
                      pollForMatch(address)
                      return
                    }

                    if (data.status === 'matched') {
                      setCurrentMatchId(data.matchId)
                      setOpponentAddress(data.opponent)
                      setMatchStatus('matched')
                      setGameStarted(true)

                      // Still do the on-chain payment
                      const fee = parseUnits('0.01', 18)
                      await writeContract({
                        address: DIAMOND,
                        abi: DIAMOND_ABI,
                        functionName: 'payToEnterMatch',
                        args: [BigInt(data.matchId), address],
                      })
                      return
                    }
                  } catch (e: any) {
                    alert('Error joining queue: ' + (e.message || e))
                  }
                  return
                }

                // === Human vs AI (default) ===
                try {
                  const res = await fetch('http://localhost:3001/matchmaking/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerAddress: address, mode: 'human-vs-ai' })
                  })
                  const data = await res.json()
                  const matchId = data.matchId || Date.now()

                  const fee = parseUnits('0.01', 18)
                  await writeContract({
                    address: DIAMOND,
                    abi: DIAMOND_ABI,
                    functionName: 'payToEnterMatch',
                    args: [BigInt(matchId), address],
                  })

                  setCurrentMatchId(Number(matchId))
                  setMatchStatus('matched')
                  setGameStarted(true)
                } catch (e: any) {
                  alert('Error: ' + (e.message || e))
                }
              }}
              disabled={!isConnected || isPending}
              className="btn-primary w-full"
            >
              {selectedMode === 'ai-vs-ai' 
                ? 'Enter AI vs AI Spectator (Free)' 
                : selectedMode === 'human-vs-human'
                ? 'Join Human Queue (0.01 SALT)'
                : 'Play vs AI Agent (0.01 SALT)'}
            </button>

            <div className="text-xs text-zinc-500 mt-2">
              {selectedMode === 'ai-vs-ai' 
                ? 'Humans can watch AI battles here. Betting & Hero influence coming.' 
                : 'Calls your game server + GamePaymentFacet.payToEnterMatch'}
            </div>
          </div>

          <div className="card text-sm">
            <div>Game server must be running: <code>cd backend/game-server && npm run dev</code></div>
            <div className="mt-2">After pay, moves go to /game/move. AvA matches are watch-only for now.</div>
          </div>
        </div>

        {/* Waiting for Human Opponent */}
        {matchStatus === 'waiting' && (
          <div className="mt-8 border border-zinc-700 rounded-xl p-8 text-center bg-zinc-950">
            <div className="text-2xl mb-2">Waiting for opponent...</div>
            <div className="text-zinc-400">Queue position: #{queuePosition}</div>
            <div className="text-sm text-zinc-500 mt-4">0.01 SALT will be charged when matched</div>
            <button 
              onClick={() => { setMatchStatus('idle'); setQueuePosition(null) }}
              className="mt-6 text-xs underline text-zinc-400"
            >
              Cancel Queue
            </button>
          </div>
        )}

        {/* AvA Main Landing - Active Matches + Finalized Feed */}
        {!gameStarted && (
          <div className="mt-8 border border-zinc-700 rounded-2xl p-6 bg-zinc-950">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-semibold">AvA — Agent Battles</h3>
              <button 
                onClick={() => {
                  // Quick enter one match
                  const id = Date.now()
                  setCurrentMatchId(id)
                  setMatchStatus('spectator')
                  setGameStarted(true)
                }}
                className="text-xs px-4 py-1.5 border border-zinc-600 hover:bg-zinc-800 rounded-full"
              >
                Enter Betting Arena
              </button>
            </div>

            {/* Active Matches List */}
            <div className="mb-6">
              <div className="text-xs text-zinc-400 mb-2">LIVE MATCHES</div>
              <div className="space-y-2 text-sm">
                <div onClick={() => { 
                      setAvaMatchId(172341); setAvaAgentId1(8001); setAvaAgentId2(8002);
                      setCurrentMatchId(172341); setMatchStatus('spectator'); setGameStarted(true) 
                    }} 
                      className="flex justify-between items-center p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer border border-zinc-700">
                   <div>Alpha #8001 vs Beta #8002</div>
                   <div className="text-emerald-400 text-xs">LIVE • 4.8 SALT pooled</div>
                 </div>
                 <div onClick={() => { 
                      setAvaMatchId(172342); setAvaAgentId1(8003); setAvaAgentId2(8004);
                      setCurrentMatchId(172342); setMatchStatus('spectator'); setGameStarted(true) 
                    }} 
                      className="flex justify-between items-center p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer border border-zinc-700">
                   <div>Gamma #8003 vs Delta #8004</div>
                   <div className="text-emerald-400 text-xs">LIVE • 2.1 SALT pooled</div>
                 </div>
              </div>
            </div>

            {/* Finalized Matches Chat Feed with ZK */}
            <div>
              <div className="text-xs text-zinc-400 mb-2">FINALIZED • ZK PROVEN</div>
              <div className="bg-black border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-400 h-28 overflow-auto space-y-1">
                <div>Match #172301 — Alpha #8001 won • ZK Proof: 0x4a2f... verified</div>
                <div>Match #172298 — Beta #8002 won • ZK Proof: 0x9c1e... verified</div>
                <div>Match #172295 — Draw (both sunk) • ZK Proof: 0x7d3b... verified</div>
              </div>
            <div className="text-[10px] text-center text-zinc-500 mt-2">All outcomes settled with ZKGameVerifierFacet</div>
            </div>

            {/* Agent Assets Viewer (Phase 3 - Fully functional) */}
            <div className="mt-6 p-4 border border-zinc-700 rounded-lg bg-zinc-900">
              <div className="text-sm font-medium mb-3 text-emerald-400">View Agent Assets (Heroes + Loadouts)</div>
              
              <div className="flex gap-2 mb-4">
                <input 
                  type="number" 
                  placeholder="Agent ID (e.g. 1)" 
                  value={viewAgentId}
                  onChange={(e) => setViewAgentId(e.target.value)}
                  className="w-32 bg-black border border-zinc-700 px-2 py-1 text-sm rounded"
                />
                <button 
                  onClick={() => {
                    // The reads below will automatically trigger when viewAgentId changes
                    if (!viewAgentId) showToast('Enter an Agent ID', 'error');
                  }}
                  className="px-4 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-sm"
                >
                  Load Agent Assets
                </button>
              </div>

              {viewAgentId && (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-emerald-400 text-xs mb-1">OWNED HEROES (tokenIds)</div>
                    <div className="bg-black p-2 rounded border border-zinc-700 min-h-[28px]">
                      {agentHeroes && agentHeroes.length > 0 
                        ? agentHeroes.map((id: bigint, i: number) => <span key={i} className="mr-2">#{id.toString()}</span>)
                        : <span className="text-zinc-500">No heroes bound yet</span>}
                    </div>
                  </div>

                  <div>
                    <div className="text-emerald-400 text-xs mb-1">REGISTERED LOADOUTS (hashes)</div>
                    <div className="bg-black p-2 rounded border border-zinc-700 min-h-[28px] font-mono text-xs break-all">
                      {agentLoadouts && agentLoadouts.length > 0 
                        ? agentLoadouts.map((hash: string, i: number) => <div key={i}>{hash}</div>)
                        : <span className="text-zinc-500">No loadouts registered</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AvA Betting Arena - Full Spec Implementation */}
        {matchStatus === 'spectator' && gameStarted && currentMatchId && (
          <div className="mt-8 border border-zinc-700 rounded-2xl p-6 bg-zinc-950 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-semibold tracking-tight">AvA Betting Arena</h3>
              <div className="text-xs px-3 py-1 bg-zinc-800 rounded-full border border-zinc-700">Match #{currentMatchId} • Live</div>
            </div>

            {/* Dynamic Agent Cards - pulls real data from AgentIdentityFacet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Agent 1 */}
              <div className="border border-emerald-900 bg-zinc-900 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold text-emerald-400">
                      {agent1Data ? (agent1Data[2] || `Agent ${avaAgentId1}`) : `Agent ${avaAgentId1}`}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">AGENT ID: {avaAgentId1} (on-chain)</div>
                  </div>
                  <div className="text-right text-xs">
                    <div>Your Bet: <span className="text-emerald-400">{userBetsData ? (Number(userBetsData[0]) / 1e18).toFixed(4) : '0'} SALT</span></div>
                  </div>
                </div>
                <div className="text-xs text-zinc-400 mb-1">On-chain Agent Data</div>
                <div className="text-sm space-y-0.5 text-zinc-300">
                  <div>URI: <span className="font-mono text-[10px]">{agent1Data ? agent1Data[2] : '—'}</span></div>
                  <div>Controller: <span className="font-mono text-[10px]">{agent1Data ? agent1Data[1]?.slice(0,10) + '...' : '—'}</span></div>
                </div>
              </div>

              {/* Agent 2 */}
              <div className="border border-red-900 bg-zinc-900 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold text-red-400">
                      {agent2Data ? (agent2Data[2] || `Agent ${avaAgentId2}`) : `Agent ${avaAgentId2}`}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">AGENT ID: {avaAgentId2} (on-chain)</div>
                  </div>
                  <div className="text-right text-xs">
                    <div>Your Bet: <span className="text-red-400">{userBetsData ? (Number(userBetsData[1]) / 1e18).toFixed(4) : '0'} SALT</span></div>
                  </div>
                </div>
                <div className="text-xs text-zinc-400 mb-1">On-chain Agent Data</div>
                <div className="text-sm space-y-0.5 text-zinc-300">
                  <div>URI: <span className="font-mono text-[10px]">{agent2Data ? agent2Data[2] : '—'}</span></div>
                  <div>Controller: <span className="font-mono text-[10px]">{agent2Data ? agent2Data[1]?.slice(0,10) + '...' : '—'}</span></div>
                </div>
              </div>
            </div>

            {/* Arbitary Agent ID Inputs (Phase 4+ flexibility) */}
            <div className="border border-zinc-700 bg-zinc-950 rounded-xl p-4 text-xs">
              <div className="text-zinc-400 mb-2 font-medium">Configure Custom AvA Match (arbitrary agentIds supported)</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-zinc-500 mb-1">Match ID</div>
                  <input type="number" value={avaMatchId} onChange={e => setAvaMatchId(Number(e.target.value))} className="w-full bg-black border border-zinc-700 px-2 py-1 rounded" />
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Agent 1 ID</div>
                  <input type="number" value={avaAgentId1} onChange={e => setAvaAgentId1(Number(e.target.value))} className="w-full bg-black border border-zinc-700 px-2 py-1 rounded" />
                </div>
                <div>
                  <div className="text-zinc-500 mb-1">Agent 2 ID</div>
                  <input type="number" value={avaAgentId2} onChange={e => setAvaAgentId2(Number(e.target.value))} className="w-full bg-black border border-zinc-700 px-2 py-1 rounded" />
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 mt-2">Changes apply immediately to the betting panel below.</div>
            </div>

            {/* Map View (Dual Boards) + Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Map View */}
              <div className="lg:col-span-2 border border-zinc-700 rounded-xl p-4 bg-black">
                <div className="text-xs text-zinc-400 mb-2 flex items-center gap-2">
                  MAP VIEW <span className="text-[10px] text-emerald-500">● LIVE</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-emerald-400 mb-1">Alpha</div>
                    <GameBoard matchId={currentMatchId} playerAddress={address} spectator={true} />
                  </div>
                  <div>
                    <div className="text-[10px] text-red-400 mb-1">Beta</div>
                    <GameBoard matchId={currentMatchId} playerAddress={address} spectator={true} />
                  </div>
                </div>
              </div>

              {/* Live Data Feed */}
              <div className="border border-zinc-700 rounded-xl p-4 bg-zinc-900 text-xs font-mono h-[280px] overflow-auto">
                <div className="text-emerald-400 mb-2 sticky top-0 bg-zinc-900">LIVE FEED</div>
                <div className="space-y-1 text-zinc-400">
                  <div>12:41 Alpha fired (7,3) → HIT</div>
                  <div>12:42 Beta destroyed Cruiser</div>
                  <div>12:43 Alpha HP -12%</div>
                  <div className="text-emerald-500">12:44 New bet: 0.14 SALT on Alpha</div>
                  <div>12:45 Beta accuracy now 59%</div>
                </div>
              </div>
            </div>

            {/* Real On-Chain AvA Betting Market */}
            <div className="border border-zinc-700 rounded-xl p-5 bg-black">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium">Betting Market (On-Chain)</div>
                  <div className="text-xs text-zinc-500">Proportional parimutuel • Settles with match</div>
                </div>
                <div className="text-right text-xs">
                  {bettingInfo ? (
                    <>
                      <div>
                        Alpha: {bettingInfo[1] ? Number(bettingInfo[1]) / 1e18 : 0} SALT • 
                        Beta: {bettingInfo[2] ? Number(bettingInfo[2]) / 1e18 : 0} SALT
                      </div>
                      <div className="text-zinc-500">
                         Total Pool: {bettingInfo[0] ? Number(bettingInfo[0]) / 1e18 : 0} SALT
                         {bettingInfo[4] && ` • Settled (Winner: Agent ${bettingInfo[3]})`}
                      </div>
                    </>
                  ) : (
                    <div className="text-zinc-500">Loading betting data...</div>
                  )}
                </div>
              </div>

              {/* Bet Controls */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setBetSide('alpha')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border ${betSide === 'alpha' ? 'bg-emerald-700 border-emerald-600' : 'bg-zinc-900 border-zinc-700'}`}
                  >
                    Bet on Agent {avaAgentId1}
                  </button>
                  <button
                    onClick={() => setBetSide('beta')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border ${betSide === 'beta' ? 'bg-red-700 border-red-600' : 'bg-zinc-900 border-zinc-700'}`}
                  >
                    Bet on Agent {avaAgentId2}
                  </button>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm font-mono"
                    placeholder="0.05"
                  />
                  <button onClick={() => setBetAmount('0.05')} className="px-3 py-2 text-xs bg-zinc-800 rounded-lg">0.05</button>
                  <button onClick={() => setBetAmount('0.1')} className="px-3 py-2 text-xs bg-zinc-800 rounded-lg">0.1</button>
                  <button onClick={() => setBetAmount('0.25')} className="px-3 py-2 text-xs bg-zinc-800 rounded-lg">0.25</button>
                  <button onClick={() => setBetAmount('0.5')} className="px-3 py-2 text-xs bg-zinc-800 rounded-lg">0.5</button>
                </div>

                <button
                  onClick={placeAvABet}
                  disabled={!isConnected || (bettingInfo && bettingInfo[4])}
                  className="w-full py-3 rounded-xl bg-white text-black font-medium disabled:opacity-50 hover:bg-zinc-200"
                >
                  {!isConnected 
                    ? 'Connect Wallet to Bet' 
                    : (bettingInfo && bettingInfo[4]) 
                      ? 'Betting Closed (Match Settled)' 
                      : `Place ${betAmount} SALT on Agent ${betSide === 'alpha' ? avaAgentId1 : avaAgentId2}`
                  }
                </button>
              </div>

              <div className="mt-3 text-[10px] text-center text-zinc-500">
                Real parimutuel: winners split the entire pool proportionally. Auto-settled when server calls settleMatch.
              </div>

              {/* My Bets Summary for this match */}
              <div className="mt-4 pt-3 border-t border-zinc-800 text-xs">
                <div className="text-zinc-400 mb-1 font-medium">My Bets on this Match</div>
                <div className="flex justify-between text-zinc-300">
                  <div>On Agent {avaAgentId1}: <span className="text-emerald-400">{userBetsData ? (Number(userBetsData[0]) / 1e18).toFixed(4) : '0.0000'} SALT</span></div>
                  <div>On Agent {avaAgentId2}: <span className="text-red-400">{userBetsData ? (Number(userBetsData[1]) / 1e18).toFixed(4) : '0.0000'} SALT</span></div>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">Total wagered by you: {(userBetsData ? (Number(userBetsData[0]) + Number(userBetsData[1])) / 1e18 : 0).toFixed(4)} SALT</div>
              </div>

              {/* Claim Winnings (only shows if settled) */}
              {bettingInfo && bettingInfo[4] && (
                <button
                  onClick={async () => {
                    try {
                      const winnerAgent = bettingInfo[3]
                      await writeContract({
                        address: DIAMOND,
                        abi: DIAMOND_ABI,
                        functionName: 'claimWinnings',
                        args: [BigInt(avaMatchId), winnerAgent],
                      })
                      showToast('Claim transaction sent!', 'success')
                    } catch (e: any) {
                      showToast('Claim failed: ' + (e?.message || 'Unknown error'), 'error')
                    }
                  }}
                  className="mt-2 w-full py-2 text-sm rounded-xl border border-amber-600 text-amber-400 hover:bg-amber-950"
                >
                  Claim Winnings (if you bet on the winner)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Full Playable Game Board */}
        {gameStarted && currentMatchId && (
          <div className="mt-10 border border-zinc-800 rounded-xl p-6 bg-zinc-950">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Live Game — Match #{currentMatchId}</h3>
              <button onClick={() => { setGameStarted(false); setCurrentMatchId(null) }} className="text-xs text-zinc-400">Close Board</button>
            </div>
            <GameBoard 
              matchId={currentMatchId} 
              playerAddress={address} 
              onGameOver={(winner) => {
                console.log('Game over, winner:', winner)
              }} 
              onCommitShips={async (commitment: string) => {
                if (!isConnected) return
                try {
                  await writeContract({
                    address: DIAMOND,
                    abi: DIAMOND_ABI,
                    functionName: 'commitShipPlacement',
                    args: [BigInt(currentMatchId!), commitment as `0x${string}`],
                  })
                  console.log('[B] Committed ships on-chain')
                } catch (e) {
                  console.log('[B] Commit call (demo):', e)
                }
              }}
              onMintLoadout={async (placementHash: string) => {
                if (!isConnected) return
                try {
                  await writeContract({
                    address: DIAMOND,
                    abi: DIAMOND_ABI,
                    functionName: 'registerFreeLoadout',
                    args: [placementHash as `0x${string}`],
                  })
                  console.log('[A] Free loadout registered on-chain')
                } catch (e) {
                  console.log('[A] Loadout mint call:', e)
                }
              }}
            />
          </div>
        )}
      </div>

      {/* STAKING - Fully functional */}
      <div id="stake" className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800">
        <h2 className="text-4xl font-semibold tracking-tight mb-8">Stake SALT — Earn Real Revenue</h2>

        <div className="grid md:grid-cols-4 gap-6">
          <div className="card">
            <div className="text-sm text-zinc-400">Your SALT</div>
            <div className="text-3xl font-semibold mb-4">
              {saltBalance ? formatUnits(saltBalance as bigint, 18) : '0.00'}
            </div>
            <input className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded mb-2" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} />
            <button onClick={stake} disabled={!isConnected || isPending} className="btn-primary w-full">
              {isPending || isConfirming ? 'Staking...' : 'Stake'}
            </button>
          </div>

          <div className="card">
            <div className="text-sm text-zinc-400">Currently Staked</div>
            <div className="text-3xl font-semibold mb-4">
              {staked ? formatUnits(staked as bigint, 18) : '0.00'}
            </div>
            <div className="text-xs text-zinc-500 mb-2">Total protocol staked: {totalStaked ? formatUnits(totalStaked as bigint, 18) : '0'}</div>
            <button onClick={claim} disabled={!isConnected || isPending} className="btn-secondary w-full">
              Claim Revenue Rewards
            </button>
            <div className="text-xs mt-2 text-green-400">
              Pending: {pending ? formatUnits(pending as bigint, 18) : '0'}
            </div>
          </div>

          <div className="card col-span-2">
            <div className="text-sm text-zinc-400 mb-1">Backing Ratio (on-chain)</div>
            <div className="text-4xl font-semibold text-emerald-400">
              {backing ? ((Number(backing) / 1e18) * 100).toFixed(1) : '0'}%
            </div>
            <div className="text-xs text-zinc-500 mt-1">USDC reserves backing SALT supply (target 100% at 0.01)</div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-4">40% of all protocol fees (bridge, collateral, games) flow to stakers automatically.</p>
      </div>

      {/* COLLATERAL - Functional (requires USDC on the L3) */}
      <div id="collateral" className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800">
        <h2 className="text-4xl font-semibold tracking-tight mb-8">USDC Collateral — Mint/Burn SALT at 0.01</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold mb-3">Deposit USDC → Mint 100× SALT</h3>
            <input className="w-full bg-zinc-900 border p-2 rounded mb-2" value={depositUsdc} onChange={e=>setDepositUsdc(e.target.value)} placeholder="USDC amount (6 decimals demo)" />
            <button onClick={depositCollateral} disabled={!isConnected || isPending} className="btn-primary w-full">
              Deposit & Mint
            </button>
            <div className="text-[10px] text-zinc-500 mt-2">Requires USDC already bridged to this L3 + approved to the diamond.</div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Burn SALT → Withdraw USDC</h3>
            <input className="w-full bg-zinc-900 border p-2 rounded mb-2" value={withdrawSalt} onChange={e=>setWithdrawSalt(e.target.value)} />
            <button onClick={withdrawCollateral} disabled={!isConnected || isPending} className="btn-secondary w-full">
              Withdraw USDC
            </button>
            <div className="text-[10px] text-zinc-500 mt-2">Small fee + circuit breaker protection apply.</div>
          </div>
        </div>
      </div>

      <footer className="border-t border-zinc-800 py-8 text-center text-sm text-zinc-500">
        SALT Protocol — Humans and agents pay the same. Revenue shared with stakers.
      </footer>

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-xl shadow text-sm border ${
              toast.type === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' :
              toast.type === 'error' ? 'bg-red-950 border-red-700 text-red-300' :
              'bg-zinc-900 border-zinc-700 text-zinc-300'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  )
}
