interface Props {
  status: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Finding Developer',
    className: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
  },
  active: {
    label: 'In Progress',
    className: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-500/20 border-green-500/30 text-green-300',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-red-500/20 border-red-500/30 text-red-300',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-500/20 border-gray-500/30 text-gray-300',
  },
};

export default function ProjectStatusBadge({ status }: Props) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.className}`}>
      {config.label}
    </span>
  );
}
