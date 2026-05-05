'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '@/config/wagmi'
import { ChainGuard } from '@/components/ChainGuard'
import { AuthProvider } from '@/providers/AuthProvider'
import { useState, type ReactNode } from 'react'

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChainGuard>
            {children}
          </ChainGuard>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
