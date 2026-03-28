'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import EditClientProfileModal from '@/components/client/EditClientProfileModal';
import ReviewList from '@/components/reviews/ReviewList';
import { useClientStatus } from './ClientContext';

interface ClientProfile {
  walletAddress: string;
  email?: string;
  companyName: string | null;
  description: string | null;
  website: string | null;
  isRegistered: boolean;
  projectsCreated: number;
  projectsCompleted: number;
  totalSpent: string;
  reputationScore: number | null;
  createdAt: string;
}

export default function ClientDashboardPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { setClientStatus } = useClientStatus();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Registration form state
  const [regForm, setRegForm] = useState({ email: '', companyName: '', description: '', website: '' });
  const [regError, setRegError] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (address) {
      fetchClient();
    }
  }, [address]);

  const fetchClient = async () => {
    if (!address) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/clients/${address}`,
        { headers: { 'x-wallet-address': address } }
      );

      if (!response.ok) {
        setIsRegistered(false);
        setClient(null);
        return;
      }

      const data: ClientProfile = await response.json();
      setClient(data);
      setIsRegistered(data.isRegistered);
    } catch {
      setIsRegistered(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    if (!regForm.email || !regForm.companyName) {
      setRegError('Email and company name are required');
      return;
    }

    setRegistering(true);
    setRegError('');

    try {
      const message = `Register as client on 0xElite\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/clients`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            message,
            signature,
            email: regForm.email,
            companyName: regForm.companyName,
            description: regForm.description || undefined,
            website: regForm.website || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Registration failed');
      }

      await fetchClient();
      setClientStatus('registered');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
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

  // Registration form for unregistered clients
  if (!isRegistered) {
    return (
      <div className="max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to 0xElite</h1>
          <p className="text-gray-500 text-sm mt-1">Complete your registration to start posting projects</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Client Registration</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name *</label>
              <input
                type="text"
                value={regForm.companyName}
                onChange={(e) => setRegForm({ ...regForm, companyName: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                placeholder="Your company or organization"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
              <input
                type="email"
                value={regForm.email}
                onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                placeholder="contact@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={regForm.description}
                onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 h-24 resize-none"
                placeholder="Brief description of your company"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Website <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={regForm.website}
                onChange={(e) => setRegForm({ ...regForm, website: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                placeholder="https://yourcompany.com"
              />
            </div>

            {regError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{regError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={registering}
              className="w-full py-3 bg-violet-600 rounded-xl text-white font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registering ? 'Registering...' : 'Register as Client'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Registered client profile view
  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your client profile</p>
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="px-4 py-2 bg-violet-600 rounded-lg text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
        >
          Edit Profile
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {(client?.companyName || client?.walletAddress || '??').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">
              {client?.companyName || `${client?.walletAddress.slice(0, 6)}...${client?.walletAddress.slice(-4)}`}
            </h2>
            <p className="text-gray-400 font-mono text-sm mt-0.5">{client?.walletAddress}</p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {client?.email && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email (Private)</p>
              <p className="text-gray-900 text-sm">{client.email}</p>
            </div>
          )}

          {client?.website && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Website</p>
              <a
                href={client.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:text-violet-700 text-sm font-medium inline-flex items-center gap-1"
              >
                {client.website}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>

        {client?.description && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">About</p>
            <p className="text-gray-600 text-sm leading-relaxed">{client.description}</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Projects Created</p>
          <p className="text-2xl font-bold text-gray-900">{client?.projectsCreated || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Completed</p>
          <p className="text-2xl font-bold text-gray-900">{client?.projectsCompleted || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-gray-900">{parseFloat(client?.totalSpent || '0').toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Member Since</p>
          <p className="text-2xl font-bold text-gray-900">{client?.createdAt ? new Date(client.createdAt).toLocaleDateString() : '-'}</p>
        </div>
      </div>

      {/* Reviews Section */}
      {address && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <ReviewList address={address} type="client" />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && client && (
        <EditClientProfileModal
          client={client}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchClient();
          }}
        />
      )}
    </div>
  );
}
