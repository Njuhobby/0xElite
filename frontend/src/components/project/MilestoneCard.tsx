'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

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
}

interface Props {
  milestone: Milestone;
  isClient: boolean;
  isDeveloper: boolean;
  onUpdate: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Not Started',
    className: 'bg-gray-500/20 border-gray-500/30 text-gray-300',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
  },
  pending_review: {
    label: 'Pending Review',
    className: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-500/20 border-green-500/30 text-green-300',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-red-500/20 border-red-500/30 text-red-300',
  },
};

export default function MilestoneCard({ milestone, isClient, isDeveloper, onUpdate }: Props) {
  const { address } = useAccount();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [deliverableUrls, setDeliverableUrls] = useState<string[]>(['']);
  const [reviewNotes, setReviewNotes] = useState('');

  const { signMessage } = useSignMessage({
    onSuccess: async (signature, variables) => {
      await updateMilestone(signature, variables.message);
    },
    onError: (error) => {
      setError(error.message);
      setIsUpdating(false);
    },
  });

  const generateMessage = (action: string) => {
    const timestamp = Date.now();
    return `${action} milestone on 0xElite

Wallet: ${address}
Timestamp: ${timestamp}`;
  };

  const updateMilestone = async (signature: string, message: string) => {
    try {
      const payload: any = {
        address,
        message,
        signature,
      };

      // Developer starting work
      if (milestone.status === 'pending' && isDeveloper) {
        payload.status = 'in_progress';
      }
      // Developer submitting for review
      else if (milestone.status === 'in_progress' && isDeveloper && showSubmitForm) {
        payload.status = 'pending_review';
        payload.deliverableUrls = deliverableUrls.filter(url => url.trim());
      }
      // Client approving
      else if (milestone.status === 'pending_review' && isClient) {
        payload.status = 'completed';
        if (reviewNotes.trim()) {
          payload.reviewNotes = reviewNotes;
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/milestones/${milestone.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update milestone');
      }

      setShowSubmitForm(false);
      setDeliverableUrls(['']);
      setReviewNotes('');
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartWork = () => {
    setError('');
    setIsUpdating(true);
    const message = generateMessage('Start work on');
    signMessage({ message });
  };

  const handleSubmitForReview = () => {
    if (deliverableUrls.filter(url => url.trim()).length === 0) {
      setError('Please provide at least one deliverable URL');
      return;
    }

    setError('');
    setIsUpdating(true);
    const message = generateMessage('Submit milestone for review');
    signMessage({ message });
  };

  const handleApprove = () => {
    setError('');
    setIsUpdating(true);
    const message = generateMessage('Approve milestone completion');
    signMessage({ message });
  };

  const addDeliverableUrl = () => {
    setDeliverableUrls([...deliverableUrls, '']);
  };

  const updateDeliverableUrl = (index: number, value: string) => {
    const updated = [...deliverableUrls];
    updated[index] = value;
    setDeliverableUrls(updated);
  };

  const removeDeliverableUrl = (index: number) => {
    if (deliverableUrls.length > 1) {
      setDeliverableUrls(deliverableUrls.filter((_, i) => i !== index));
    }
  };

  const config = statusConfig[milestone.status] || statusConfig.pending;

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-gray-400 font-semibold">Milestone {milestone.milestoneNumber}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.className}`}>
              {config.label}
            </span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{milestone.title}</h3>
          <p className="text-gray-300">{milestone.description}</p>
        </div>
        <div className="text-right ml-4">
          <p className="text-2xl font-bold text-white">${parseFloat(milestone.budget).toFixed(0)}</p>
          <p className="text-gray-400 text-sm">USDC</p>
        </div>
      </div>

      {/* Deliverables */}
      <div className="mb-4">
        <p className="text-gray-400 font-medium mb-2">Deliverables:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-1">
          {milestone.deliverables.map((deliverable: string, index: number) => (
            <li key={index}>{deliverable}</li>
          ))}
        </ul>
      </div>

      {/* Submitted Deliverables */}
      {milestone.deliverableUrls && milestone.deliverableUrls.length > 0 && (
        <div className="mb-4 p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 font-medium mb-2">Submitted Deliverables:</p>
          <ul className="space-y-2">
            {milestone.deliverableUrls.map((url: string, index: number) => (
              <li key={index}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Review Notes */}
      {milestone.reviewNotes && (
        <div className="mb-4 p-4 bg-green-600/10 border border-green-500/30 rounded-lg">
          <p className="text-green-300 font-medium mb-2">Client Review:</p>
          <p className="text-gray-300">{milestone.reviewNotes}</p>
        </div>
      )}

      {/* Timestamps */}
      {(milestone.startedAt || milestone.submittedAt || milestone.completedAt) && (
        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
          {milestone.startedAt && (
            <div>
              <p className="text-gray-400 mb-1">Started</p>
              <p className="text-white">{new Date(milestone.startedAt).toLocaleDateString()}</p>
            </div>
          )}
          {milestone.submittedAt && (
            <div>
              <p className="text-gray-400 mb-1">Submitted</p>
              <p className="text-white">{new Date(milestone.submittedAt).toLocaleDateString()}</p>
            </div>
          )}
          {milestone.completedAt && (
            <div>
              <p className="text-gray-400 mb-1">Completed</p>
              <p className="text-white">{new Date(milestone.completedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Developer Actions */}
      {isDeveloper && (
        <div>
          {milestone.status === 'pending' && (
            <button
              onClick={handleStartWork}
              disabled={isUpdating}
              className="w-full py-3 bg-blue-600 rounded-lg text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {isUpdating ? 'Starting...' : 'Start Working on This Milestone'}
            </button>
          )}

          {milestone.status === 'in_progress' && !showSubmitForm && (
            <button
              onClick={() => setShowSubmitForm(true)}
              className="w-full py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700"
            >
              Submit for Review
            </button>
          )}

          {showSubmitForm && (
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">Deliverable URLs</label>
                {deliverableUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateDeliverableUrl(index, e.target.value)}
                      className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                      placeholder="https://github.com/user/repo/pull/123"
                    />
                    {deliverableUrls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDeliverableUrl(index)}
                        className="text-red-400 hover:text-red-300 px-3 py-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDeliverableUrl}
                  className="text-purple-400 hover:text-purple-300 font-medium text-sm"
                >
                  + Add URL
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubmitForm(false)}
                  className="flex-1 py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitForReview}
                  disabled={isUpdating}
                  className="flex-1 py-3 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Client Actions */}
      {isClient && milestone.status === 'pending_review' && (
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Review Notes (Optional)</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-24 resize-none"
              placeholder="Add any feedback or comments..."
            />
          </div>

          <button
            onClick={handleApprove}
            disabled={isUpdating}
            className="w-full py-3 bg-green-600 rounded-lg text-white font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {isUpdating ? 'Approving...' : 'Approve & Mark as Completed'}
          </button>
        </div>
      )}
    </div>
  );
}
