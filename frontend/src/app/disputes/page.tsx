'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useReadContract } from 'wagmi';
import DisputeCard from '@/components/disputes/DisputeCard';
import { ELITE_TOKEN_ABI, getEliteTokenAddress } from '@/config/contracts';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Tab = 'mine' | 'votable';

interface Roles {
  isClient: boolean;
  isDeveloper: boolean;
}

export default function DisputesPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [roles, setRoles] = useState<Roles | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [tab, setTab] = useState<Tab>('mine');
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Read current xELITE balance for the voting-power widget. Per-dispute
  // weight (snapshot) is computed inside VotePanel on the detail page.
  const { data: xEliteBalance } = useReadContract({
    address: getEliteTokenAddress(),
    abi: ELITE_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!roles?.isDeveloper },
  });

  // Wallet gate: kick to home if not connected.
  useEffect(() => {
    if (!isConnected || !address) {
      router.replace('/');
    }
  }, [isConnected, address, router]);

  // Role gate: load client/developer status, kick to home if neither.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      setCheckingRole(true);
      try {
        const [devRes, clientRes] = await Promise.all([
          fetch(`${baseUrl}/api/developers/${address}`),
          fetch(`${baseUrl}/api/clients/${address}`, {
            headers: { 'x-wallet-address': address },
          }),
        ]);

        let isDeveloper = false;
        if (devRes.ok) {
          const dev = await devRes.json();
          // 'created' = saved profile but not staked yet — not yet a real developer
          isDeveloper = dev.status && dev.status !== 'created';
        }

        let isClient = false;
        if (clientRes.ok) {
          const client = await clientRes.json();
          isClient = !!client.isRegistered;
        }

        if (cancelled) return;

        if (!isDeveloper && !isClient) {
          router.replace('/');
          return;
        }
        setRoles({ isClient, isDeveloper });
        // Default tab depends on what the user can see.
        setTab(isDeveloper ? 'mine' : 'mine');
      } catch {
        if (!cancelled) router.replace('/');
      } finally {
        if (!cancelled) setCheckingRole(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, router]);

  const fetchDisputes = useCallback(
    async (which: Tab) => {
      if (!address) return;
      setLoading(true);
      try {
        const path =
          which === 'mine'
            ? `/api/disputes/my/${address}`
            : `/api/disputes/votable/${address}`;
        const res = await fetch(`${baseUrl}${path}?limit=50`);
        if (!res.ok) throw new Error('Failed to load disputes');
        const data = await res.json();
        setDisputes(data.disputes || []);
      } catch {
        setDisputes([]);
      } finally {
        setLoading(false);
      }
    },
    [address]
  );

  useEffect(() => {
    if (!roles) return;
    fetchDisputes(tab);
  }, [tab, roles, fetchDisputes]);

  if (checkingRole || !roles) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  const showTabs = roles.isDeveloper; // Clients only see "My Disputes"
  const xEliteDisplay =
    xEliteBalance != null ? (Number(xEliteBalance as bigint) / 1e6).toFixed(2) : null;
  const hasVotingPower = xEliteBalance != null && (xEliteBalance as bigint) > BigInt(0);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link href="/" className="text-gray-500 text-sm hover:text-gray-900 mb-2 block">
            ← Back to Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {roles.isDeveloper && roles.isClient
              ? 'Disputes you are a party to and ones you can vote on.'
              : roles.isDeveloper
                ? 'Disputes from your assigned projects and ones open for community voting.'
                : 'Disputes from your projects.'}
          </p>

          {/* Voting power widget — only for developers with xELITE */}
          {roles.isDeveloper && hasVotingPower && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                xE
              </div>
              <div>
                <p className="text-xs text-violet-700">Your voting power</p>
                <p className="text-sm font-semibold text-gray-900">
                  {xEliteDisplay} xELITE
                  <span className="ml-2 text-xs font-normal text-gray-500">(current balance)</span>
                </p>
              </div>
            </div>
          )}

          {/* Tabs — only when there's more than one view */}
          {showTabs && (
            <div className="mt-6 flex gap-2">
              <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
                My Disputes
              </TabButton>
              <TabButton active={tab === 'votable'} onClick={() => setTab('votable')}>
                Votable
              </TabButton>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600">Loading disputes...</span>
            </div>
          </div>
        ) : disputes.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="grid gap-3">
            {disputes.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        {tab === 'mine' ? 'No disputes' : 'Nothing to vote on right now'}
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        {tab === 'mine'
          ? "You're not a party to any disputes."
          : "There are no disputes in voting phase that you can vote on."}
      </p>
    </div>
  );
}
