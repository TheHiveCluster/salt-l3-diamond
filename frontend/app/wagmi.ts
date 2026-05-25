import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia, hardhat, localhost } from 'viem/chains'
import type { Chain } from 'viem'

const chains: Chain[] = [localhost, hardhat, baseSepolia]

// Dynamically add BuildBear sandbox when env vars are present
const buildbearRpc = process.env.NEXT_PUBLIC_BUILDBEAR_RPC
const buildbearChainId = process.env.NEXT_PUBLIC_BUILDBEAR_CHAIN_ID
const buildbearLabel = process.env.NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL

if (buildbearRpc && buildbearChainId) {
  const buildbearChain: Chain = {
    id: Number(buildbearChainId),
    name: buildbearLabel || 'BuildBear',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [buildbearRpc] },
    },
  }
  chains.push(buildbearChain)
}

export const config = getDefaultConfig({
  appName: 'SALT Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains,
  ssr: true,
})
