'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MilestoneCard from '@/components/project/MilestoneCard';
import RaiseDisputeModal from '@/components/disputes/RaiseDisputeModal';

interface Milestone {
  id: string;
  milestoneNumber: number;
  title: string;
  description: string;
  deliverables: string[];
  budget: string;
  status: string;
  startedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  deliverableUrls?: string[];
  reviewNotes?: string;
  onChainIndex?: number;
}

interface Project {
  id: string;
  projectNumber: number;
  contractProjectId: string | null;
  clientAddress: string;
  companyName?: string;
  clientEmail?: string;
  title: string;
  description: string;
  requiredSkills: string[];
  totalBudget: string;
  status: string;
  usesOnchainMilestones?: boolean;
  assignedDeveloper?: {
    address: string;
    githubUsername: string;
    skills: string[];
    email?: string;
  };
  milestones: Milestone[];
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  completedAt?: string;
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
};

export default function DeveloperProjectDetailPage() {
  const { id } = useParams();
  const { address } = useAccount();

  const [project, setProject] = useState<Project | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);

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
      // API shape: { reviews: { clientReview, developerReview } } — flatten
      // into a tagged array so the UI can render and dedupe naturally.
      const flat: ReviewData[] = [];
      if (data.reviews?.clientReview) {
        flat.push({ ...data.reviews.clientReview, reviewerType: 'client' });
      }
      if (data.reviews?.developerReview) {
        flat.push({ ...data.reviews.developerReview, reviewerType: 'developer' });
      }
      setReviews(flat);
    } catch {
      // Non-critical
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
        <Link href="/dashboard/developer/projects" className="text-violet-600 hover:text-violet-700 text-sm font-medium">
          &larr; Back to Projects
        </Link>
      </div>
    );
  }

  const isDeveloper =
    !!address &&
    project.assignedDeveloper?.address.toLowerCase() === address.toLowerCase();

  const completedMilestones = project.milestones.filter((m) => m.status === 'completed').length;
  const totalBudget = parseFloat(project.totalBudget);
  const releasedAmount = project.milestones
    .filter((m) => m.status === 'completed')
    .reduce((sum, m) => sum + parseFloat(m.budget), 0);
  const remainingAmount = totalBudget - releasedAmount;

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link href="/dashboard/developer/projects" className="text-violet-600 hover:text-violet-700 text-sm font-medium mb-4 inline-flex items-center gap-1">
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
            {project.status === 'active' && project.contractProjectId && isDeveloper && (
              <button
                onClick={() => setShowDisputeModal(true)}
                className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-orange-700 text-xs font-medium hover:bg-orange-100 transition-colors"
              >
                Raise Dispute
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

        {/* Client Info */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Client</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Wallet Address</p>
              <p className="text-gray-900 font-mono text-xs">{project.clientAddress}</p>
            </div>
            {project.companyName && (
              <div>
                <p className="text-gray-400 text-xs">Company</p>
                <p className="text-gray-900">{project.companyName}</p>
              </div>
            )}
            {project.clientEmail && (
              <div>
                <p className="text-gray-400 text-xs">Email</p>
                <p className="text-gray-900">{project.clientEmail}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escrow Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Budget</p>
          <p className="text-2xl font-bold text-gray-900">{totalBudget.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Earned</p>
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
          {project.milestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id}
              milestone={{
                ...milestone,
                contractProjectId: project.contractProjectId ?? undefined,
                usesOnchainMilestones: project.usesOnchainMilestones,
              }}
              projectId={project.id}
              isClient={false}
              isDeveloper={isDeveloper}
              onUpdate={fetchProject}
            />
          ))}
        </div>
      </div>

      {/* Reviews Section — read-only on the dev side. The developer's
          reputation is built by client reviews; we don't ask devs to review
          clients in MVP. */}
      {project.status === 'completed' && reviews.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reviews</h2>
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
        </div>
      )}

      {/* Raise Dispute Modal */}
      {showDisputeModal && project.contractProjectId && (
        <RaiseDisputeModal
          projectId={project.id}
          contractProjectId={project.contractProjectId}
          userRole="developer"
          onClose={() => setShowDisputeModal(false)}
        />
      )}
    </div>
  );
}
