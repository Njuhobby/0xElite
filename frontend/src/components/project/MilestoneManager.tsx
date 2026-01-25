'use client';

import { useState } from 'react';

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

export default function MilestoneManager({ milestones, onChange, totalBudget }: Props) {
  const updateMilestone = (index: number, field: keyof Milestone, value: any) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addMilestone = () => {
    onChange([
      ...milestones,
      {
        title: '',
        description: '',
        deliverables: [''],
        budget: 0,
      }
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
    <div className="space-y-6">
      {milestones.map((milestone, index) => (
        <div key={index} className="bg-white/5 rounded-xl border border-white/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Milestone {index + 1}</h3>
            {milestones.length > 1 && (
              <button
                type="button"
                onClick={() => removeMilestone(index)}
                className="text-red-400 hover:text-red-300 font-semibold"
              >
                Remove
              </button>
            )}
          </div>

          {/* Milestone Title */}
          <div className="mb-4">
            <label className="block text-gray-300 font-medium mb-2">Title</label>
            <input
              type="text"
              value={milestone.title}
              onChange={(e) => updateMilestone(index, 'title', e.target.value)}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="e.g., UI/UX Design & Setup"
              maxLength={200}
            />
          </div>

          {/* Milestone Description */}
          <div className="mb-4">
            <label className="block text-gray-300 font-medium mb-2">Description</label>
            <textarea
              value={milestone.description}
              onChange={(e) => updateMilestone(index, 'description', e.target.value)}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-20 resize-none"
              placeholder="Describe what needs to be completed in this milestone..."
            />
          </div>

          {/* Deliverables */}
          <div className="mb-4">
            <label className="block text-gray-300 font-medium mb-2">Deliverables</label>
            <div className="space-y-2">
              {milestone.deliverables.map((deliverable, dIndex) => (
                <div key={dIndex} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={deliverable}
                    onChange={(e) => updateDeliverable(index, dIndex, e.target.value)}
                    className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder={`Deliverable ${dIndex + 1}`}
                  />
                  {milestone.deliverables.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDeliverable(index, dIndex)}
                      className="text-red-400 hover:text-red-300 px-3 py-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="mt-2 text-purple-400 hover:text-purple-300 font-medium text-sm"
            >
              + Add Deliverable
            </button>
          </div>

          {/* Milestone Budget */}
          <div>
            <label className="block text-gray-300 font-medium mb-2">Budget (USDC)</label>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2">$</span>
              <input
                type="number"
                value={milestone.budget || ''}
                onChange={(e) => updateMilestone(index, 'budget', parseFloat(e.target.value) || 0)}
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="1000"
                min="0"
                step="0.01"
              />
              <span className="text-gray-400 ml-2">USDC</span>
            </div>
          </div>
        </div>
      ))}

      {/* Add Milestone Button */}
      <button
        type="button"
        onClick={addMilestone}
        className="w-full py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20 border border-white/20 transition-all"
      >
        + Add Another Milestone
      </button>

      {/* Budget Summary */}
      <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-300">Total Project Budget:</span>
          <span className="text-white font-bold">${totalBudget.toFixed(2)} USDC</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-300">Milestone Budgets Sum:</span>
          <span className={`font-bold ${
            Math.abs(milestoneBudgetSum - totalBudget) < 0.01 ? 'text-green-400' : 'text-yellow-400'
          }`}>
            ${milestoneBudgetSum.toFixed(2)} USDC
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-gray-300">Remaining to Allocate:</span>
          <span className={`font-bold ${
            Math.abs(remainingBudget) < 0.01 ? 'text-green-400' :
            remainingBudget > 0 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            ${remainingBudget.toFixed(2)} USDC
          </span>
        </div>
        {Math.abs(remainingBudget) < 0.01 && (
          <p className="text-green-400 text-sm mt-2">✓ Budgets match perfectly!</p>
        )}
      </div>
    </div>
  );
}
