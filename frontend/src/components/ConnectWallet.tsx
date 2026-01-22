'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-[#F5F3FF] px-4 py-2 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-[#34D399]"></span>
          <span className="text-sm font-medium text-[#1F2937]">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 text-[#8B5CF6] border border-[#8B5CF6] rounded-xl hover:bg-[#EDE9FE] transition-colors font-medium text-sm"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="btn-primary text-sm"
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ))}
    </div>
  )
}
