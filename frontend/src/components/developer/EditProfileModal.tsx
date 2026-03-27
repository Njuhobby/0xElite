'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';

interface Developer {
  walletAddress: string;
  email?: string;
  skills: string[];
  bio: string | null;
  hourlyRate: number | null;
  availability: 'available' | 'busy' | 'vacation';
}

interface Props {
  developer: Developer;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_SKILLS = [
  'Solidity', 'Rust', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'Go', 'Python', 'DeFi', 'NFT', 'ZK-Proofs', 'Smart Contracts', 'Web3.js',
  'Ethers.js', 'Hardhat', 'Foundry', 'Subgraph', 'IPFS', 'Backend', 'Frontend'
];

export default function EditProfileModal({ developer, onClose, onSuccess }: Props) {
  const [formData, setFormData] = useState({
    email: developer.email || '',
    skills: developer.skills || [],
    bio: developer.bio || '',
    hourlyRate: developer.hourlyRate?.toString() || '',
    availability: developer.availability,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { signMessageAsync } = useSignMessage();

  const generateMessage = () => {
    const timestamp = Date.now();
    return `Update profile for 0xElite

Wallet: ${developer.walletAddress}
Timestamp: ${timestamp}`;
  };

  const submitUpdate = async (signature: string) => {
    try {
      const message = generateMessage();
      const updates: Record<string, unknown> = {
        address: developer.walletAddress,
        message,
        signature,
      };

      if (formData.email !== developer.email) updates.email = formData.email;
      if (JSON.stringify(formData.skills) !== JSON.stringify(developer.skills)) updates.skills = formData.skills;
      if (formData.bio !== developer.bio) updates.bio = formData.bio || null;
      if (formData.hourlyRate !== developer.hourlyRate?.toString()) {
        updates.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : null;
      }
      if (formData.availability !== developer.availability) updates.availability = formData.availability;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers/${developer.walletAddress}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const message = generateMessage();
      const signature = await signMessageAsync({ message });
      await submitUpdate(signature);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign message');
      setIsSubmitting(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Skills</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    formData.skills.includes(skill)
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-xs">Selected: {formData.skills.length}/10</p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-28 resize-none"
              maxLength={500}
            />
            <p className="text-gray-400 text-xs mt-1">{formData.bio.length}/500</p>
          </div>

          {/* Hourly Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate (USD)</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number"
                value={formData.hourlyRate}
                onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                min="0"
              />
              <span className="text-gray-400 text-sm">/hour</span>
            </div>
          </div>

          {/* Availability */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Availability</label>
            <div className="flex gap-2">
              {(['available', 'busy', 'vacation'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFormData({ ...formData, availability: status })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    formData.availability === status
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
