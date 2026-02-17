'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useParams } from 'next/navigation';
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

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500',
  open: 'bg-blue-500',
  assigned: 'bg-purple-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
  disputed: 'bg-orange-500',
  pending_review: 'bg-amber-500',
  not_started: 'bg-gray-400',
};

export default function ClientProjectDetailPage() {
  const { id } = useParams();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading project...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-white mb-4">Error</h1>
        <p className="text-gray-400 mb-6">{error || 'Project not found'}</p>
        <Link href="/dashboard/client/projects" className="text-purple-400 hover:text-purple-300">
          Back to Projects
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
    <div>
      {/* Back link */}
      <Link href="/dashboard/client/projects" className="text-purple-400 hover:text-purple-300 text-sm mb-4 inline-block">
        ← Back to Projects
      </Link>

      {/* Project Header */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{project.title}</h1>
            <p className="text-gray-400 text-sm">
              #{project.projectNumber} &middot; Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-semibold text-white ${statusColors[project.status] || 'bg-gray-500'}`}>
            {project.status.replace('_', ' ')}
          </span>
        </div>

        <p className="text-gray-300 mb-6">{project.description}</p>

        {/* Skills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {project.requiredSkills.map((skill) => (
            <span
              key={skill}
              className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 text-sm"
            >
              {skill}
            </span>
          ))}
        </div>

        {/* Assigned Developer */}
        {project.assignedDeveloper && (
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-gray-400 text-sm mb-1">Assigned Developer</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-sm">
                {project.assignedDeveloper.address.slice(2, 4).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">
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
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Total Budget</p>
          <p className="text-2xl font-bold text-white">{totalBudget.toFixed(2)} USDC</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Released</p>
          <p className="text-2xl font-bold text-green-400">{releasedAmount.toFixed(2)} USDC</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Remaining</p>
          <p className="text-2xl font-bold text-yellow-400">{remainingAmount.toFixed(2)} USDC</p>
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">
          Milestones ({completedMilestones}/{project.milestones.length})
        </h2>

        {/* Progress bar */}
        <div className="w-full h-2 bg-white/10 rounded-full mb-6">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
            style={{ width: `${project.milestones.length > 0 ? (completedMilestones / project.milestones.length) * 100 : 0}%` }}
          />
        </div>

        <div className="space-y-4">
          {project.milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className={`border rounded-xl p-5 ${
                milestone.status === 'pending_review'
                  ? 'border-amber-500/50 bg-amber-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">
                    {index + 1}. {milestone.title}
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">{milestone.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">{parseFloat(milestone.budget).toFixed(2)} USDC</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusColors[milestone.status] || 'bg-gray-500'}`}>
                    {milestone.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Deliverables */}
              {milestone.deliverables && milestone.deliverables.length > 0 && (
                <div className="mb-3">
                  <p className="text-gray-400 text-xs mb-1">Deliverables:</p>
                  <ul className="list-disc list-inside text-gray-300 text-sm space-y-1">
                    {milestone.deliverables.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Submitted deliverable URLs */}
              {milestone.deliverableUrls && milestone.deliverableUrls.length > 0 && (
                <div className="mb-3 p-3 bg-white/5 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Submitted Work:</p>
                  {milestone.deliverableUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm block"
                    >
                      {url}
                    </a>
                  ))}
                </div>
              )}

              {/* Review notes */}
              {milestone.reviewNotes && (
                <div className="mb-3 p-3 bg-white/5 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Review Notes:</p>
                  <p className="text-gray-300 text-sm">{milestone.reviewNotes}</p>
                </div>
              )}

              {/* Approve/Reject actions for pending_review milestones */}
              {milestone.status === 'pending_review' && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => handleMilestoneAction(milestone.id, 'approve')}
                    disabled={actionLoading !== null}
                    className="px-5 py-2 bg-green-600 rounded-lg text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `approve-${milestone.id}` ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleMilestoneAction(milestone.id, 'reject')}
                    disabled={actionLoading !== null}
                    className="px-5 py-2 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 font-medium hover:bg-red-600/30 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `reject-${milestone.id}` ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              )}

              {/* Completed info */}
              {milestone.completedAt && (
                <p className="text-green-400 text-xs mt-2">
                  Completed {new Date(milestone.completedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reviews Section */}
      {project.status === 'completed' && (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Reviews</h2>
            {!hasReviewed && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="px-4 py-2 bg-purple-600 rounded-lg text-white font-medium hover:bg-purple-700 transition-colors"
              >
                Submit Review
              </button>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="text-gray-400">No reviews yet for this project.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">
                      {review.reviewerType === 'client' ? 'Client' : 'Developer'} &middot;{' '}
                      {review.reviewerAddress.slice(0, 6)}...{review.reviewerAddress.slice(-4)}
                    </span>
                    <span className="text-yellow-400 font-medium">
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </span>
                  </div>
                  {review.comment && <p className="text-gray-300 text-sm">{review.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
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
