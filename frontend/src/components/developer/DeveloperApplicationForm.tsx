'use client';

import { useState } from 'react';

interface FormData {
  email: string;
  githubUsername: string;
  skills: string[];
  bio: string;
  hourlyRate: string;
}

const AVAILABLE_SKILLS = [
  'Solidity', 'Rust', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js',
  'Go', 'Python', 'DeFi', 'NFT', 'ZK-Proofs', 'Smart Contracts', 'Web3.js',
  'Ethers.js', 'Hardhat', 'Foundry', 'Subgraph', 'IPFS', 'Backend', 'Frontend'
];

interface Props {
  address: string;
  onSubmit: (data: FormData) => void;
}

export default function DeveloperApplicationForm({ address, onSubmit }: Props) {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    githubUsername: '',
    skills: [],
    bio: '',
    hourlyRate: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    // Skills validation
    if (formData.skills.length === 0) {
      newErrors.skills = 'Please select at least 1 skill';
    } else if (formData.skills.length > 10) {
      newErrors.skills = 'Please select no more than 10 skills';
    }

    // Bio validation
    if (formData.bio && formData.bio.length > 500) {
      newErrors.bio = 'Bio must be 500 characters or less';
    }

    // Hourly rate validation
    if (formData.hourlyRate && (isNaN(Number(formData.hourlyRate)) || Number(formData.hourlyRate) <= 0)) {
      newErrors.hourlyRate = 'Hourly rate must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email */}
      <div>
        <label className="block text-white font-semibold mb-2">
          Email Address <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
          placeholder="developer@example.com"
        />
        {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email}</p>}
      </div>

      {/* GitHub Username */}
      <div>
        <label className="block text-white font-semibold mb-2">
          GitHub Username <span className="text-gray-400 text-sm">(Optional)</span>
        </label>
        <div className="flex items-center">
          <span className="text-gray-400 mr-2">github.com/</span>
          <input
            type="text"
            value={formData.githubUsername}
            onChange={(e) => setFormData({ ...formData, githubUsername: e.target.value })}
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            placeholder="your-username"
          />
        </div>
        <p className="text-gray-400 text-sm mt-1">Cannot be changed after registration</p>
      </div>

      {/* Skills */}
      <div>
        <label className="block text-white font-semibold mb-2">
          Skills <span className="text-red-400">*</span>
        </label>
        <p className="text-gray-400 text-sm mb-3">Select 1-10 skills</p>
        <div className="flex flex-wrap gap-2">
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
        <p className="text-gray-300 text-sm mt-2">Selected: {formData.skills.length}/10</p>
        {errors.skills && <p className="text-red-400 text-sm mt-1">{errors.skills}</p>}
      </div>

      {/* Bio */}
      <div>
        <label className="block text-white font-semibold mb-2">
          Bio <span className="text-gray-400 text-sm">(Optional)</span>
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
          placeholder="Tell us about your experience and what you're passionate about..."
          maxLength={500}
        />
        <p className="text-gray-400 text-sm mt-1">{formData.bio.length}/500 characters</p>
        {errors.bio && <p className="text-red-400 text-sm mt-1">{errors.bio}</p>}
      </div>

      {/* Hourly Rate */}
      <div>
        <label className="block text-white font-semibold mb-2">
          Hourly Rate (USD) <span className="text-gray-400 text-sm">(Optional)</span>
        </label>
        <div className="flex items-center">
          <span className="text-gray-400 mr-2">$</span>
          <input
            type="number"
            value={formData.hourlyRate}
            onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
            className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            placeholder="120"
            min="0"
          />
          <span className="text-gray-400 ml-2">/hour</span>
        </div>
      </div>

      {/* Wallet Address Display */}
      <div>
        <label className="block text-white font-semibold mb-2">Wallet Address</label>
        <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 font-mono text-sm">
          {address}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold text-lg hover:shadow-lg hover:shadow-purple-500/50 transition-all"
      >
        Continue to Staking →
      </button>
    </form>
  );
}
