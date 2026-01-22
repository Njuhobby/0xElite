import { http, createConfig } from 'wagmi'
import { sepolia, arbitrum, base } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia, arbitrum, base],
  connectors: [
    injected(), // MetaMask 等浏览器插件钱包
  ],
  transports: {
    [sepolia.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
