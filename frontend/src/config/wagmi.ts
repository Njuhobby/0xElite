import { http, createConfig } from 'wagmi'
import type { Chain } from 'viem'
import { hardhat, arbitrumSepolia, arbitrum } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Determine target chain from environment variable
const chainMap: Record<number, Chain> = {
  [hardhat.id]: hardhat,           // 31337  - local dev
  [arbitrumSepolia.id]: arbitrumSepolia, // 421614 - testnet
  [arbitrum.id]: arbitrum,         // 42161  - mainnet
}

const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || hardhat.id)
export const targetChain: Chain = chainMap[targetChainId] || hardhat

export const config = createConfig({
  chains: [targetChain],
  connectors: [
    injected(), // MetaMask 等浏览器插件钱包
  ],
  transports: {
    [targetChain.id]: http(
      targetChain.id === hardhat.id ? 'http://127.0.0.1:8545' : undefined
    ),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
