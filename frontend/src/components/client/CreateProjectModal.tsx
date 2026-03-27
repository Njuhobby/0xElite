'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

interface Milestone {
  title: string;
  description: string;
  deliverables: string[];
  budget: number;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_SKILLS = [
  'Solidity', 'Rust', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'Go', 'Python', 'DeFi', 'NFT', 'ZK-Proofs', 'Smart Contracts', 'Web3.js',
  'Ethers.js', 'Hardhat', 'Foundry', 'Subgraph', 'IPFS', 'Backend', 'Frontend'
];

export default function CreateProjectModal({ onClose, onSuccess }: Props) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [totalBudget, setTotalBudget] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([
    { title: '', description: '', deliverables: [''], budget: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleSkill = (skill: string) => {
    setRequiredSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= 10) return prev;
      return [...prev, skill];
    });
  };

  const updateMilestone = (index: number, field: keyof Milestone, value: string | string[] | number) => {
    setMilestones((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addMilestone = () => {
    setMilestones((prev) => [...prev, { title: '', description: '', deliverables: [''], budget: 0 }]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDeliverable = (mIndex: number, dIndex: number, value: string) => {
    setMilestones((prev) => {
      const updated = [...prev];
      const deliverables = [...updated[mIndex].deliverables];
      deliverables[dIndex] = value;
      updated[mIndex] = { ...updated[mIndex], deliverables };
      return updated;
    });
  };

  const addDeliverable = (mIndex: number) => {
    setMilestones((prev) => {
      const updated = [...prev];
      updated[mIndex] = { ...updated[mIndex], deliverables: [...updated[mIndex].deliverables, ''] };
      return updated;
    });
  };

  const removeDeliverable = (mIndex: number, dIndex: number) => {
    if (milestones[mIndex].deliverables.length <= 1) return;
    setMilestones((prev) => {
      const updated = [...prev];
      updated[mIndex] = {
        ...updated[mIndex],
        deliverables: updated[mIndex].deliverables.filter((_, i) => i !== dIndex),
      };
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!address) return;

    // Validate
    if (!title.trim()) { setError('Project title is required'); return; }
    if (!description.trim()) { setError('Project description is required'); return; }
    if (requiredSkills.length === 0) { setError('Select at least one required skill'); return; }
    const budget = parseFloat(totalBudget);
    if (!budget || budget < 100) { setError('Budget must be at least 100 USDC'); return; }

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      if (!m.title.trim()) { setError(`Milestone ${i + 1} title is required`); return; }
      if (!m.description.trim()) { setError(`Milestone ${i + 1} description is required`); return; }
      if (!m.budget || m.budget <= 0) { setError(`Milestone ${i + 1} budget must be positive`); return; }
      const nonEmptyDeliverables = m.deliverables.filter((d) => d.trim());
      if (nonEmptyDeliverables.length === 0) { setError(`Milestone ${i + 1} needs at least one deliverable`); return; }
    }

    const milestoneSum = milestones.reduce((sum, m) => sum + m.budget, 0);
    if (Math.abs(milestoneSum - budget) > 0.01) {
      setError(`Milestone budgets (${milestoneSum}) must sum to total budget (${budget})`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const message = `Create project on 0xElite\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            message,
            signature,
            title: title.trim(),
            description: description.trim(),
            requiredSkills,
            totalBudget: budget,
            milestones: milestones.map((m) => ({
              title: m.title.trim(),
              description: m.description.trim(),
              deliverables: m.deliverables.filter((d) => d.trim()),
              budget: m.budget,
            })),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create project');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={submitting}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              placeholder="My Web3 Project"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-28 resize-none"
              placeholder="Describe your project requirements..."
            />
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Required Skills *</label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    requiredSkills.includes(skill)
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-1.5">Selected: {requiredSkills.length}/10</p>
          </div>

          {/* Total Budget */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Total Budget (USDC) *</label>
            <input
              type="number"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              min={100}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              placeholder="Min 100 USDC"
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Milestones *</label>
              <button
                type="button"
                onClick={addMilestone}
                className="px-3 py-1 bg-violet-50 border border-violet-200 rounded-lg text-violet-600 text-sm font-medium hover:bg-violet-100 transition-colors"
              >
                + Add Milestone
              </button>
            </div>

            <div className="space-y-3">
              {milestones.map((milestone, mIndex) => (
                <div key={mIndex} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900">Milestone {mIndex + 1}</h4>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMilestone(mIndex)}
                        className="text-red-500 hover:text-red-600 text-xs font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(mIndex, 'title', e.target.value)}
                      placeholder="Milestone title"
                      maxLength={200}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />

                    <textarea
                      value={milestone.description}
                      onChange={(e) => updateMilestone(mIndex, 'description', e.target.value)}
                      placeholder="Milestone description"
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                    />

                    <input
                      type="number"
                      value={milestone.budget || ''}
                      onChange={(e) => updateMilestone(mIndex, 'budget', parseFloat(e.target.value) || 0)}
                      placeholder="Budget (USDC)"
                      min={0}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />

                    {/* Deliverables */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Deliverables</p>
                      {milestone.deliverables.map((d, dIndex) => (
                        <div key={dIndex} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={d}
                            onChange={(e) => updateDeliverable(mIndex, dIndex, e.target.value)}
                            placeholder={`Deliverable ${dIndex + 1}`}
                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          />
                          {milestone.deliverables.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDeliverable(mIndex, dIndex)}
                              className="text-red-400 hover:text-red-500 text-sm px-2"
                            >
                              X
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addDeliverable(mIndex)}
                        className="text-violet-600 hover:text-violet-700 text-xs font-medium"
                      >
                        + Add deliverable
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 py-2.5 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
