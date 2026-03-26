'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import EditProfileModal from '@/components/developer/EditProfileModal';
import ReviewList from '@/components/reviews/ReviewList';

interface Developer {
  walletAddress: string;
  email?: string;
  githubUsername: string | null;
  skills: string[];
  bio: string | null;
  hourlyRate: number | null;
  availability: 'available' | 'busy' | 'vacation';
  stakeAmount: string;
  status: 'pending' | 'staked' | 'active' | 'rejected' | 'suspended';
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error || !developer) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Profile</h1>
        <p className="text-gray-500">{error || 'Failed to load your profile'}</p>
      </div>
    );
  }

  const availabilityConfig = {
    available: { color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
    busy: { color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    vacation: { color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  };

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending' },
    staked: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Staked' },
    active: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Active' },
    rejected: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Rejected' },
    suspended: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Suspended' },
  };

  return (
    <div className="max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your developer profile and settings</p>
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="px-4 py-2 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          Edit Profile
        </button>
      </div>

      {/* Status Messages */}
      {developer.status === 'staked' && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-blue-800 font-semibold text-sm">Application Under Review</h3>
            <p className="text-blue-600 text-sm mt-0.5">
              Your stake has been received. An admin will review your application shortly.
            </p>
          </div>
        </div>
      )}

      {developer.status === 'rejected' && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <h3 className="text-red-800 font-semibold text-sm">Application Rejected</h3>
            <p className="text-red-600 text-sm mt-0.5">
              Your application was not approved. You may unstake your USDC to recover your funds.
            </p>
          </div>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {developer.walletAddress.slice(2, 4).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">
              {developer.githubUsername || `${developer.walletAddress.slice(0, 6)}...${developer.walletAddress.slice(-4)}`}
            </h2>
            <p className="text-gray-400 font-mono text-sm mt-0.5">{developer.walletAddress}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[developer.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {statusConfig[developer.status]?.label || developer.status}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${availabilityConfig[developer.availability]?.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${availabilityConfig[developer.availability]?.dot}`} />
                {developer.availability}
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {developer.email && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email (Private)</p>
              <p className="text-gray-900 text-sm">{developer.email}</p>
            </div>
          )}

          {developer.hourlyRate && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Hourly Rate</p>
              <p className="text-gray-900 text-sm font-semibold">${developer.hourlyRate}/hour</p>
            </div>
          )}

          {developer.githubUsername && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">GitHub</p>
              <a
                href={`https://github.com/${developer.githubUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:text-violet-700 text-sm font-medium inline-flex items-center gap-1"
              >
                {developer.githubUsername}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>

        {/* Bio */}
        {developer.bio && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">About</p>
            <p className="text-gray-600 text-sm leading-relaxed">{developer.bio}</p>
          </div>
        )}

        {/* Skills */}
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Skills</p>
          <div className="flex flex-wrap gap-2">
            {developer.skills.map((skill) => (
              <span
                key={skill}
                className="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-violet-700 text-sm font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Stake Amount</p>
          <p className="text-2xl font-bold text-gray-900">{parseFloat(developer.stakeAmount).toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Projects Completed</p>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Member Since</p>
          <p className="text-2xl font-bold text-gray-900">{new Date(developer.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Reviews Section */}
      {address && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <ReviewList address={address} type="developer" />
        </div>
      )}

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
