'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import Link from 'next/link';
import DisputeStatusBadge from '@/components/disputes/DisputeStatusBadge';
import VotePanel from '@/components/disputes/VotePanel';
import OwnerResolvePanel from '@/components/disputes/OwnerResolvePanel';
import {
  DISPUTE_DAO_ABI,
  getDisputeDAOAddress,
  TX_CONFIRMATIONS,
} from '@/config/contracts';
import { writePendingTx, deletePendingTx } from '@/lib/pendingTx';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Dispute {
  id: string;
  disputeNumber: number;
  projectId: string;
  projectTitle?: string;
  clientAddress: string;
  developerAddress: string;
  initiatorAddress: string;
  initiatorRole: string;
  status: string;
  clientEvidenceUri: string | null;
  developerEvidenceUri: string | null;
  evidenceDeadline: string;
  votingDeadline: string | null;
  votingSnapshot: string | null;
  clientVoteWeight: string;
  developerVoteWeight: string;
  totalVoteWeight: string;
  quorumRequired: string | null;
  winner: string | null;
  resolvedByOwner: boolean;
  clientShare: string | null;
  developerShare: string | null;
  arbitrationFee: string;
  chainDisputeId: number | null;
  creationTxHash: string | null;
  resolutionTxHash: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface Vote {
  id: string;
  voterAddress: string;
  supportClient: boolean;
  voteWeight: string;
  votedAt: string;
}

export default function DisputeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { address } = useAccount();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidenceUri, setEvidenceUri] = useState('');

  // Tracks which evidence-tx hashes we've already early-written / fully processed.
  // Prevents an effect-loop where post-confirm fetchDispute updates `dispute`,
  // which then re-fires effects that depend on `dispute`.
  const earlyWrittenHashRef = useRef<string | null>(null);
  const processedHashRef = useRef<string | null>(null);

  const fetchDispute = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${baseUrl}/api/disputes/${id}`);
      if (!response.ok) throw new Error('Failed to fetch dispute');
      const data = await response.json();
      setDispute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dispute');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchVotes = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/disputes/${id}/votes`);
      if (response.ok) {
        const data = await response.json();
        setVotes(data.votes || []);
      }
    } catch (err) {
      console.error('Error fetching votes:', err);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchDispute();
      fetchVotes();
    }
  }, [id, fetchDispute, fetchVotes]);

  // On-chain evidence submission
  const {
    data: evidenceTxHash,
    writeContract: submitEvidenceOnChain,
    isPending: isSubmittingTx,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isWaitingReceipt, isSuccess: isEvidenceConfirmed } =
    useWaitForTransactionReceipt({
      hash: evidenceTxHash,
      confirmations: TX_CONFIRMATIONS,
    });

  const submitting = isSubmittingTx || isWaitingReceipt;

  // Surface wagmi write errors
  useEffect(() => {
    if (writeError) {
      setError(writeError.message);
    }
  }, [writeError]);

  // Best-effort early write so the poller can pick up the tx if the user
  // closes the tab before confirmation lands.
  useEffect(() => {
    if (!evidenceTxHash || !address || !dispute) return;
    if (earlyWrittenHashRef.current === evidenceTxHash) return;
    earlyWrittenHashRef.current = evidenceTxHash;
    writePendingTx({
      entityType: 'dispute',
      entityId: dispute.id,
      action: 'submit_evidence',
      txHash: evidenceTxHash,
      walletAddress: address,
    }).catch(() => {});
  }, [evidenceTxHash, address, dispute]);

  // After confirmation: trigger backend reconcile + refetch.
  useEffect(() => {
    if (!evidenceTxHash || !isEvidenceConfirmed || !address || !dispute) return;
    if (processedHashRef.current === evidenceTxHash) return;
    processedHashRef.current = evidenceTxHash;
    (async () => {
      await writePendingTx({
        entityType: 'dispute',
        entityId: dispute.id,
        action: 'submit_evidence',
        txHash: evidenceTxHash,
        walletAddress: address,
      }).catch(() => {});
      await deletePendingTx(evidenceTxHash);
      setEvidenceUri('');
      await Promise.all([fetchDispute(), fetchVotes()]);
    })();
  }, [evidenceTxHash, isEvidenceConfirmed, address, dispute, fetchDispute, fetchVotes]);

  const handleSubmitEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !dispute || dispute.chainDisputeId == null) return;

    setError('');
    submitEvidenceOnChain({
      address: getDisputeDAOAddress(),
      abi: DISPUTE_DAO_ABI,
      functionName: 'submitEvidence',
      args: [BigInt(dispute.chainDisputeId), evidenceUri],
    });
  };

  const refreshDispute = useCallback(() => {
    fetchDispute();
    fetchVotes();
  }, [fetchDispute, fetchVotes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading dispute...</span>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <p className="text-red-600">{error || 'Dispute not found'}</p>
      </div>
    );
  }

  const connectedAddress = address?.toLowerCase();
  const isClient = connectedAddress === dispute.clientAddress;
  const isDeveloper = connectedAddress === dispute.developerAddress;
  const isParty = isClient || isDeveloper;
  const canSubmitEvidence =
    dispute.status === 'open' &&
    isParty &&
    new Date(dispute.evidenceDeadline) > new Date();

  const clientVW = parseFloat(dispute.clientVoteWeight);
  const devVW = parseFloat(dispute.developerVoteWeight);
  const totalVW = parseFloat(dispute.totalVoteWeight);
  const quorum = dispute.quorumRequired ? parseFloat(dispute.quorumRequired) : 0;
  const quorumPct = quorum > 0 ? Math.min(100, (totalVW / quorum) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/disputes" className="text-gray-500 text-sm hover:text-gray-900 mb-2 block">
            ← Back to Disputes
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Dispute #{dispute.disputeNumber}</h1>
            <DisputeStatusBadge status={dispute.status} />
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Filed by {dispute.initiatorRole} on{' '}
            {new Date(dispute.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Parties */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Parties</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Client</p>
              <p className="text-sm font-mono text-cyan-700">
                {dispute.clientAddress.slice(0, 6)}...{dispute.clientAddress.slice(-4)}
                {isClient && <span className="text-xs text-gray-400 ml-2">(You)</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Developer</p>
              <p className="text-sm font-mono text-violet-700">
                {dispute.developerAddress.slice(0, 6)}...{dispute.developerAddress.slice(-4)}
                {isDeveloper && <span className="text-xs text-gray-400 ml-2">(You)</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Evidence */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Evidence</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Client Evidence</p>
              {dispute.clientEvidenceUri ? (
                <a
                  href={dispute.clientEvidenceUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-700 hover:underline break-all"
                >
                  {dispute.clientEvidenceUri}
                </a>
              ) : (
                <p className="text-sm text-gray-400">Not submitted</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Developer Evidence</p>
              {dispute.developerEvidenceUri ? (
                <a
                  href={dispute.developerEvidenceUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-violet-700 hover:underline break-all"
                >
                  {dispute.developerEvidenceUri}
                </a>
              ) : (
                <p className="text-sm text-gray-400">Not submitted</p>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Evidence deadline: {new Date(dispute.evidenceDeadline).toLocaleString()}
            </div>
          </div>

          {canSubmitEvidence && (
            <form onSubmit={handleSubmitEvidence} className="mt-4 pt-4 border-t border-gray-100">
              <label className="text-sm text-gray-700 font-medium block mb-2">
                {isClient ? 'Update Client Evidence' : 'Submit Developer Evidence'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={evidenceUri}
                  onChange={(e) => setEvidenceUri(e.target.value)}
                  placeholder="ipfs://... or https://..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="submit"
                  disabled={submitting || !evidenceUri || dispute.chainDisputeId == null}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-colors"
                >
                  {isSubmittingTx ? 'Confirm in wallet...' : isWaitingReceipt ? 'Pending...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Voting */}
        {(dispute.status === 'voting' || dispute.status === 'resolved') && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Voting</h2>

            {/* Vote tally */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-cyan-700 font-medium">
                  Client: {clientVW.toFixed(2)}
                </span>
                <span className="text-violet-700 font-medium">
                  Developer: {devVW.toFixed(2)}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-cyan-500 transition-all"
                  style={{
                    width: `${totalVW > 0 ? (clientVW / totalVW) * 100 : 50}%`,
                  }}
                />
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{
                    width: `${totalVW > 0 ? (devVW / totalVW) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>

            {/* Quorum progress */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Quorum Progress</span>
                <span>{quorumPct.toFixed(1)}% of 25% required</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${quorumPct >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(100, quorumPct)}%` }}
                />
              </div>
            </div>

            {dispute.votingDeadline && (
              <p className="text-xs text-gray-500">
                Voting deadline: {new Date(dispute.votingDeadline).toLocaleString()}
              </p>
            )}

            {dispute.status === 'voting' && (
              <VotePanel
                disputeId={dispute.id}
                chainDisputeId={dispute.chainDisputeId}
                clientAddress={dispute.clientAddress}
                developerAddress={dispute.developerAddress}
                votingDeadline={dispute.votingDeadline}
                votingSnapshot={dispute.votingSnapshot}
                onVoteConfirmed={refreshDispute}
              />
            )}

            {/* Vote list */}
            {votes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Votes Cast ({votes.length})
                </h3>
                <div className="space-y-2">
                  {votes.map((vote) => (
                    <div
                      key={vote.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-gray-500">
                        {vote.voterAddress.slice(0, 6)}...{vote.voterAddress.slice(-4)}
                      </span>
                      <span className={vote.supportClient ? 'text-cyan-700 font-medium' : 'text-violet-700 font-medium'}>
                        {vote.supportClient ? 'Client' : 'Developer'} ({parseFloat(vote.voteWeight).toFixed(2)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resolution */}
        {dispute.status === 'resolved' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Resolution</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Winner</p>
                <p
                  className={`text-lg font-semibold ${
                    dispute.winner === 'client' ? 'text-cyan-700' : 'text-violet-700'
                  }`}
                >
                  {dispute.winner === 'client' ? 'Client' : 'Developer'}
                  {dispute.resolvedByOwner && (
                    <span className="text-xs text-gray-500 font-normal ml-2">
                      (Owner decision - quorum not met)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Resolved</p>
                <p className="text-sm text-gray-700">
                  {dispute.resolvedAt
                    ? new Date(dispute.resolvedAt).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            {(dispute.clientShare || dispute.developerShare) && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client Share</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {dispute.clientShare ? `${parseFloat(dispute.clientShare).toFixed(2)} USDC` : '0 USDC'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Developer Share</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {dispute.developerShare ? `${parseFloat(dispute.developerShare).toFixed(2)} USDC` : '0 USDC'}
                  </p>
                </div>
              </div>
            )}
            {dispute.resolutionTxHash && (
              <div className="mt-4 text-xs text-gray-500 font-mono">
                Tx: {dispute.resolutionTxHash.slice(0, 10)}...{dispute.resolutionTxHash.slice(-8)}
              </div>
            )}
          </div>
        )}

        {/* Owner resolve (admin-only, hidden until rendered) */}
        {dispute.status !== 'resolved' && (
          <OwnerResolvePanel
            disputeId={dispute.id}
            chainDisputeId={dispute.chainDisputeId}
            disputeNumber={dispute.disputeNumber}
            clientVoteWeight={clientVW}
            developerVoteWeight={devVW}
            quorumRequired={quorum}
            totalVoteWeight={totalVW}
            onResolveConfirmed={refreshDispute}
          />
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-gray-500">Arbitration Fee</dt>
            <dd className="text-gray-900 font-medium">{parseFloat(dispute.arbitrationFee).toFixed(2)} USDC</dd>
            {dispute.chainDisputeId !== null && (
              <>
                <dt className="text-gray-500">On-chain ID</dt>
                <dd className="text-gray-900 font-medium">#{dispute.chainDisputeId}</dd>
              </>
            )}
            {dispute.creationTxHash && (
              <>
                <dt className="text-gray-500">Creation Tx</dt>
                <dd className="text-gray-700 font-mono text-xs">
                  {dispute.creationTxHash.slice(0, 10)}...{dispute.creationTxHash.slice(-8)}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
