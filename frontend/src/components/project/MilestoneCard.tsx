'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { PROJECT_MANAGER_ABI, getProjectManagerAddress, TX_CONFIRMATIONS } from '@/config/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Write to pending_transactions. Throws on failure. */
async function writePendingTx(params: {
  entityType: string;
  entityId: string;
  action: string;
  txHash: string;
  walletAddress: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await fetch(`${API_URL}/api/transactions/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to record pending transaction');
  }
}

async function deletePendingTx(txHash: string): Promise<{ success?: boolean; action?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${API_URL}/api/transactions/pending/${txHash}`, { method: 'DELETE' });
    return await res.json();
  } catch {
    return {};
  }
}

interface Milestone {
  id: string;
  milestoneNumber: number;
  title: string;
  description: string;
  deliverables: string[];
  budget: string;
  status: string;
  startedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  deliverableUrls?: string[];
  reviewNotes?: string;
  onChainIndex?: number;
  contractProjectId?: string;
}

interface Props {
  milestone: Milestone;
  projectId?: string;
  isClient: boolean;
  isDeveloper: boolean;
  onUpdate: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Open',
    className: 'bg-gray-100 border-gray-200 text-gray-600',
  },
  // Legacy: nothing transitions into in_progress anymore, kept for old rows.
  in_progress: {
    label: 'Open',
    className: 'bg-gray-100 border-gray-200 text-gray-600',
  },
  pending_review: {
    label: 'Awaiting Approval',
    className: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-50 border-green-200 text-green-700',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-orange-50 border-orange-200 text-orange-700',
  },
};

