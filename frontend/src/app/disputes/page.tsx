'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DisputeCard from '@/components/disputes/DisputeCard';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  useEffect(() => {
    fetchDisputes();
  }, [filter]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const endpoint =
        filter === 'active'
          ? `${baseUrl}/api/disputes/active/list?limit=50`
          : `${baseUrl}/api/disputes/active/list?limit=50`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch disputes');
      const data = await response.json();
      setDisputes(data.disputes || []);
    } catch (err) {
      console.error('Error fetching disputes:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A1B] text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a0a2e] to-[#0A0A1B] border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-gray-400 text-sm hover:text-white mb-2 block">
                ← Back to Home
              </Link>
              <h1 className="text-3xl font-bold">DAO Arbitration</h1>
              <p className="text-gray-400 mt-1">
                Community-governed dispute resolution for 0xElite projects
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mt-6">
            {(['all', 'active', 'resolved'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading disputes...</div>
        ) : disputes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">⚖️</div>
            <h2 className="text-xl font-semibold text-gray-300">No disputes found</h2>
            <p className="text-gray-500 mt-2">
              When disputes are filed, they will appear here for community voting.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {disputes
              .filter((d) => {
                if (filter === 'active') return d.status !== 'resolved';
                if (filter === 'resolved') return d.status === 'resolved';
                return true;
              })
              .map((dispute) => (
                <DisputeCard key={dispute.id} dispute={dispute} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
