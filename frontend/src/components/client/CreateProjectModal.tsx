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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a0a2e] rounded-2xl border border-white/10 p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Create New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={submitting}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-white font-semibold mb-2">Project Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="My Web3 Project"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-semibold mb-2">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
              placeholder="Describe your project requirements..."
            />
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-white font-semibold mb-2">Required Skills *</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    requiredSkills.includes(skill)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-sm mt-1">Selected: {requiredSkills.length}/10</p>
          </div>

          {/* Total Budget */}
          <div>
            <label className="block text-white font-semibold mb-2">Total Budget (USDC) *</label>
            <input
              type="number"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              min={100}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Min 100 USDC"
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-semibold">Milestones *</label>
              <button
                type="button"
                onClick={addMilestone}
                className="px-3 py-1 bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-300 text-sm hover:bg-purple-600/50 transition-colors"
              >
                + Add Milestone
              </button>
            </div>

            <div className="space-y-4">
              {milestones.map((milestone, mIndex) => (
                <div key={mIndex} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-white font-medium">Milestone {mIndex + 1}</h4>
                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMilestone(mIndex)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(mIndex, 'title', e.target.value)}
                      placeholder="Milestone title"
                      maxLength={200}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
                    />

                    <textarea
                      value={milestone.description}
                      onChange={(e) => updateMilestone(mIndex, 'description', e.target.value)}
                      placeholder="Milestone description"
                      rows={2}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500 resize-none"
                    />

                    <input
                      type="number"
                      value={milestone.budget || ''}
                      onChange={(e) => updateMilestone(mIndex, 'budget', parseFloat(e.target.value) || 0)}
                      placeholder="Budget (USDC)"
                      min={0}
                      className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
                    />

                    {/* Deliverables */}
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Deliverables</p>
                      {milestone.deliverables.map((d, dIndex) => (
                        <div key={dIndex} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={d}
                            onChange={(e) => updateDeliverable(mIndex, dIndex, e.target.value)}
                            placeholder={`Deliverable ${dIndex + 1}`}
                            className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
                          />
                          {milestone.deliverables.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDeliverable(mIndex, dIndex)}
                              className="text-red-400 hover:text-red-300 text-sm px-2"
                            >
                              X
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addDeliverable(mIndex)}
                        className="text-purple-400 hover:text-purple-300 text-xs"
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
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg disabled:opacity-50"
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
