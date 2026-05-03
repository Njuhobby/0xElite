'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
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

  const { signMessageAsync } = useSignMessage();

  // On-chain milestone approval for milestone-based projects
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

  // Write pending tx when we get approveHash (safety net for poller)
  useEffect(() => {
    if (approveHash && projectId && address) {
      writePendingTx({
        entityType: 'project',
        entityId: projectId,
        action: 'approve_milestone',
        txHash: approveHash,
        walletAddress: address,
        metadata: { milestoneIndex: milestone.onChainIndex },
      }).catch(() => {}); // best-effort early write
    }
  }, [approveHash]);

  // When on-chain approval tx succeeds, ensure pending record exists, then process+delete
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
        setReviewNotes('');
        onUpdate();
      })().catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to process milestone approval');
        setIsUpdating(false);
      });
    }
  }, [approveHash, isApproveSuccess]);

  // Show on-chain error
  useEffect(() => {
    if (approveOnChainError && isUpdating) {
      (async () => {
        if (approveHash) await deletePendingTx(approveHash);
        setError(approveOnChainError.message);
        setIsUpdating(false);
      })();
    }
  }, [approveOnChainError]);

  const generateMessage = (action: string) => {
    const timestamp = Date.now();
    return `${action} milestone on 0xElite

Wallet: ${address}
Timestamp: ${timestamp}`;
  };

  const updateMilestone = async (signature: string, message: string) => {
    try {
      const payload: Record<string, unknown> = {
        address,
        message,
        signature,
      };

      // Developer notifying that the milestone is complete
      if (isDeveloper && (milestone.status === 'pending' || milestone.status === 'in_progress')) {
        payload.status = 'pending_review';
      }
      // Client approving
      else if (milestone.status === 'pending_review' && isClient) {
        payload.status = 'completed';
        if (reviewNotes.trim()) {
          payload.reviewNotes = reviewNotes;
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/milestones/${milestone.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update milestone');
      }

      setReviewNotes('');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update milestone');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkComplete = async () => {
    setError('');
    setIsUpdating(true);
    try {
      const message = generateMessage('Mark milestone as complete');
      const signature = await signMessageAsync({ message });
      await updateMilestone(signature, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign message');
      setIsUpdating(false);
    }
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

      {/* Developer Action — single click flips milestone to pending_review and
          notifies the client. No deliverable URL capture here; that lives in
          the upcoming client/dev communication module. */}
      {isDeveloper && (milestone.status === 'pending' || milestone.status === 'in_progress') && (
        <button
          onClick={handleMarkComplete}
          disabled={isUpdating}
          className="w-full py-2.5 bg-violet-600 rounded-lg text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {isUpdating ? 'Notifying...' : 'Mark as Complete'}
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
            disabled={isUpdating || isApprovingOnChain || isApproveTxPending}
            className="w-full py-2.5 bg-green-600 rounded-lg text-white font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isApprovingOnChain || isApproveTxPending
              ? 'Confirming on-chain...'
              : isUpdating
              ? 'Approving...'
              : 'Approve On-Chain & Release Payment'}
          </button>
        </div>
      )}
    </div>
  );
}
