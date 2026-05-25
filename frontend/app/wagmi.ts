import { getDefaultWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { baseSepolia } from 'viem/chains'
import type { Chain } from 'viem'

// TEMP (BuildBear alpha testing):
// Removed hardhat + localhost from the default chains list.
// Both use chain ID 31337, which collides with our BuildBear sandboxes (also 31337).
// This was causing duplicate key warnings and the dapp defaulting to the wrong network.
//
// For local Hardhat dev, manually re-enable by adding the imports and entries below:
//   import { baseSepolia, hardhat, localhost } from 'viem/chains'
//   const chains: Chain[] = [localhost, hardhat, baseSepolia]
// Then restart the dev server.

const chains: Chain[] = [baseSepolia]

// Dynamically add BuildBear sandbox when env vars are present
const buildbearRpc = process.env.NEXT_PUBLIC_BUILDBEAR_RPC
const buildbearChainId = process.env.NEXT_PUBLIC_BUILDBEAR_CHAIN_ID
const buildbearLabel = process.env.NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL

let initialChain: Chain | undefined
let transports: Record<number, ReturnType<typeof http>> = {
  [baseSepolia.id]: http(),
}

if (buildbearRpc && buildbearChainId) {
  const buildbearChain: Chain = {
    id: Number(buildbearChainId),
    name: buildbearLabel || 'BuildBear',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [buildbearRpc] },
    },
    testnet: true,
    blockExplorers: {
      default: { name: 'BuildBear Explorer', url: 'https://buildbear.io' },
    },
  }
  chains.push(buildbearChain)
  initialChain = buildbearChain
  transports[buildbearChain.id] = http(buildbearRpc)
}

// Use explicit createConfig + transports. This is more reliable
// than getDefaultConfig for custom/dynamic chains like BuildBear sandboxes.
const { connectors } = getDefaultWallets({
  appName: 'SALT Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID',
})

export const config = createConfig({
  chains: chains as [Chain, ...Chain[]],
  connectors,
  transports,
  ssr: true,
})

export { initialChain }
