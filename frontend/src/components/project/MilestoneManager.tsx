'use client';

import { keccak256, encodePacked } from 'viem';

interface Milestone {
  title: string;
  description: string;
  deliverables: string[];
  budget: number;
}

interface Props {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
  totalBudget: number;
}

function computeHash(m: Milestone): string | null {
  if (!m.title.trim() || !m.description.trim()) return null;
  const filtered = m.deliverables.filter(d => d.trim());
  if (filtered.length === 0) return null;
  try {
    return keccak256(encodePacked(
      ['string', 'string', 'string'],
      [m.title, m.description, JSON.stringify(filtered)]
    ));
  } catch {
    return null;
  }
}

export default function MilestoneManager({ milestones, onChange, totalBudget }: Props) {
  const updateMilestone = (index: number, field: keyof Milestone, value: Milestone[keyof Milestone]) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addMilestone = () => {
    onChange([
      ...milestones,
      { title: '', description: '', deliverables: [''], budget: 0 },
    ]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length > 1) {
      onChange(milestones.filter((_, i) => i !== index));
    }
  };

  const addDeliverable = (milestoneIndex: number) => {
    const updated = [...milestones];
    updated[milestoneIndex].deliverables.push('');
    onChange(updated);
  };

  const updateDeliverable = (milestoneIndex: number, deliverableIndex: number, value: string) => {
    const updated = [...milestones];
    updated[milestoneIndex].deliverables[deliverableIndex] = value;
    onChange(updated);
  };

  const removeDeliverable = (milestoneIndex: number, deliverableIndex: number) => {
    const updated = [...milestones];
    if (updated[milestoneIndex].deliverables.length > 1) {
      updated[milestoneIndex].deliverables = updated[milestoneIndex].deliverables.filter(
        (_, i) => i !== deliverableIndex
      );
      onChange(updated);
    }
  };

  const milestoneBudgetSum = milestones.reduce((sum, m) => sum + (m.budget || 0), 0);
  const remainingBudget = totalBudget - milestoneBudgetSum;

  return (
    <div className="space-y-4">
      {milestones.map((milestone, index) => (
        <div key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Milestone {index + 1}</h3>
            {milestones.length > 1 && (
              <button
                type="button"
                onClick={() => removeMilestone(index)}
                className="text-red-500 hover:text-red-600 text-xs font-medium"
              >
                Remove
              </button>
            )}
          </div>

          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={milestone.title}
                onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                placeholder="e.g., UI/UX Design & Setup"
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea
                value={milestone.description}
                onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-20 resize-none"
                placeholder="Describe what needs to be completed in this milestone..."
              />
            </div>

            {/* Budget */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Budget (USDC)</label>
              <input
                type="number"
                value={milestone.budget || ''}
                onChange={(e) => updateMilestone(index, 'budget', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                placeholder="1000"
                min="0"
                step="0.01"
              />
            </div>

            {/* Deliverables */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Deliverables</label>
              <div className="space-y-2">
                {milestone.deliverables.map((d, dIndex) => (
                  <div key={dIndex} className="flex gap-2">
                    <input
                      type="text"
                      value={d}
                      onChange={(e) => updateDeliverable(index, dIndex, e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                      placeholder={`Deliverable ${dIndex + 1}`}
                    />
                    {milestone.deliverables.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDeliverable(index, dIndex)}
                        className="text-red-400 hover:text-red-500 text-sm px-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addDeliverable(index)}
                className="mt-2 text-violet-600 hover:text-violet-700 text-xs font-medium"
              >
                + Add deliverable
              </button>
            </div>
          </div>

          {/* On-Chain Hash Preview */}
          {(() => {
            const hash = computeHash(milestone);
            return hash ? (
              <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg">
                <p className="text-gray-400 text-xs font-medium mb-1">On-Chain Details Hash</p>
                <p className="text-gray-500 text-xs font-mono break-all">{hash}</p>
              </div>
            ) : null;
          })()}
        </div>
      ))}

      {/* Add Milestone Button */}
      <button
        type="button"
        onClick={addMilestone}
        className="w-full py-2.5 bg-gray-50 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-100 border border-gray-200 transition-colors"
      >
        + Add Another Milestone
      </button>

      {/* Budget Summary */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-gray-600 text-sm">Total Project Budget:</span>
          <span className="text-gray-900 font-bold text-sm">${totalBudget.toFixed(2)} USDC</span>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-gray-600 text-sm">Milestone Budgets Sum:</span>
          <span className={`font-bold text-sm ${
            Math.abs(milestoneBudgetSum - totalBudget) < 0.01 ? 'text-green-600' : 'text-amber-600'
          }`}>
            ${milestoneBudgetSum.toFixed(2)} USDC
          </span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-violet-200">
          <span className="text-gray-600 text-sm">Remaining to Allocate:</span>
          <span className={`font-bold text-sm ${
            Math.abs(remainingBudget) < 0.01 ? 'text-green-600' :
            remainingBudget > 0 ? 'text-amber-600' : 'text-red-600'
          }`}>
            ${remainingBudget.toFixed(2)} USDC
          </span>
        </div>
        {Math.abs(remainingBudget) < 0.01 && (
          <p className="text-green-600 text-xs mt-2 font-medium">Budgets match perfectly</p>
        )}
      </div>
    </div>
  );
}
