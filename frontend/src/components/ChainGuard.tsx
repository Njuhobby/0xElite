'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { targetChain } from '@/config/wagmi';
import type { ReactNode } from 'react';

export function ChainGuard({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  // Not connected or already on the correct chain — render children normally
  if (!isConnected || chainId === targetChain.id) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-[#E5E7EB] p-8 text-center">
        <div className="w-16 h-16 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#D97706]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#1F2937] mb-2">Wrong Network</h2>
        <p className="text-[#6B7280] mb-6">
          Please switch to <span className="font-semibold text-[#8B5CF6]">{targetChain.name}</span> to use 0xElite.
        </p>
        <button
          onClick={() => switchChain({ chainId: targetChain.id })}
          disabled={isPending}
          className="w-full py-3 bg-[#8B5CF6] text-white font-semibold rounded-xl hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Switching...' : `Switch to ${targetChain.name}`}
        </button>
      </div>
    </div>
  );
}
