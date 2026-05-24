import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia, hardhat, localhost } from 'viem/chains'

export const config = getDefaultConfig({
  appName: 'SALT Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [localhost, hardhat, baseSepolia],
  ssr: true,
})
