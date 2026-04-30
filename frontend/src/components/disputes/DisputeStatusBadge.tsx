'use client';

const statusConfig: Record<string, { label: string; className: string }> = {
  open: {
    label: 'Evidence Phase',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  voting: {
    label: 'DAO Voting',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
};

interface DisputeStatusBadgeProps {
  status: string;
}

export default function DisputeStatusBadge({ status }: DisputeStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      {config.label}
    </span>
  );
}
