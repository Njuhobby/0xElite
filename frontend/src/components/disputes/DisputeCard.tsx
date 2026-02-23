'use client';

import Link from 'next/link';
import DisputeStatusBadge from './DisputeStatusBadge';

interface DisputeCardProps {
  dispute: {
    id: string;
    disputeNumber: number;
    projectId: string;
    projectTitle?: string;
    clientAddress: string;
    developerAddress: string;
    initiatorRole: string;
    status: string;
    evidenceDeadline: string;
    votingDeadline: string | null;
    clientVoteWeight: string;
    developerVoteWeight: string;
    totalVoteWeight: string;
    winner: string | null;
    resolvedByOwner: boolean;
    createdAt: string;
  };
}

export default function DisputeCard({ dispute }: DisputeCardProps) {
  const timeLeft = getTimeLeft(dispute);

  return (
    <Link href={`/disputes/${dispute.id}`}>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-all cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold">Dispute #{dispute.disputeNumber}</span>
            <DisputeStatusBadge status={dispute.status} />
          </div>
          {timeLeft && (
            <span className="text-xs text-gray-400">{timeLeft}</span>
          )}
        </div>

        {dispute.projectTitle && (
          <p className="text-gray-300 text-sm mb-2">{dispute.projectTitle}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Filed by {dispute.initiatorRole}</span>
          <span>•</span>
          <span>{new Date(dispute.createdAt).toLocaleDateString()}</span>
        </div>

        {dispute.status === 'voting' && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Client votes</span>
              <span>Developer votes</span>
            </div>
            <VoteBar
              clientWeight={parseFloat(dispute.clientVoteWeight)}
              developerWeight={parseFloat(dispute.developerVoteWeight)}
            />
          </div>
        )}

        {dispute.status === 'resolved' && dispute.winner && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <span className="text-xs">
              Winner:{' '}
              <span className={dispute.winner === 'client' ? 'text-cyan-400' : 'text-purple-400'}>
                {dispute.winner}
              </span>
              {dispute.resolvedByOwner && (
                <span className="text-gray-500 ml-2">(Owner decision)</span>
              )}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function VoteBar({ clientWeight, developerWeight }: { clientWeight: number; developerWeight: number }) {
  const total = clientWeight + developerWeight;
  const clientPct = total > 0 ? (clientWeight / total) * 100 : 50;

  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
      <div
        className="h-full bg-cyan-500 transition-all"
        style={{ width: `${clientPct}%` }}
      />
      <div
        className="h-full bg-purple-500 transition-all"
        style={{ width: `${100 - clientPct}%` }}
      />
    </div>
  );
}

function getTimeLeft(dispute: DisputeCardProps['dispute']): string | null {
  const now = Date.now();

  if (dispute.status === 'open') {
    const deadline = new Date(dispute.evidenceDeadline).getTime();
    if (deadline > now) {
      const hours = Math.floor((deadline - now) / (1000 * 60 * 60));
      if (hours >= 24) return `${Math.floor(hours / 24)}d left for evidence`;
      return `${hours}h left for evidence`;
    }
    return 'Evidence period ended';
  }

  if (dispute.status === 'voting' && dispute.votingDeadline) {
    const deadline = new Date(dispute.votingDeadline).getTime();
    if (deadline > now) {
      const hours = Math.floor((deadline - now) / (1000 * 60 * 60));
      if (hours >= 24) return `${Math.floor(hours / 24)}d left to vote`;
      return `${hours}h left to vote`;
    }
    return 'Voting period ended';
  }

  return null;
}
