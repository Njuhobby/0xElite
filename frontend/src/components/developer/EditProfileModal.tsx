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

  const { signMessage } = useSignMessage({
    onSuccess: async (signature) => {
      await submitUpdate(signature);
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });

  const generateMessage = () => {
    const timestamp = Date.now();
    return `Update profile for 0xElite

Wallet: ${developer.walletAddress}
Timestamp: ${timestamp}`;
  };

  const submitUpdate = async (signature: string) => {
    try {
      const message = generateMessage();
      const updates: any = {
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const message = generateMessage();
    signMessage({ message });
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a0a2e] rounded-2xl border border-white/10 p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            disabled={isSubmitting}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div>
            <label className="block text-white font-semibold mb-2">Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-white font-semibold mb-2">Skills</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {AVAILABLE_SKILLS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    formData.skills.includes(skill)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-gray-400 text-sm">Selected: {formData.skills.length}/10</p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-white font-semibold mb-2">Bio</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
              maxLength={500}
            />
            <p className="text-gray-400 text-sm mt-1">{formData.bio.length}/500</p>
          </div>

          {/* Hourly Rate */}
          <div>
            <label className="block text-white font-semibold mb-2">Hourly Rate (USD)</label>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2">$</span>
              <input
                type="number"
                value={formData.hourlyRate}
                onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                min="0"
              />
              <span className="text-gray-400 ml-2">/hour</span>
            </div>
          </div>

          {/* Availability */}
          <div>
            <label className="block text-white font-semibold mb-2">Availability</label>
            <div className="flex gap-3">
              {(['available', 'busy', 'vacation'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFormData({ ...formData, availability: status })}
                  className={`px-6 py-3 rounded-lg font-semibold capitalize ${
                    formData.availability === status
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/10 rounded-lg text-white font-semibold hover:bg-white/20"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold hover:shadow-lg disabled:opacity-50"
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
