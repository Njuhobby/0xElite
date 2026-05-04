'use client';

// Phases the UI surfaces — derived from raw `status` plus deadlines and quorum
// so users aren't stuck staring at "DAO Voting" while it actually waits on the
// admin or the keeper.
type Phase =
  | 'evidence'
  | 'evidence_ended' // open + evidence deadline passed, awaiting startVoting keeper
  | 'voting'
  | 'voting_resolution_pending' // voting + voting deadline passed + quorum met (executeResolution about to fire)
  | 'voting_admin_pending' // voting + voting deadline passed + quorum not met (admin must intervene)
  | 'resolved'
  | 'unknown';

const phaseConfig: Record<Phase, { label: string; className: string }> = {
  evidence: {
    label: 'Evidence Phase',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  evidence_ended: {
    label: 'Awaiting Voting Start',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  voting: {
    label: 'DAO Voting',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  voting_resolution_pending: {
    label: 'Awaiting Resolution',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  voting_admin_pending: {
    label: 'Awaiting Admin Decision',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

interface DisputeStatusBadgeProps {
  status: string;
  evidenceDeadline?: string | null;
  votingDeadline?: string | null;
  totalVoteWeight?: number | string | null;
  quorumRequired?: number | string | null;
}

function derivePhase(props: DisputeStatusBadgeProps): Phase {
  const { status, evidenceDeadline, votingDeadline, totalVoteWeight, quorumRequired } = props;
  const now = Date.now();

  if (status === 'open') {
    if (evidenceDeadline && new Date(evidenceDeadline).getTime() < now) {
      return 'evidence_ended';
    }
    return 'evidence';
  }

  if (status === 'voting') {
    if (votingDeadline && new Date(votingDeadline).getTime() < now) {
      const total = Number(totalVoteWeight ?? 0);
      const quorum = Number(quorumRequired ?? 0);
      // Quorum can only be met if it was set (>0) AND total cleared it.
      const quorumMet = quorum > 0 && total >= quorum;
      return quorumMet ? 'voting_resolution_pending' : 'voting_admin_pending';
    }
    return 'voting';
  }

  if (status === 'resolved') return 'resolved';
  return 'unknown';
}

export default function DisputeStatusBadge(props: DisputeStatusBadgeProps) {
  const phase = derivePhase(props);
  const config = phaseConfig[phase];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
