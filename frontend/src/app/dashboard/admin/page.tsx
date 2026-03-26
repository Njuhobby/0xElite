'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

interface StakedDeveloper {
  walletAddress: string;
  email: string;
  githubUsername: string | null;
  skills: string[];
  bio: string | null;
  hourlyRate: number | null;
  stakeAmount: string;
  stakedAt: string;
  status: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Active' },
  staked: { color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Staked' },
  pending: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Pending' },
  rejected: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Rejected' },
};

export default function AdminDashboardPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [developers, setDevelopers] = useState<StakedDeveloper[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const adminAddresses = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);

  const isAdmin = address && adminAddresses.includes(address.toLowerCase());

  const fetchDevelopers = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/developers?page=${page}&limit=20`
      );

      if (!response.ok) throw new Error('Failed to fetch developers');

      const data = await response.json();
      setDevelopers(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchDevelopers();
    } else {
      setLoading(false);
    }
  }, [isAdmin, fetchDevelopers]);

  const handleApprove = async (developerAddress: string) => {
    if (!address) return;
    setActionLoading(developerAddress);
    setError('');
    setSuccessMessage('');

    try {
      const message = `Approve developer ${developerAddress} for 0xElite`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/developers/${developerAddress}/approve`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, message, signature }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to approve developer');
      }

      setSuccessMessage(`Developer ${developerAddress.slice(0, 6)}...${developerAddress.slice(-4)} approved`);
      setDevelopers((prev) =>
        prev.map((d) =>
          d.walletAddress === developerAddress.toLowerCase() ? { ...d, status: 'active' } : d
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (developerAddress: string) => {
    if (!address) return;
    const reason = rejectReason[developerAddress]?.trim();
    if (!reason) {
      setError('Please provide a rejection reason');
      return;
    }

    setActionLoading(developerAddress);
    setError('');
    setSuccessMessage('');

    try {
      const message = `Reject developer ${developerAddress} for 0xElite`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/developers/${developerAddress}/reject`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, message, signature, reason }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to reject developer');
      }

      setSuccessMessage(`Developer ${developerAddress.slice(0, 6)}...${developerAddress.slice(-4)} rejected`);
      setDevelopers((prev) =>
        prev.map((d) =>
          d.walletAddress === developerAddress.toLowerCase() ? { ...d, status: 'rejected' } : d
        )
      );
      setShowRejectInput(null);
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[developerAddress];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  // Access denied for non-admin
  if (!isConnected || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 text-sm">
            {!isConnected
              ? 'Please connect your wallet to access the admin dashboard.'
              : 'Your wallet is not authorized as an admin.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Developer Applications</h1>
        <p className="text-gray-500 text-sm mt-1">Review and manage developer applications</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-600 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600">Loading applications...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && developers.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Developers</h2>
          <p className="text-gray-500 text-sm">No developer applications yet.</p>
        </div>
      )}

      {/* Developer Cards */}
      {!loading && developers.length > 0 && (
        <div className="space-y-3">
          {developers.map((dev) => (
            <div
              key={dev.walletAddress}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                {/* Developer Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {dev.walletAddress.slice(2, 4).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900">
                        {dev.githubUsername || `${dev.walletAddress.slice(0, 6)}...${dev.walletAddress.slice(-4)}`}
                      </h3>
                      <p className="text-gray-400 font-mono text-xs truncate">{dev.walletAddress}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[dev.status]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {statusConfig[dev.status]?.label || dev.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Email:</span>
                      <span className="text-gray-700">{dev.email}</span>
                    </div>
                    {dev.githubUsername && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">GitHub:</span>
                        <a
                          href={`https://github.com/${dev.githubUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-600 hover:text-violet-700 font-medium"
                        >
                          {dev.githubUsername}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Stake:</span>
                      <span className="text-gray-700 font-medium">{parseFloat(dev.stakeAmount).toFixed(2)} USDC</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Staked:</span>
                      <span className="text-gray-700">{new Date(dev.stakedAt).toLocaleDateString()}</span>
                    </div>
                    {dev.hourlyRate && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Rate:</span>
                        <span className="text-gray-700">${dev.hourlyRate}/hr</span>
                      </div>
                    )}
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {dev.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2 py-0.5 bg-violet-50 border border-violet-200 rounded text-violet-700 text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Bio */}
                  {dev.bio && (
                    <p className="text-gray-500 text-sm">{dev.bio}</p>
                  )}
                </div>

                {/* Actions — only for staked developers */}
                {dev.status === 'staked' && (
                  <div className="flex flex-col gap-2 lg:min-w-[180px]">
                    <button
                      onClick={() => handleApprove(dev.walletAddress)}
                      disabled={actionLoading === dev.walletAddress}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-colors"
                    >
                      {actionLoading === dev.walletAddress ? 'Processing...' : 'Approve'}
                    </button>

                    {showRejectInput === dev.walletAddress ? (
                      <div className="space-y-2">
                        <textarea
                          value={rejectReason[dev.walletAddress] || ''}
                          onChange={(e) =>
                            setRejectReason((prev) => ({ ...prev, [dev.walletAddress]: e.target.value }))
                          }
                          placeholder="Rejection reason (required)"
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReject(dev.walletAddress)}
                            disabled={actionLoading === dev.walletAddress}
                            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-white text-xs font-semibold transition-colors"
                          >
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => setShowRejectInput(null)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRejectInput(dev.walletAddress)}
                        disabled={actionLoading === dev.walletAddress}
                        className="px-4 py-2 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 rounded-lg text-red-600 text-sm font-semibold transition-colors"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => fetchDevelopers(page)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === pagination.page
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
