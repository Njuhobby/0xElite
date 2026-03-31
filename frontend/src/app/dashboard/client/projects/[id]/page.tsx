'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import SubmitReviewModal from '@/components/reviews/SubmitReviewModal';

interface Milestone {
  id: string;
  milestoneNumber: number;
  title: string;
  description: string;
  deliverables: string[];
  budget: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  deliverableUrls: string[] | null;
  reviewNotes: string | null;
}

interface DeveloperInfo {
  address: string;
  githubUsername: string | null;
  skills: string[];
  email?: string;
}

interface ProjectDetail {
  id: string;
  projectNumber: number;
  clientAddress: string;
  title: string;
  description: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  assignedDeveloper: DeveloperInfo | null;
  milestones: Milestone[];
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface ReviewData {
  id: string;
  reviewerAddress: string;
  reviewerType: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Draft' },
  deposited: { color: 'bg-violet-50 text-violet-700 border-violet-200', label: 'Awaiting Developer' },
  active: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'In Progress' },
  completed: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Completed' },
  cancelled: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Cancelled' },
  disputed: { color: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Disputed' },
  pending_review: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending Review' },
  not_started: { color: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Not Started' },
};

export default function ClientProjectDetailPage() {
  const { id } = useParams();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const router = useRouter();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    if (address && id) {
      fetchProject();
      fetchReviews();
    }
  }, [address, id]);

