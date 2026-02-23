'use client';

const statusConfig: Record<string, { label: string; className: string }> = {
  open: {
    label: 'Evidence Phase',
    className: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
  },
  voting: {
    label: 'DAO Voting',
    className: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-green-500/20 border-green-500/30 text-green-300',
  },
};

interface DisputeStatusBadgeProps {
  status: string;
}

export default function DisputeStatusBadge({ status }: DisputeStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-500/20 border-gray-500/30 text-gray-300',
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
