'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';

interface ClientProfile {
  walletAddress: string;
  email?: string;
  companyName: string | null;
  description: string | null;
  website: string | null;
}

interface Props {
  client: ClientProfile;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditClientProfileModal({ client, onClose, onSuccess }: Props) {
  const { signMessageAsync } = useSignMessage();
  const [formData, setFormData] = useState({
    email: client.email || '',
    companyName: client.companyName || '',
    description: client.description || '',
    website: client.website || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.companyName) {
      setError('Email and company name are required');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const message = `Update client profile on 0xElite\n\nWallet: ${client.walletAddress}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/clients`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: client.walletAddress,
            message,
            signature,
            email: formData.email,
            companyName: formData.companyName,
            description: formData.description || undefined,
            website: formData.website || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update profile');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a0a2e] rounded-2xl border border-white/10 p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isSubmitting}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-white font-semibold mb-2">Company Name *</label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 h-32 resize-none"
              maxLength={500}
            />
            <p className="text-gray-400 text-sm mt-1">{formData.description.length}/500</p>
          </div>

          <div>
            <label className="block text-white font-semibold mb-2">Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="https://yourcompany.com"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

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
