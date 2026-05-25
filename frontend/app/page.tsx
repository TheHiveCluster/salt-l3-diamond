'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useChains } from 'wagmi'
import { useState, useEffect } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { getDiamondAddress, DIAMOND_ABI, ERC20_ABI, getGamingAssetNFTAddress, GAMING_ASSET_NFT_ABI } from './lib/contracts'
import { GameBoard } from './components/GameBoard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const DIAMOND = getDiamondAddress()
const GAMING_NFT = getGamingAssetNFTAddress()

export default function Home() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const chains = useChains()
  const { switchChainAsync } = useSwitchChain()
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

  // === Dock 9 State (unified economics) ===
  const [dockUsdcAmount, setDockUsdcAmount] = useState('10')
  const [dockStakeAmount, setDockStakeAmount] = useState('50')
  const [dockWithdrawSalt, setDockWithdrawSalt] = useState('100')
  const [chartTimeframe, setChartTimeframe] = useState<'5m' | '1h' | '6h' | '1d' | '1w' | 'all'>('1h')
  const [priceHistory, setPriceHistory] = useState<any[]>([])
  const [volumeHistory, setVolumeHistory] = useState<any[]>([]) // {time, deposits, withdrawals}

  // NFT Mint Test (Option A - using existing TestGamingAssetNFT from one-shot)
  const [nftMintTo, setNftMintTo] = useState('')
  const [nftTokenId, setNftTokenId] = useState('1001')
  const [nftUri, setNftUri] = useState('ipfs://test-hero-mint')
  const [nftLevel, setNftLevel] = useState('1')
  const [nftPower, setNftPower] = useState('50')

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

  // USDC token address from CollateralFacet (needed for approvals)
  const { data: usdcTokenAddress } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'usdcToken',
  })

  // === Dock 9 Live Reads (allowances + reserves) ===
  const { data: usdcAllowance } = useReadContract({
    address: usdcTokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && usdcTokenAddress ? [address, DIAMOND] : undefined,
    query: { enabled: !!address && !!usdcTokenAddress },
  })

  const { data: saltAllowance } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'allowance',
    args: address ? [address, DIAMOND] : undefined,
    query: { enabled: !!address },
  })

  const { data: usdcReserves } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getUSDCReserves',
  })

  const { data: totalSupply } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'totalSupply',
  })

  // My Stats (A polish)
  const { data: playerStats } = useReadContract({
    address: DIAMOND,
    abi: DIAMOND_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // === Dock 9 History Persistence (diamond-address keyed for future deploys) ===
  const storageKey = `dock9-history-${DIAMOND}-${address || 'anon'}`

  useEffect(() => {
    if (!address) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.price) setPriceHistory(parsed.price)
        if (parsed.volume) setVolumeHistory(parsed.volume)
      }
    } catch {}
  }, [address, DIAMOND])

  const saveHistory = (newPrice: any[], newVolume: any[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ price: newPrice, volume: newVolume }))
    } catch {}
  }

  const recordVolume = (type: 'deposit' | 'withdraw', amountUsdc: number) => {
    const now = Date.now()
    const point = { time: now, deposits: type === 'deposit' ? amountUsdc : 0, withdrawals: type === 'withdraw' ? amountUsdc : 0 }
    const updated = [...volumeHistory, point].slice(-200) // keep last 200 points
    setVolumeHistory(updated)

    // synthetic price point from current backing (simple)
    const backingNum = backing ? Number(backing) / 1e18 : 1
    const pricePoint = { time: now, price: backingNum * 0.01 } // scaled to ~0.01 target
    const updatedPrice = [...priceHistory, pricePoint].slice(-200)
    setPriceHistory(updatedPrice)

    saveHistory(updatedPrice, updated)
  }

  // === Dock 9 Smart Actions (exact amount, conditional approvals) ===
  const dockApproveUSDC = async () => {
    if (chainId !== 31337) {
      showToast('Switch to BuildBear (31337) first', 'error')
      return
    }
    if (!usdcTokenAddress) {
      showToast('USDC not configured on diamond', 'error')
      return
    }
    try {
      const amt = parseUnits(dockUsdcAmount || '0', 6)
      await writeContract({
        address: usdcTokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [DIAMOND, amt],
      })
      showToast('USDC approval sent for exact amount', 'info')
    } catch (e: any) {
      showToast('USDC approve failed: ' + (e?.message || 'Unknown'), 'error')
    }
  }

  const dockApproveSALT = async () => {
    if (chainId !== 31337) {
      showToast('Switch to BuildBear first', 'error')
      return
    }
    try {
      const amt = parseUnits(dockStakeAmount || '0', 18)
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'approve',
        args: [DIAMOND, amt],
      })
      showToast('SALT approval sent for exact amount', 'info')
    } catch (e: any) {
      showToast('SALT approve failed: ' + (e?.message || 'Unknown'), 'error')
    }
  }

  const dockDeposit = async () => {
    if (chainId !== 31337) { showToast('Switch to BuildBear first', 'error'); return }
    const amt = parseUnits(dockUsdcAmount || '0', 6)
    const allowance = usdcAllowance ? Number(usdcAllowance) : 0
    if (allowance < Number(amt)) {
      showToast('Approve USDC first (exact amount)', 'error')
      return
    }
    try {
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'depositUSDC',
        args: [amt],
      })
      recordVolume('deposit', Number(dockUsdcAmount || '0'))
      showToast('Deposit submitted', 'success')
    } catch (e: any) {
      showToast('Deposit failed: ' + (e?.message || ''), 'error')
    }
  }

  const dockWithdraw = async () => {
    if (chainId !== 31337) { showToast('Switch to BuildBear first', 'error'); return }
    const amt = parseUnits(dockWithdrawSalt || '0', 18)
    try {
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'withdrawUSDC',
        args: [amt],
      })
      recordVolume('withdraw', Number(dockWithdrawSalt || '0') / 100) // rough USDC equivalent
      showToast('Withdraw submitted', 'success')
    } catch (e: any) {
      showToast('Withdraw failed: ' + (e?.message || ''), 'error')
    }
  }

  const dockStake = async () => {
    if (chainId !== 31337) { showToast('Switch to BuildBear first', 'error'); return }
    const amt = parseUnits(dockStakeAmount || '0', 18)
    const allowance = saltAllowance ? Number(saltAllowance) : 0
    if (allowance < Number(amt)) {
      showToast('Approve SALT first (exact amount)', 'error')
      return
    }
    try {
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'stake',
        args: [amt],
      })
      showToast('Stake submitted', 'success')
    } catch (e: any) {
      showToast('Stake failed: ' + (e?.message || ''), 'error')
    }
  }

  const dockClaim = async () => {
    if (chainId !== 31337) { showToast('Switch to BuildBear first', 'error'); return }
    try {
      await writeContract({
        address: DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'claimRevenueRewards',
      })
      showToast('Claim submitted', 'success')
    } catch (e: any) {
      showToast('Claim failed: ' + (e?.message || ''), 'error')
    }
  }

  // Legacy actions kept for AvA/Game compatibility (can be removed later)
  const stake = dockStake
  const claim = dockClaim
  const depositCollateral = dockDeposit
  const withdrawCollateral = dockWithdraw
  const approveUSDC = dockApproveUSDC
  const approveSALT = dockApproveSALT

  // === Industry-Standard Wallet Network Flow (BuildBear custom chain) ===
  // Follows MetaMask + wagmi best practices:
  // 1. Prefer switchChainAsync (handles connector state properly)
  // 2. On "chain not found" (4902), auto-call wallet_addEthereumChain then retry switch
  // 3. Keep manual "Add Network" as fallback for edge cases

  const buildbearRpc = process.env.NEXT_PUBLIC_BUILDBEAR_RPC || ''
  const buildbearLabel = process.env.NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL || 'BuildBear'

  const addBuildBearNetwork = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      showToast('No injected wallet found', 'error')
      return
    }
    try {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x7a69',
          chainName: buildbearLabel,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [buildbearRpc],
          blockExplorerUrls: ['https://buildbear.io'],
        }],
      })
      showToast('Network added. Switching now...', 'success')
      await switchChainAsync?.({ chainId: 31337 })
    } catch (e: any) {
      showToast('Add network failed: ' + (e?.message || ''), 'error')
    }
  }

  const switchToBuildBear = async () => {
    if (!switchChainAsync) {
      showToast('Wallet switch not available', 'error')
      return
    }

    try {
      await switchChainAsync({ chainId: 31337 })
      showToast('Switched to BuildBear', 'success')
    } catch (error: any) {
      // Standard error code when chain is not added to wallet (MetaMask, etc.)
      const isChainNotAdded = error?.code === 4902 || 
        (error?.message && error.message.toLowerCase().includes('chain') && error.message.toLowerCase().includes('not'));

      if (isChainNotAdded) {
        showToast('BuildBear not in wallet — adding it now...', 'info')
        await addBuildBearNetwork()
      } else {
        showToast('Failed to switch: ' + (error?.message || 'Unknown error'), 'error')
      }
    }
  }

  // === NFT Mint Test (Option A) - mint directly to connected wallet on the deployed GamingAssetNFT ===
  const mintTestNFT = async () => {
    if (!address) { showToast('Connect wallet first', 'error'); return }
    if (chainId !== 31337) { showToast('Switch to BuildBear first (use the Switch button)', 'error'); return }
    if (!GAMING_NFT) { showToast('GamingAssetNFT address not configured', 'error'); return }

    try {
      const to = (nftMintTo || address) as `0x${string}`
      const tokenId = BigInt(nftTokenId || '0')
      const uri = nftUri || 'ipfs://test'
      const attrs = {
        level: BigInt(nftLevel || '1'),
        rarity: BigInt(1),
        power: BigInt(nftPower || '50'),
        gameId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        lastUsed: BigInt(0),
      }

      await writeContract({
        address: GAMING_NFT,
        abi: GAMING_ASSET_NFT_ABI,
        functionName: 'mint',
        args: [to, tokenId, uri, attrs],
      })
      showToast(`Minting Hero #${nftTokenId} to ${to.slice(0,6)}...`, 'success')
    } catch (e: any) {
      showToast('NFT mint failed: ' + (e?.message || ''), 'error')
    }
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
            <a href="#dock9" className="hover:text-zinc-400 font-medium">Dock 9</a>
            <a href="#game-full" className="hover:text-zinc-400">Game</a>

            {/* Network status for contract testing (BuildBear focus) */}
            <div className={`flex items-center gap-2 text-xs px-3 py-1 rounded border font-mono ${chainId === 31337 ? 'border-emerald-700 bg-emerald-950 text-emerald-400' : 'border-red-700 bg-red-950 text-red-400'}`}>
              {chainId === 31337 ? (
                '✓ BuildBear'
              ) : (
                <>
                  ⚠ Wrong Chain ({chainId || 'none'})
                  <button onClick={switchToBuildBear} className="underline hover:no-underline">Switch</button>
                  <button onClick={addBuildBearNetwork} className="underline hover:no-underline">Add Manually</button>
                </>
              )}
            </div>

            <ConnectButton />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-6xl font-bold tracking-tighter mb-4">The Agent-Friendly Economy</h1>
        <p className="text-xl text-zinc-400 mb-8">Play. Stake. Backed by real USDC at 0.01. Revenue to stakers.</p>
        <div className="flex gap-4 justify-center">
          <a href="#dock9" className="btn-primary">Test Economics (Dock 9)</a>
          <a href="#nft-test" className="btn-secondary">Mint NFT Test</a>
        </div>
      </div>

      {/* Strong warning for contract testing */}
      {chainId !== 31337 && isConnected && (
        <div className="max-w-4xl mx-auto px-6 mb-6">
          <div className="bg-red-950 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>
              ⚠️ You are not on BuildBear (chain 31337). All contract writes (stake, deposit, approve, etc.) will fail or do nothing.
            </span>
            <button
              onClick={switchToBuildBear}
              className="ml-4 px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs font-medium"
            >
              Switch to BuildBear
            </button>
            <button
              onClick={addBuildBearNetwork}
              className="ml-2 px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs font-medium"
            >
              Add Manually
            </button>
          </div>
        </div>
      )}

      {/* Quick Play Teaser — easy entry before Dock 9 */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="card flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Quick Play</div>
            <div className="text-sm text-zinc-400">Jump into Battleship or watch AI matches (full experience moved below Dock 9)</div>
          </div>
          <a href="#game-full" className="btn-primary">Open Full Game Experience</a>
        </div>
      </div>

      {/* GAME — Full experience (scroll past Dock 9 or use Quick Play) */}
      <div id="game-full">
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
      {/* End of full Game experience */}

      {/* DOCK 9 — Unified Market + Charts + Actions (exact-amount approvals, future-deploy resilient) */}
      <div id="dock9" className="max-w-7xl mx-auto px-6 py-16 border-t border-zinc-800">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">Dock 9</h2>
            <p className="text-zinc-400">Live collateral • Staking • Charts • Real on-chain actions</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-xs px-3 py-1 rounded border font-mono ${chainId === 31337 ? 'border-emerald-700 bg-emerald-950 text-emerald-400' : 'border-red-700 bg-red-950 text-red-400'}`}>
              {chainId === 31337 ? '✓ BuildBear' : 'Wrong Chain'}
            </div>
            {chainId !== 31337 && (
              <button
                onClick={switchToBuildBear}
                className="text-xs px-3 py-1 rounded border border-red-700 bg-red-950 text-red-300 hover:bg-red-800"
              >
                Switch to BuildBear
              </button>
            )}
          </div>
        </div>

        {/* CHARTS */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-medium">Market Charts</div>
            <div className="flex gap-1 text-xs">
              {(['5m','1h','6h','1d','1w','all'] as const).map(tf => (
                <button key={tf} onClick={() => setChartTimeframe(tf)} className={`px-3 py-1 rounded border ${chartTimeframe === tf ? 'bg-white text-black border-white' : 'border-zinc-700 hover:bg-zinc-800'}`}>
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Price Chart (synthetic from backing ratio) */}
          <div className="mb-8">
            <div className="text-sm text-zinc-400 mb-2">Implied SALT Price (Backed by USDC)</div>
            <div className="h-64 bg-black border border-zinc-800 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory.length ? priceHistory : [{time: Date.now(), price: backing ? (Number(backing) / 1e18) * 0.01 : 0.01}]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} />
                  <YAxis domain={['auto', 'auto']} />
                  <Tooltip />
                  <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} name="Implied Price" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Volume Chart — Deposits + Withdrawals (2 lines) */}
          <div>
            <div className="text-sm text-zinc-400 mb-2">Volume (USDC) — Deposits vs Withdrawals</div>
            <div className="h-64 bg-black border border-zinc-800 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumeHistory.length ? volumeHistory : [{time: Date.now(), deposits: 0, withdrawals: 0}]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="deposits" stroke="#3b82f6" strokeWidth={2} dot={false} name="Deposits" />
                  <Line type="monotone" dataKey="withdrawals" stroke="#ef4444" strokeWidth={2} dot={false} name="Withdrawals" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Client-side session history (resets cleanly on new diamond deploys)</div>
          </div>
        </div>

        {/* KEY METRICS (live on-chain + session) */}
        <div className="grid md:grid-cols-5 gap-4 mb-8">
          <div className="card">
            <div className="text-xs text-zinc-400">USDC Reserves (TVL)</div>
            <div className="text-3xl font-semibold mt-1">{usdcReserves ? (Number(usdcReserves) / 1e6).toFixed(2) : '0.00'}</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-400">Total Staked</div>
            <div className="text-3xl font-semibold mt-1">{totalStaked ? (Number(totalStaked) / 1e18).toFixed(0) : '0'}</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-400">Backing Ratio</div>
            <div className="text-3xl font-semibold mt-1 text-emerald-400">{backing ? ((Number(backing) / 1e18) * 100).toFixed(1) : '0'}%</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-400">Your Staked</div>
            <div className="text-3xl font-semibold mt-1">{staked ? (Number(staked) / 1e18).toFixed(2) : '0'}</div>
            <div className="text-xs text-green-400 mt-1">Pending: {pending ? (Number(pending) / 1e18).toFixed(4) : '0'}</div>
          </div>
          <div className="card">
            <div className="text-xs text-zinc-400">Session Volume</div>
            <div className="text-sm mt-1">In: <span className="text-blue-400">{volumeHistory.reduce((s, p) => s + (p.deposits || 0), 0).toFixed(2)}</span> • Out: <span className="text-red-400">{volumeHistory.reduce((s, p) => s + (p.withdrawals || 0), 0).toFixed(2)}</span></div>
          </div>
        </div>

        {/* ACTIONS — Smart exact-amount approvals */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Deposit */}
          <div className="card">
            <div className="font-medium mb-3">Deposit USDC → Mint SALT</div>
            <input value={dockUsdcAmount} onChange={e => setDockUsdcAmount(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded mb-3 font-mono" />
            {usdcAllowance && Number(usdcAllowance) < Number(parseUnits(dockUsdcAmount || '0', 6)) && (
              <button onClick={dockApproveUSDC} disabled={!isConnected || isPending} className="btn-secondary w-full mb-2 text-xs">
                Approve exact {dockUsdcAmount} USDC
              </button>
            )}
            <button onClick={dockDeposit} disabled={!isConnected || isPending} className="btn-primary w-full">Deposit & Mint</button>
            <div className="text-[10px] text-zinc-500 mt-2">Current USDC allowance: {usdcAllowance ? (Number(usdcAllowance) / 1e6).toFixed(2) : '0'}</div>
          </div>

          {/* Withdraw */}
          <div className="card">
            <div className="font-medium mb-3">Burn SALT → Withdraw USDC</div>
            <input value={dockWithdrawSalt} onChange={e => setDockWithdrawSalt(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded mb-3 font-mono" />
            <button onClick={dockWithdraw} disabled={!isConnected || isPending} className="btn-primary w-full">Withdraw USDC</button>
            <div className="text-[10px] text-zinc-500 mt-2">Small fee + circuit breaker apply</div>
          </div>

          {/* Stake */}
          <div className="card">
            <div className="font-medium mb-3">Stake SALT (Earn Revenue)</div>
            <input value={dockStakeAmount} onChange={e => setDockStakeAmount(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded mb-3 font-mono" />
            {saltAllowance && Number(saltAllowance) < Number(parseUnits(dockStakeAmount || '0', 18)) && (
              <button onClick={dockApproveSALT} disabled={!isConnected || isPending} className="btn-secondary w-full mb-2 text-xs">
                Approve exact {dockStakeAmount} SALT
              </button>
            )}
            <button onClick={dockStake} disabled={!isConnected || isPending} className="btn-primary w-full">Stake</button>
            <button onClick={dockClaim} disabled={!isConnected || isPending} className="btn-secondary w-full mt-2 text-xs">Claim Revenue Rewards</button>
            <div className="text-[10px] text-zinc-500 mt-2">Current SALT allowance: {saltAllowance ? (Number(saltAllowance) / 1e18).toFixed(2) : '0'}</div>
          </div>
        </div>

        <div className="text-xs text-zinc-500 mt-6">All actions use exact amounts you enter. Approvals only appear when needed. Data driven from diamond — works on future deploys.</div>
      </div>

      {/* NFT MINT TEST — Option A: Use the TestGamingAssetNFT already deployed by one-shot */}
      <div id="nft-test" className="max-w-7xl mx-auto px-6 py-12 border-t border-zinc-800">
        <h2 className="text-3xl font-semibold tracking-tight mb-2">NFT Mint Test</h2>
        <p className="text-zinc-400 mb-6">Mint directly on the GamingAssetNFT from the one-shot deploy. Use this to verify NFTs appear in your wallet.</p>

        <div className="card max-w-2xl">
          <div className="text-sm text-zinc-400 mb-1">Collection</div>
          <div className="font-mono text-xs mb-4 break-all text-emerald-400">{GAMING_NFT || 'Not configured'}</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Mint To (leave empty = your wallet)</div>
              <input value={nftMintTo} onChange={e => setNftMintTo(e.target.value)} placeholder={address || '0x...'} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded text-sm font-mono" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Token ID</div>
              <input value={nftTokenId} onChange={e => setNftTokenId(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded text-sm font-mono" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-zinc-400 mb-1">Metadata URI</div>
              <input value={nftUri} onChange={e => setNftUri(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded text-sm font-mono" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Level</div>
              <input value={nftLevel} onChange={e => setNftLevel(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded text-sm font-mono" />
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Power</div>
              <input value={nftPower} onChange={e => setNftPower(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 p-2 rounded text-sm font-mono" />
            </div>
          </div>

          <button
            onClick={mintTestNFT}
            disabled={!isConnected || isPending}
            className="mt-6 btn-primary w-full"
          >
            Mint Test Hero NFT
          </button>

          <div className="text-[10px] text-zinc-500 mt-3">
            This calls the direct <code>mint</code> on the deployed GamingAssetNFT. After success, the NFT should appear in your wallet (may need to import the collection).
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
