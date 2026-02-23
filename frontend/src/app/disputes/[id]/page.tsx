'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import Link from 'next/link';
import DisputeStatusBadge from '@/components/disputes/DisputeStatusBadge';

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
  const { signMessageAsync } = useSignMessage();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidenceUri, setEvidenceUri] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDispute();
      fetchVotes();
    }
  }, [id]);

  const fetchDispute = async () => {
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
  };

  const fetchVotes = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/disputes/${id}/votes`);
      if (response.ok) {
        const data = await response.json();
        setVotes(data.votes || []);
      }
    } catch (err) {
      console.error('Error fetching votes:', err);
    }
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !dispute) return;

    try {
      setSubmitting(true);
      setError('');

      const message = `Submit evidence for dispute #${dispute.disputeNumber}\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(`${baseUrl}/api/disputes/${id}/evidence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message,
          signature,
          evidenceUri,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit evidence');
      }

      const updated = await response.json();
      setDispute(updated);
      setEvidenceUri('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting evidence');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A1B] text-white flex items-center justify-center">
        <p className="text-gray-400">Loading dispute...</p>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-[#0A0A1B] text-white flex items-center justify-center">
        <p className="text-red-400">{error || 'Dispute not found'}</p>
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
    <div className="min-h-screen bg-[#0A0A1B] text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a0a2e] to-[#0A0A1B] border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/disputes" className="text-gray-400 text-sm hover:text-white mb-2 block">
            ← Back to Disputes
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold">Dispute #{dispute.disputeNumber}</h1>
            <DisputeStatusBadge status={dispute.status} />
          </div>
          <p className="text-gray-400 mt-1">
            Filed by {dispute.initiatorRole} on{' '}
            {new Date(dispute.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Parties */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Parties</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Client</p>
              <p className="text-sm font-mono text-cyan-400">
                {dispute.clientAddress.slice(0, 6)}...{dispute.clientAddress.slice(-4)}
                {isClient && <span className="text-xs text-gray-500 ml-2">(You)</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Developer</p>
              <p className="text-sm font-mono text-purple-400">
                {dispute.developerAddress.slice(0, 6)}...{dispute.developerAddress.slice(-4)}
                {isDeveloper && <span className="text-xs text-gray-500 ml-2">(You)</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Evidence */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Evidence</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Client Evidence</p>
              {dispute.clientEvidenceUri ? (
                <a
                  href={dispute.clientEvidenceUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:underline break-all"
                >
                  {dispute.clientEvidenceUri}
                </a>
              ) : (
                <p className="text-sm text-gray-500">Not submitted</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Developer Evidence</p>
              {dispute.developerEvidenceUri ? (
                <a
                  href={dispute.developerEvidenceUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:underline break-all"
                >
                  {dispute.developerEvidenceUri}
                </a>
              ) : (
                <p className="text-sm text-gray-500">Not submitted</p>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Evidence deadline: {new Date(dispute.evidenceDeadline).toLocaleString()}
            </div>
          </div>

          {canSubmitEvidence && (
            <form onSubmit={handleSubmitEvidence} className="mt-4 pt-4 border-t border-white/10">
              <label className="text-sm text-gray-300 block mb-2">
                {isClient ? 'Update Client Evidence' : 'Submit Developer Evidence'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={evidenceUri}
                  onChange={(e) => setEvidenceUri(e.target.value)}
                  placeholder="ipfs://... or https://..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={submitting || !evidenceUri}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-all"
                >
                  {submitting ? 'Signing...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Voting */}
        {(dispute.status === 'voting' || dispute.status === 'resolved') && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Voting</h2>

            {/* Vote tally */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-cyan-400">
                  Client: {clientVW.toFixed(2)}
                </span>
                <span className="text-purple-400">
                  Developer: {devVW.toFixed(2)}
                </span>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-cyan-500 transition-all"
                  style={{
                    width: `${totalVW > 0 ? (clientVW / totalVW) * 100 : 50}%`,
                  }}
                />
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{
                    width: `${totalVW > 0 ? (devVW / totalVW) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>

            {/* Quorum progress */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Quorum Progress</span>
                <span>{quorumPct.toFixed(1)}% of 25% required</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${quorumPct >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`}
                  style={{ width: `${Math.min(100, quorumPct)}%` }}
                />
              </div>
            </div>

            {dispute.votingDeadline && (
              <p className="text-xs text-gray-500">
                Voting deadline: {new Date(dispute.votingDeadline).toLocaleString()}
              </p>
            )}

            {/* Vote list */}
            {votes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  Votes Cast ({votes.length})
                </h3>
                <div className="space-y-2">
                  {votes.map((vote) => (
                    <div
                      key={vote.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-gray-400">
                        {vote.voterAddress.slice(0, 6)}...{vote.voterAddress.slice(-4)}
                      </span>
                      <span className={vote.supportClient ? 'text-cyan-400' : 'text-purple-400'}>
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
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Resolution</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Winner</p>
                <p
                  className={`text-lg font-semibold ${
                    dispute.winner === 'client' ? 'text-cyan-400' : 'text-purple-400'
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
                <p className="text-xs text-gray-400 mb-1">Resolved</p>
                <p className="text-sm text-gray-300">
                  {dispute.resolvedAt
                    ? new Date(dispute.resolvedAt).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            {(dispute.clientShare || dispute.developerShare) && (
              <div className="mt-4 pt-4 border-t border-white/10 grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Client Share</p>
                  <p className="text-sm text-white">
                    {dispute.clientShare ? `${parseFloat(dispute.clientShare).toFixed(2)} USDC` : '0 USDC'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Developer Share</p>
                  <p className="text-sm text-white">
                    {dispute.developerShare ? `${parseFloat(dispute.developerShare).toFixed(2)} USDC` : '0 USDC'}
                  </p>
                </div>
              </div>
            )}
            {dispute.resolutionTxHash && (
              <div className="mt-4 text-xs text-gray-500">
                Tx: {dispute.resolutionTxHash.slice(0, 10)}...{dispute.resolutionTxHash.slice(-8)}
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-gray-400">Arbitration Fee</dt>
            <dd className="text-white">{parseFloat(dispute.arbitrationFee).toFixed(2)} USDC</dd>
            {dispute.chainDisputeId !== null && (
              <>
                <dt className="text-gray-400">On-chain ID</dt>
                <dd className="text-white">#{dispute.chainDisputeId}</dd>
              </>
            )}
            {dispute.creationTxHash && (
              <>
                <dt className="text-gray-400">Creation Tx</dt>
                <dd className="text-white font-mono text-xs">
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
