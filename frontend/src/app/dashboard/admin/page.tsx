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
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] flex items-center justify-center">
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 max-w-md text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-400">
            {!isConnected
              ? 'Please connect your wallet to access the admin dashboard.'
              : 'Your wallet is not authorized as an admin.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A1B] via-[#1a0a2e] to-[#0A0A1B] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-gray-300">Review and manage developer applications</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-600/10 border border-red-500/30 rounded-xl">
            <p className="text-red-400">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-600/10 border border-green-500/30 rounded-xl">
            <p className="text-green-400">{successMessage}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <div className="text-white text-xl">Loading applications...</div>
          </div>
        )}

        {/* Empty State */}
        {!loading && developers.length === 0 && (
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
            <h2 className="text-xl font-semibold text-white mb-2">No Developers</h2>
            <p className="text-gray-400">No developer applications yet.</p>
          </div>
        )}

        {/* Developer Cards */}
        {!loading && developers.length > 0 && (
          <div className="space-y-4">
            {developers.map((dev) => (
              <div
                key={dev.walletAddress}
                className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  {/* Developer Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold">
                        {dev.walletAddress.slice(2, 4).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {dev.githubUsername || `${dev.walletAddress.slice(0, 6)}...${dev.walletAddress.slice(-4)}`}
                        </h3>
                        <p className="text-gray-400 font-mono text-xs">{dev.walletAddress}</p>
                      </div>
                      <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${
                        dev.status === 'active' ? 'bg-green-600/20 border border-green-500/30 text-green-300' :
                        dev.status === 'staked' ? 'bg-yellow-600/20 border border-yellow-500/30 text-yellow-300' :
                        dev.status === 'pending' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300' :
                        dev.status === 'rejected' ? 'bg-red-600/20 border border-red-500/30 text-red-300' :
                        'bg-gray-600/20 border border-gray-500/30 text-gray-300'
                      }`}>
                        {dev.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-400">Email: </span>
                        <span className="text-white">{dev.email}</span>
                      </div>
                      {dev.githubUsername && (
                        <div>
                          <span className="text-gray-400">GitHub: </span>
                          <a
                            href={`https://github.com/${dev.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300"
                          >
                            {dev.githubUsername}
                          </a>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">Stake: </span>
                        <span className="text-white">{parseFloat(dev.stakeAmount).toFixed(2)} USDC</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Staked: </span>
                        <span className="text-white">{new Date(dev.stakedAt).toLocaleDateString()}</span>
                      </div>
                      {dev.hourlyRate && (
                        <div>
                          <span className="text-gray-400">Rate: </span>
                          <span className="text-white">${dev.hourlyRate}/hr</span>
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {dev.skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-1 bg-purple-600/20 border border-purple-500/30 rounded text-purple-300 text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Bio */}
                    {dev.bio && (
                      <p className="mt-3 text-gray-300 text-sm">{dev.bio}</p>
                    )}
                  </div>

                  {/* Actions — only for staked developers */}
                  {dev.status === 'staked' && (
                    <div className="flex flex-col gap-2 lg:min-w-[200px]">
                      <button
                        onClick={() => handleApprove(dev.walletAddress)}
                        disabled={actionLoading === dev.walletAddress}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-white font-semibold transition-colors"
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
                            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(dev.walletAddress)}
                              disabled={actionLoading === dev.walletAddress}
                              className="flex-1 px-3 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg text-white text-sm font-semibold transition-colors"
                            >
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => setShowRejectInput(null)}
                              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowRejectInput(dev.walletAddress)}
                          disabled={actionLoading === dev.walletAddress}
                          className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg text-white font-semibold transition-colors"
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
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => fetchDevelopers(page)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  page === pagination.page
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
