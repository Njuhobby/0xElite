'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import EditProfileModal from '@/components/developer/EditProfileModal';

interface Developer {
  walletAddress: string;
  email?: string;
  githubUsername: string | null;
  skills: string[];
  bio: string | null;
  hourlyRate: number | null;
  availability: 'available' | 'busy' | 'vacation';
  stakeAmount: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: string;
  updatedAt?: string;
}

export default function DeveloperDashboardPage() {
  const { address } = useAccount();
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (address) {
      fetchDeveloper();
    }
  }, [address]);

  const fetchDeveloper = async () => {
    if (!address) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers/${address}`
      );

      if (!response.ok) {
        throw new Error('Developer not found');
      }

      const data = await response.json();
      setDeveloper(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  if (error || !developer) {
    return (
      <div className="text-center py-20">
        <h1 className="text-3xl font-bold text-white mb-4">Error Loading Profile</h1>
        <p className="text-gray-400">{error || 'Failed to load your profile'}</p>
      </div>
    );
  }

  const availabilityColors = {
    available: 'bg-green-500',
    busy: 'bg-yellow-500',
    vacation: 'bg-gray-500',
  };

  const statusColors = {
    pending: 'bg-yellow-500',
    active: 'bg-green-500',
    suspended: 'bg-red-500',
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Profile</h1>
        <p className="text-gray-300">Manage your developer profile and settings</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-2xl font-bold mr-4">
              {developer.walletAddress.slice(2, 4).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {developer.githubUsername || `${developer.walletAddress.slice(0, 6)}...${developer.walletAddress.slice(-4)}`}
              </h2>
              <p className="text-gray-400 font-mono text-sm">{developer.walletAddress}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${statusColors[developer.status]}`}>
                  {developer.status}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${availabilityColors[developer.availability]}`}>
                  {developer.availability}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-purple-600 rounded-lg text-white font-semibold hover:bg-purple-700 transition-colors"
          >
            Edit Profile
          </button>
        </div>

        {/* Email */}
        {developer.email && (
          <div className="mb-4 p-4 bg-purple-600/10 border border-purple-500/30 rounded-lg">
            <p className="text-gray-400 text-sm">Email (Private)</p>
            <p className="text-white">{developer.email}</p>
          </div>
        )}

        {/* Bio */}
        {developer.bio && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-2">About</h3>
            <p className="text-gray-300">{developer.bio}</p>
          </div>
        )}

        {/* Skills */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {developer.skills.map((skill) => (
              <span
                key={skill}
                className="px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-300 font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Hourly Rate */}
        {developer.hourlyRate && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-2">Hourly Rate</h3>
            <p className="text-2xl font-bold text-white">${developer.hourlyRate}/hour</p>
          </div>
        )}

        {/* GitHub */}
        {developer.githubUsername && (
          <div>
            <h3 className="text-white font-semibold mb-2">GitHub</h3>
            <a
              href={`https://github.com/${developer.githubUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 flex items-center"
            >
              github.com/{developer.githubUsername}
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Stake Amount</p>
          <p className="text-2xl font-bold text-white">{parseFloat(developer.stakeAmount).toFixed(2)} USDC</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Projects Completed</p>
          <p className="text-2xl font-bold text-white">0</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Member Since</p>
          <p className="text-2xl font-bold text-white">{new Date(developer.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditProfileModal
          developer={developer}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchDeveloper();
          }}
        />
      )}
    </div>
  );
}
