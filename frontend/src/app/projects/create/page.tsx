'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useRouter } from 'next/navigation';
import MilestoneManager from '@/components/project/MilestoneManager';

interface Milestone {
  title: string;
  description: string;
  deliverables: string[];
  budget: number;
}

const AVAILABLE_SKILLS = [
  'Solidity', 'Rust', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'Go', 'Python', 'DeFi', 'NFT', 'ZK-Proofs', 'Smart Contracts', 'Web3.js',
  'Ethers.js', 'Hardhat', 'Foundry', 'Subgraph', 'IPFS', 'Backend', 'Frontend'
];

export default function CreateProjectPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requiredSkills: [] as string[],
    totalBudget: '',
  });

  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      title: '',
      description: '',
      deliverables: [''],
      budget: 0,
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const { signMessage } = useSignMessage({
    onSuccess: async (signature) => {
      await submitProject(signature);
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });

  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(skill)
        ? prev.requiredSkills.filter(s => s !== skill)
        : [...prev.requiredSkills, skill]
    }));
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!formData.title.trim()) errors.push('Project title is required');
    if (formData.title.length > 200) errors.push('Project title must be 200 characters or less');
    if (!formData.description.trim()) errors.push('Project description is required');
    if (formData.requiredSkills.length === 0) errors.push('At least one required skill must be selected');
    if (formData.requiredSkills.length > 10) errors.push('Maximum 10 required skills allowed');

    const totalBudget = parseFloat(formData.totalBudget);
    if (!formData.totalBudget || isNaN(totalBudget) || totalBudget < 100) {
      errors.push('Total budget must be at least 100 USDC');
    }

    if (milestones.length === 0) {
      errors.push('At least one milestone is required');
    } else {
      const milestoneBudgetSum = milestones.reduce((sum, m) => sum + m.budget, 0);
      if (Math.abs(milestoneBudgetSum - totalBudget) > 0.01) {
        errors.push(`Milestone budgets (${milestoneBudgetSum} USDC) must equal total budget (${totalBudget} USDC)`);
      }

      milestones.forEach((milestone, index) => {
        if (!milestone.title.trim()) errors.push(`Milestone ${index + 1}: Title is required`);
        if (!milestone.description.trim()) errors.push(`Milestone ${index + 1}: Description is required`);
        if (milestone.deliverables.filter(d => d.trim()).length === 0) {
          errors.push(`Milestone ${index + 1}: At least one deliverable is required`);
        }
        if (milestone.budget <= 0) errors.push(`Milestone ${index + 1}: Budget must be positive`);
      });
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const generateMessage = () => {
    const timestamp = Date.now();
    return `Create project on 0xElite

Wallet: ${address}
Timestamp: ${timestamp}`;
  };

  const submitProject = async (signature: string) => {
    try {
      const message = generateMessage();

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/projects`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address,
            message,
            signature,
            title: formData.title,
            description: formData.description,
            requiredSkills: formData.requiredSkills,
            totalBudget: parseFloat(formData.totalBudget),
            milestones: milestones.map(m => ({
              title: m.title,
              description: m.description,
              deliverables: m.deliverables.filter(d => d.trim()),
              budget: m.budget,
            })),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create project');
      }

      const data = await response.json();

      // Redirect to project page
      router.push(`/projects/${data.id}`);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors([]);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    const message = generateMessage();
    signMessage({ message });
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Connect Wallet</h1>
          <p className="text-gray-400">Please connect your wallet to create a project</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Create New Project</h1>
        <p className="text-gray-400 mb-8">Post your project and get matched with elite Web3 developers automatically</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Title */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Project Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="e.g., DeFi Dashboard Frontend"
              maxLength={200}
            />
            <p className="text-gray-400 text-sm mt-1">{formData.title.length}/200</p>
          </div>

          {/* Project Description */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Project Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
              placeholder="Describe what you need built, key features, and any specific requirements..."
            />
          </div>

          {/* Required Skills */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Required Skills *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    formData.requiredSkills.includes(skill)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-sm">Selected: {formData.requiredSkills.length}/10</p>
          </div>

          {/* Total Budget */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <label className="block text-white font-semibold mb-2">Total Budget (USDC) *</label>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2 text-xl">$</span>
              <input
                type="number"
                value={formData.totalBudget}
                onChange={(e) => setFormData({ ...formData, totalBudget: e.target.value })}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="5000"
                min="100"
                step="0.01"
              />
              <span className="text-gray-400 ml-2">USDC</span>
            </div>
            <p className="text-gray-400 text-sm mt-1">Minimum: 100 USDC</p>
          </div>

          {/* Milestones */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Project Milestones *</h2>
            <p className="text-gray-400 mb-6">Break your project into milestones with individual budgets and deliverables</p>

            <MilestoneManager
              milestones={milestones}
              onChange={setMilestones}
              totalBudget={parseFloat(formData.totalBudget) || 0}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500 rounded-xl p-4">
              <h3 className="text-red-400 font-semibold mb-2">Please fix the following errors:</h3>
              <ul className="list-disc list-inside text-red-400 text-sm space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold text-lg hover:shadow-lg disabled:opacity-50 transition-all"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating Project...' : 'Create Project & Find Developer'}
          </button>
        </form>
      </div>
    </div>
  );
}
