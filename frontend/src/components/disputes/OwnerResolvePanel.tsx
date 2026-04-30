'use client';

import { useEffect, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import {
  DISPUTE_DAO_ABI,
  TX_CONFIRMATIONS,
  getDisputeDAOAddress,
} from '@/config/contracts';
import { writePendingTx, deletePendingTx } from '@/lib/pendingTx';
import { isAdminAddress } from '@/lib/auth';

interface OwnerResolvePanelProps {
  disputeId: string;
  chainDisputeId: number | null;
  disputeNumber: number;
  clientVoteWeight: number;
  developerVoteWeight: number;
  totalVoteWeight: number;
  quorumRequired: number;
  onResolveConfirmed: () => void;
}

export default function OwnerResolvePanel({
  disputeId,
  chainDisputeId,
  disputeNumber,
  clientVoteWeight,
  developerVoteWeight,
  totalVoteWeight,
  quorumRequired,
  onResolveConfirmed,
}: OwnerResolvePanelProps) {
  const { address } = useAccount();
  const [pendingChoice, setPendingChoice] = useState<'client' | 'developer' | null>(null);

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    error: writeError,
    variables,
  } = useWriteContract();

  const { isLoading: isWaitingReceipt, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      confirmations: TX_CONFIRMATIONS,
    });

  useEffect(() => {
    if (!txHash || !address) return;
    const clientWon = (variables?.args?.[1] as boolean | undefined) ?? false;
    writePendingTx({
      entityType: 'dispute',
      entityId: disputeId,
      action: 'owner_resolve',
      txHash,
      walletAddress: address,
      metadata: { clientWon },
    }).catch(() => {});
  }, [txHash, address, disputeId, variables]);

  useEffect(() => {
    if (!txHash || !isConfirmed || !address) return;
    (async () => {
      const clientWon = (variables?.args?.[1] as boolean | undefined) ?? false;
      await writePendingTx({
        entityType: 'dispute',
        entityId: disputeId,
        action: 'owner_resolve',
        txHash,
        walletAddress: address,
        metadata: { clientWon },
      }).catch(() => {});
      await deletePendingTx(txHash);
      setPendingChoice(null);
      onResolveConfirmed();
    })();
  }, [txHash, isConfirmed, address, disputeId, variables, onResolveConfirmed]);

  // Render nothing for non-admins. The contract is the real safety boundary;
  // this just hides the action so non-admins don't burn gas trying to call it.
  if (!isAdminAddress(address)) return null;
  if (chainDisputeId == null) return null;

  const submitting = isWriting || isWaitingReceipt;
  const quorumMet = quorumRequired > 0 && totalVoteWeight >= quorumRequired;

  const requestResolve = (choice: 'client' | 'developer') => {
    setPendingChoice(choice);
  };

  const confirmResolve = () => {
    if (!pendingChoice) return;
    writeContract({
      address: getDisputeDAOAddress(),
      abi: DISPUTE_DAO_ABI,
      functionName: 'ownerResolve',
      args: [BigInt(chainDisputeId), pendingChoice === 'client'],
    });
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Admin: Owner Resolve</h2>
          <p className="text-xs text-amber-700/80 mt-1">
            Manually decide dispute #{disputeNumber}. Use only when DAO voting cannot resolve.
          </p>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-medium">
          Admin only
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-xs mb-4 bg-white/60 border border-amber-100 rounded-lg p-3">
        <div>
          <dt className="text-gray-500">Client weight</dt>
          <dd className="text-cyan-700 font-mono font-medium">{clientVoteWeight.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Developer weight</dt>
          <dd className="text-violet-700 font-mono font-medium">{developerVoteWeight.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Quorum</dt>
          <dd className={`font-mono font-medium ${quorumMet ? 'text-green-700' : 'text-amber-700'}`}>
            {quorumMet ? 'Met' : 'Not met'}
          </dd>
        </div>
      </dl>

      {writeError && (
        <p className="text-xs text-red-600 mb-3">{writeError.message}</p>
      )}

      {pendingChoice ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-900">
            Confirm resolving in favor of <strong className="capitalize">{pendingChoice}</strong>. This is irreversible.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmResolve}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-colors"
            >
              {isWriting ? 'Confirm in wallet...' : isWaitingReceipt ? 'Pending...' : 'Confirm Resolution'}
            </button>
            <button
              type="button"
              onClick={() => setPendingChoice(null)}
              disabled={submitting}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => requestResolve('client')}
            className="px-4 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white text-sm font-semibold transition-colors"
          >
            Resolve for Client
          </button>
          <button
            type="button"
            onClick={() => requestResolve('developer')}
            className="px-4 py-3 bg-violet-600 hover:bg-violet-700 rounded-lg text-white text-sm font-semibold transition-colors"
          >
            Resolve for Developer
          </button>
        </div>
      )}
    </div>
  );
}
