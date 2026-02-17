'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import EditClientProfileModal from '@/components/client/EditClientProfileModal';
import ReviewList from '@/components/reviews/ReviewList';

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
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  // Registration form for unregistered clients
  if (!isRegistered) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to 0xElite</h1>
          <p className="text-gray-300">Complete your registration to start posting projects</p>
        </div>

        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 max-w-xl">
          <h2 className="text-xl font-semibold text-white mb-6">Client Registration</h2>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-white font-semibold mb-2">Company Name *</label>
              <input
                type="text"
                value={regForm.companyName}
                onChange={(e) => setRegForm({ ...regForm, companyName: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Your company or organization"
                required
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">Email *</label>
              <input
                type="email"
                value={regForm.email}
                onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="contact@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Description <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <textarea
                value={regForm.description}
                onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-24 resize-none"
                placeholder="Brief description of your company"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Website <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={regForm.website}
                onChange={(e) => setRegForm({ ...regForm, website: e.target.value })}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="https://yourcompany.com"
              />
            </div>

            {regError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{regError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={registering}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Profile</h1>
        <p className="text-gray-300">Manage your client profile</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white text-2xl font-bold mr-4">
              {(client?.companyName || client?.walletAddress || '??').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {client?.companyName || `${client?.walletAddress.slice(0, 6)}...${client?.walletAddress.slice(-4)}`}
              </h2>
              <p className="text-gray-400 font-mono text-sm">{client?.walletAddress}</p>
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
        {client?.email && (
          <div className="mb-4 p-4 bg-purple-600/10 border border-purple-500/30 rounded-lg">
            <p className="text-gray-400 text-sm">Email (Private)</p>
            <p className="text-white">{client.email}</p>
          </div>
        )}

        {/* Description */}
        {client?.description && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-2">About</h3>
            <p className="text-gray-300">{client.description}</p>
          </div>
        )}

        {/* Website */}
        {client?.website && (
          <div>
            <h3 className="text-white font-semibold mb-2">Website</h3>
            <a
              href={client.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 flex items-center"
            >
              {client.website}
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Projects Created</p>
          <p className="text-2xl font-bold text-white">{client?.projectsCreated || 0}</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Projects Completed</p>
          <p className="text-2xl font-bold text-white">{client?.projectsCompleted || 0}</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-white">{parseFloat(client?.totalSpent || '0').toFixed(2)} USDC</p>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <p className="text-gray-400 text-sm mb-1">Member Since</p>
          <p className="text-2xl font-bold text-white">{client?.createdAt ? new Date(client.createdAt).toLocaleDateString() : '-'}</p>
        </div>
      </div>

      {/* Reviews Section */}
      {address && (
        <div className="mt-6">
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
