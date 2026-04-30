'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { Address } from 'viem';
import {
  DISPUTE_DAO_ABI,
  USDC_ABI,
  TX_CONFIRMATIONS,
  getDisputeDAOAddress,
  getUsdcAddress,
} from '@/config/contracts';
import { writePendingTx, deletePendingTx } from '@/lib/pendingTx';

const FALLBACK_FEE = BigInt(50_000_000); // 50 USDC

interface Props {
  projectId: string;
  contractProjectId: string;
  userRole: 'client' | 'developer';
  onClose: () => void;
}

type Step = 'idle' | 'approving' | 'creating' | 'syncing';

export default function RaiseDisputeModal({
  projectId,
  contractProjectId,
  userRole,
  onClose,
}: Props) {
  const router = useRouter();
  const { address } = useAccount();
  const [evidenceUri, setEvidenceUri] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  const disputeDAOAddress = getDisputeDAOAddress();
  const usdcAddress = getUsdcAddress();

  // 1. Read on-chain arbitration fee + current allowance
  const { data: feeData } = useReadContract({
    address: disputeDAOAddress,
    abi: DISPUTE_DAO_ABI,
    functionName: 'arbitrationFee',
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address as Address, disputeDAOAddress] : undefined,
    query: { enabled: !!address },
  });

  const arbitrationFee = (feeData as bigint | undefined) ?? FALLBACK_FEE;
  const currentAllowance = (allowanceData as bigint | undefined) ?? BigInt(0);
  const needsApproval = currentAllowance < arbitrationFee;

  // 2. Approve flow
  const {
    data: approveHash,
    writeContract: approveUsdc,
    isPending: isApproveSubmitting,
    error: approveError,
  } = useWriteContract();
  const { isLoading: isApproveMining, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash, confirmations: TX_CONFIRMATIONS });

  // 3. Create dispute flow
  const {
    data: createHash,
    writeContract: createDispute,
    isPending: isCreateSubmitting,
    error: createError,
  } = useWriteContract();
  const { isLoading: isCreateMining, isSuccess: isCreateConfirmed } =
    useWaitForTransactionReceipt({ hash: createHash, confirmations: TX_CONFIRMATIONS });

  // Surface wagmi errors
  useEffect(() => {
    const wErr = approveError || createError;
    if (wErr) {
      setError(extractError(wErr));
      setStep('idle');
    }
  }, [approveError, createError]);

  // After approve confirms, refetch allowance and trigger createDispute
  useEffect(() => {
    if (step !== 'approving' || !isApproveConfirmed) return;
    (async () => {
      const { data: fresh } = await refetchAllowance();
      const ok = (fresh as bigint | undefined) ?? BigInt(0);
      if (ok < arbitrationFee) {
        setError('Allowance still below arbitration fee. Try approving again.');
        setStep('idle');
        return;
      }
      submitCreate();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveConfirmed, step]);

  // After create confirms, register pendingTx and trigger backend reconcile
  useEffect(() => {
    if (step !== 'creating' || !isCreateConfirmed || !createHash || !address) return;
    (async () => {
      setStep('syncing');
      try {
        await writePendingTx({
          entityType: 'dispute',
          entityId: projectId, // create_dispute uses project UUID
          action: 'create_dispute',
          txHash: createHash,
          walletAddress: address,
        });
        const result = await deletePendingTx(createHash);
        const newDisputeId = result.data?.disputeId as string | undefined;
        if (newDisputeId) {
          router.push(`/disputes/${newDisputeId}`);
        } else {
          // Backend hasn't synced yet — close modal, project page will reflect 'disputed'
          onClose();
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync dispute');
        setStep('idle');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateConfirmed, step, createHash, address]);

  // Best-effort early pendingTx write so the poller picks it up if user leaves
  useEffect(() => {
    if (!createHash || !address) return;
    writePendingTx({
      entityType: 'dispute',
      entityId: projectId,
      action: 'create_dispute',
      txHash: createHash,
      walletAddress: address,
    }).catch(() => {});
  }, [createHash, address, projectId]);

  const submitCreate = () => {
    setStep('creating');
    setError('');
    createDispute({
      address: disputeDAOAddress,
      abi: DISPUTE_DAO_ABI,
      functionName: 'createDispute',
      args: [BigInt(contractProjectId), evidenceUri],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setError('');

    if (!evidenceUri.trim()) {
      setError('Evidence URI is required');
      return;
    }

    if (needsApproval) {
      setStep('approving');
      approveUsdc({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [disputeDAOAddress, arbitrationFee],
      });
    } else {
      submitCreate();
    }
  };

  const busy = step !== 'idle';
  const feeDisplay = (Number(arbitrationFee) / 1e6).toFixed(2);

  const buttonLabel = (() => {
    if (step === 'approving') {
      return isApproveSubmitting
        ? 'Confirm approval in wallet...'
        : isApproveMining
          ? 'Approving USDC...'
          : 'Approving...';
    }
    if (step === 'creating') {
      return isCreateSubmitting
        ? 'Confirm in wallet...'
        : isCreateMining
          ? 'Filing dispute on-chain...'
          : 'Filing...';
    }
    if (step === 'syncing') return 'Syncing with backend...';
    return needsApproval ? `Approve ${feeDisplay} USDC & File` : 'File Dispute';
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Raise Dispute</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Filing as <span className="font-medium">{userRole}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">Heads up</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>You will pay a non-refundable arbitration fee of <strong>{feeDisplay} USDC</strong>.</li>
              <li>The project escrow will be frozen until the dispute resolves.</li>
              <li>You have 3 days to submit additional evidence after filing.</li>
            </ul>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Evidence URI <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={evidenceUri}
              onChange={(e) => setEvidenceUri(e.target.value)}
              disabled={busy}
              placeholder="ipfs://Qm... or https://..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              Link to your evidence document (PDF, DOCX, or markdown). Upload to IPFS and paste the CID.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !evidenceUri.trim() || !address}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function extractError(err: unknown): string {
  if (!(err instanceof Error)) return 'Transaction failed';
  const msg = err.message;
  if (msg.includes('User rejected') || msg.includes('User denied')) {
    return 'Transaction was rejected in wallet';
  }
  if (msg.includes('NotProjectParty')) {
    return 'Only the client or assigned developer can dispute this project';
  }
  if (msg.includes('DisputeAlreadyExists')) {
    return 'A dispute is already open for this project';
  }
  if (msg.includes('insufficient funds')) {
    return 'Insufficient USDC balance for arbitration fee';
  }
  const first = msg.split('\n')[0];
  return first.length > 160 ? first.slice(0, 160) + '...' : first;
}