  const fetchProject = async () => {
    if (!address) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/${id}`,
        { headers: { 'x-wallet-address': address } }
      );

      if (!response.ok) throw new Error('Project not found');

      const data = await response.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/reviews/project/${id}`
      );
      if (!response.ok) return;
      const data = await response.json();
      setReviews(data.reviews || []);
      setHasReviewed(data.reviews?.some((r: ReviewData) => r.reviewerAddress.toLowerCase() === address?.toLowerCase()));
    } catch {
      // Non-critical
    }
  };

  const handleMilestoneAction = async (milestoneId: string, action: 'approve' | 'reject') => {
    if (!address || !project) return;

    const actionKey = `${action}-${milestoneId}`;
    setActionLoading(actionKey);

    try {
      const message = `${action === 'approve' ? 'Approve' : 'Reject'} milestone for project ${project.id}\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/milestones/${milestoneId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            message,
            signature,
            status: action === 'approve' ? 'completed' : 'in_progress',
            reviewNotes: action === 'reject' ? 'Rejected by client' : undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Failed to ${action} milestone`);
      }

      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} milestone`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!address || !project || !confirm('Are you sure you want to delete this draft project?')) return;

    try {
      setActionLoading('delete');
      const message = `Delete project ${project.id}\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects/${project.id}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, message, signature }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete project');
      }

      router.push('/dashboard/client/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading project...</span>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
        <p className="text-gray-500 mb-6">{error || 'Project not found'}</p>
        <Link href="/dashboard/client/projects" className="text-violet-600 hover:text-violet-700 text-sm font-medium">
          &larr; Back to Projects
        </Link>
      </div>
    );
  }

  const completedMilestones = project.milestones.filter((m) => m.status === 'completed').length;
  const totalBudget = parseFloat(project.totalBudget);
  const releasedAmount = project.milestones
    .filter((m) => m.status === 'completed')
    .reduce((sum, m) => sum + parseFloat(m.budget), 0);
  const remainingAmount = totalBudget - releasedAmount;

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link href="/dashboard/client/projects" className="text-violet-600 hover:text-violet-700 text-sm font-medium mb-4 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Projects
      </Link>

      {/* Project Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{project.title}</h1>
            <p className="text-gray-400 text-sm">
              #{project.projectNumber} &middot; Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {project.status === 'draft' && (
              <button
                onClick={handleDelete}
                disabled={actionLoading === 'delete'}
                className="px-3 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig[project.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {statusConfig[project.status]?.label || project.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        <p className="text-gray-600 text-sm leading-relaxed mb-5">{project.description}</p>

        {/* Skills */}
        <div className="flex flex-wrap gap-2 mb-5">
          {project.requiredSkills.map((skill) => (
            <span
              key={skill}
              className="px-2.5 py-1 bg-violet-50 border border-violet-200 rounded-lg text-violet-700 text-sm font-medium"
            >
              {skill}
            </span>
          ))}
        </div>

        {/* Assigned Developer */}
        {project.assignedDeveloper && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Assigned Developer</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {project.assignedDeveloper.address.slice(2, 4).toUpperCase()}
              </div>
              <div>
                <p className="text-gray-900 font-medium text-sm">
                  {project.assignedDeveloper.githubUsername || `${project.assignedDeveloper.address.slice(0, 6)}...${project.assignedDeveloper.address.slice(-4)}`}
                </p>
                <p className="text-gray-400 font-mono text-xs">{project.assignedDeveloper.address}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Escrow Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Budget</p>
          <p className="text-2xl font-bold text-gray-900">{totalBudget.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Released</p>
          <p className="text-2xl font-bold text-green-600">{releasedAmount.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Remaining</p>
          <p className="text-2xl font-bold text-amber-600">{remainingAmount.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Milestones ({completedMilestones}/{project.milestones.length})
        </h2>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full mb-6">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
            style={{ width: `${project.milestones.length > 0 ? (completedMilestones / project.milestones.length) * 100 : 0}%` }}
          />
        </div>

        <div className="space-y-3">
          {project.milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className={`border rounded-xl p-5 ${
                milestone.status === 'pending_review'
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-gray-900 font-semibold text-sm">
                    {index + 1}. {milestone.title}
                  </h3>
                  <p className="text-gray-500 text-sm mt-0.5">{milestone.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-900 font-medium text-sm">{parseFloat(milestone.budget).toFixed(2)} USDC</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[milestone.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {statusConfig[milestone.status]?.label || milestone.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Deliverables */}
              {milestone.deliverables && milestone.deliverables.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Deliverables:</p>
                  <ul className="list-disc list-inside text-gray-600 text-sm space-y-0.5">
                    {milestone.deliverables.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Submitted deliverable URLs */}
              {milestone.deliverableUrls && milestone.deliverableUrls.length > 0 && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Submitted Work:</p>
                  {milestone.deliverableUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:text-violet-700 text-sm block"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}

              {/* Review notes */}
              {milestone.reviewNotes && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Review Notes:</p>
                  <p className="text-gray-600 text-sm">{milestone.reviewNotes}</p>
                </div>
              )}

              {/* Approve/Reject actions for pending_review milestones */}
              {milestone.status === 'pending_review' && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleMilestoneAction(milestone.id, 'approve')}
                    disabled={actionLoading !== null}
                    className="px-4 py-2 bg-green-600 rounded-lg text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `approve-${milestone.id}` ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleMilestoneAction(milestone.id, 'reject')}
                    disabled={actionLoading !== null}
                    className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `reject-${milestone.id}` ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              )}

              {/* Completed info */}
              {milestone.completedAt && (
                <p className="text-green-600 text-xs mt-2">
                  Completed {new Date(milestone.completedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reviews Section */}
      {project.status === 'completed' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
            {!hasReviewed && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="px-4 py-2 bg-violet-600 rounded-lg text-white text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                Submit Review
              </button>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="text-gray-400 text-sm">No reviews yet for this project.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">
                      {review.reviewerType === 'client' ? 'Client' : 'Developer'} &middot;{' '}
                      {review.reviewerAddress.slice(0, 6)}...{review.reviewerAddress.slice(-4)}
                    </span>
                    <span className="text-amber-500 font-medium">
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </span>
                  </div>
                  {review.comment && <p className="text-gray-600 text-sm">{review.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Submit Review Modal */}
      {showReviewModal && (
        <SubmitReviewModal
          projectId={project.id}
          projectTitle={project.title}
          onClose={() => setShowReviewModal(false)}
          onSuccess={() => {
            setShowReviewModal(false);
            fetchReviews();
          }}
        />
      )}
    </div>
  );
}