export default function MilestoneCard({ milestone, projectId, isClient, isDeveloper, onUpdate }: Props) {
  const { address } = useAccount();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);

  // Two on-chain operations live on this card:
  //   1) client → approveMilestone (releases payment)
  //   2) dev    → updateMilestoneStatus (Pending → PendingReview)
  // Both follow the same pattern: wagmi sends → POST /api/transactions/pending
  // → useWaitForTransactionReceipt → DELETE pending. We use one wagmi
  // useWriteContract per operation so their loading states don't bleed.

  // Client: approveMilestone
  const {
    data: approveHash,
    writeContract: approveOnChain,
    isPending: isApprovingOnChain,
    error: approveOnChainError,
  } = useWriteContract();

  const { isLoading: isApproveTxPending, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
    confirmations: TX_CONFIRMATIONS,
  });

  // Developer: updateMilestoneStatus
  const {
    data: markHash,
    writeContract: markOnChain,
    isPending: isMarkingOnChain,
    error: markOnChainError,
  } = useWriteContract();

  const { isLoading: isMarkTxPending, isSuccess: isMarkSuccess } = useWaitForTransactionReceipt({
    hash: markHash,
    confirmations: TX_CONFIRMATIONS,
  });

  // On mount, check whether this milestone already has a pending tx for the
  // current wallet (e.g. user refreshed during confirmation). If so, mirror
  // it into local state so the button stays disabled until reconciled.
  useEffect(() => {
    if (!address || !projectId || milestone.onChainIndex == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/transactions/pending?wallet=${address}`);
        if (!res.ok) return;
        const body = await res.json();
        const match = (body.transactions ?? []).find((t: { entity_type: string; entity_id: string; action: string; tx_hash: string; metadata: { onChainIndex?: number; milestoneIndex?: number } | null }) =>
          t.entity_type === 'project' &&
          t.entity_id === projectId &&
          (t.action === 'update_milestone_status' || t.action === 'approve_milestone') &&
          (t.metadata?.onChainIndex === milestone.onChainIndex || t.metadata?.milestoneIndex === milestone.onChainIndex)
        );
        if (!cancelled && match) {
          setPendingHash(match.tx_hash as `0x${string}`);
        }
      } catch {
        // ignore — best-effort UX hint
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, projectId, milestone.onChainIndex]);

  // Approve flow: write pending tx, then delete on confirmation
  useEffect(() => {
    if (approveHash && projectId && address) {
      writePendingTx({
        entityType: 'project',
        entityId: projectId,
        action: 'approve_milestone',
        txHash: approveHash,
        walletAddress: address,
        metadata: { milestoneIndex: milestone.onChainIndex },
      }).catch(() => {});
      setPendingHash(approveHash);
    }
  }, [approveHash]);

  useEffect(() => {
    if (approveHash && isApproveSuccess && isUpdating && projectId && address) {
      (async () => {
        await writePendingTx({
          entityType: 'project',
          entityId: projectId,
          action: 'approve_milestone',
          txHash: approveHash,
          walletAddress: address,
          metadata: { milestoneIndex: milestone.onChainIndex },
        });
        await deletePendingTx(approveHash);
        setIsUpdating(false);
        setPendingHash(null);
        setReviewNotes('');
        onUpdate();
      })().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to process milestone approval');
        setIsUpdating(false);
      });
    }
  }, [approveHash, isApproveSuccess]);

  useEffect(() => {
    if (approveOnChainError && isUpdating) {
      (async () => {
        if (approveHash) await deletePendingTx(approveHash);
        setError(approveOnChainError.message);
        setIsUpdating(false);
        setPendingHash(null);
      })();
    }
  }, [approveOnChainError]);

  // Mark-as-complete flow (dev) — same shape, different action key
  useEffect(() => {
    if (markHash && projectId && address) {
      writePendingTx({
        entityType: 'project',
        entityId: projectId,
        action: 'update_milestone_status',
        txHash: markHash,
        walletAddress: address,
        metadata: { onChainIndex: milestone.onChainIndex, newStatus: 'pending_review' },
      }).catch(() => {});
      setPendingHash(markHash);
    }
  }, [markHash]);

  useEffect(() => {
    if (markHash && isMarkSuccess && isUpdating && projectId && address) {
      (async () => {
        await writePendingTx({
          entityType: 'project',
          entityId: projectId,
          action: 'update_milestone_status',
          txHash: markHash,
          walletAddress: address,
          metadata: { onChainIndex: milestone.onChainIndex, newStatus: 'pending_review' },
        });
        await deletePendingTx(markHash);
        setIsUpdating(false);
        setPendingHash(null);
        onUpdate();
      })().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to record milestone submission');
        setIsUpdating(false);
      });
    }
  }, [markHash, isMarkSuccess]);

  useEffect(() => {
    if (markOnChainError && isUpdating) {
      (async () => {
        if (markHash) await deletePendingTx(markHash);
        setError(markOnChainError.message);
        setIsUpdating(false);
        setPendingHash(null);
      })();
    }
  }, [markOnChainError]);

  const handleMarkComplete = async () => {
    if (milestone.contractProjectId == null || milestone.onChainIndex == null) {
      setError('Milestone is missing on-chain coordinates');
      return;
    }
    setError('');
    setIsUpdating(true);
    markOnChain({
      address: getProjectManagerAddress(),
      abi: PROJECT_MANAGER_ABI,
      functionName: 'updateMilestoneStatus',
      // 2 = MilestoneStatus.PendingReview
      args: [BigInt(milestone.contractProjectId), milestone.onChainIndex, 2],
    });
  };

  const handleApprove = async () => {
    if (milestone.contractProjectId == null || milestone.onChainIndex == null) {
      setError('Milestone is missing on-chain coordinates');
      return;
    }
    setError('');
    setIsUpdating(true);
    approveOnChain({
      address: getProjectManagerAddress(),
      abi: PROJECT_MANAGER_ABI,
      functionName: 'approveMilestone',
      args: [BigInt(milestone.contractProjectId), milestone.onChainIndex],
    });
  };

  const config = statusConfig[milestone.status] || statusConfig.pending;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-gray-500 font-semibold text-sm">Milestone {milestone.milestoneNumber}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
              {config.label}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{milestone.title}</h3>
          <p className="text-gray-600 text-sm">{milestone.description}</p>
        </div>
        <div className="text-right ml-4">
          <p className="text-xl font-bold text-gray-900">${parseFloat(milestone.budget).toFixed(0)}</p>
          <p className="text-gray-400 text-xs">USDC</p>
        </div>
      </div>

      {/* Deliverables */}
      <div className="mb-4">
        <p className="text-gray-500 font-medium text-sm mb-1.5">Deliverables:</p>
        <ul className="list-disc list-inside text-gray-700 text-sm space-y-0.5">
          {milestone.deliverables.map((deliverable: string, index: number) => (
            <li key={index}>{deliverable}</li>
          ))}
        </ul>
      </div>

      {/* Review Notes */}
      {milestone.reviewNotes && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 font-medium text-sm mb-1">Client Review:</p>
          <p className="text-gray-700 text-sm">{milestone.reviewNotes}</p>
        </div>
      )}

      {/* Timestamps */}
      {(milestone.startedAt || milestone.submittedAt || milestone.completedAt) && (
        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
          {milestone.startedAt && (
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Started</p>
              <p className="text-gray-700">{new Date(milestone.startedAt).toLocaleDateString()}</p>
            </div>
          )}
          {milestone.submittedAt && (
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Submitted</p>
              <p className="text-gray-700">{new Date(milestone.submittedAt).toLocaleDateString()}</p>
            </div>
          )}
          {milestone.completedAt && (
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Completed</p>
              <p className="text-gray-700">{new Date(milestone.completedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Developer Action — sign updateMilestoneStatus(Pending → PendingReview)
          on-chain. Backend reconciler flips the DB row and notifies the client
          once the tx confirms. No deliverable URL capture here; that lives in
          the upcoming client/dev communication module. */}
      {isDeveloper && (milestone.status === 'pending' || milestone.status === 'in_progress') && (
        <button
          onClick={handleMarkComplete}
          disabled={isUpdating || isMarkingOnChain || isMarkTxPending || pendingHash != null}
          className="w-full py-2.5 bg-violet-600 rounded-lg text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {isMarkingOnChain
            ? 'Confirm in wallet...'
            : isMarkTxPending || pendingHash != null
            ? 'Submitting on-chain...'
            : 'Mark as Complete'}
        </button>
      )}

      {/* Client Actions */}
      {isClient && milestone.status === 'pending_review' && (
        <div className="space-y-3">
          <div>
            <label className="block text-gray-700 font-medium text-sm mb-2">Review Notes (Optional)</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-24 resize-none"
              placeholder="Add any feedback or comments..."
            />
          </div>

          <button
            onClick={handleApprove}
            disabled={isUpdating || isApprovingOnChain || isApproveTxPending || pendingHash != null}
            className="w-full py-2.5 bg-green-600 rounded-lg text-white font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isApprovingOnChain
              ? 'Confirm in wallet...'
              : isApproveTxPending || pendingHash != null
              ? 'Confirming on-chain...'
              : 'Approve On-Chain & Release Payment'}
          </button>
        </div>
      )}
    </div>
  );
}
