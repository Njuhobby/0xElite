'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import DashboardShell, { Icons } from '@/components/dashboard/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Role = 'developer' | 'client';

// /disputes lives outside both dashboard role trees because the dispute view
// is shared between the two parties + xELITE-holding voters. We still want
// the sidebar so users don't lose their bearings, so this layout figures out
// which role profile the wallet has and renders the matching shell.
//
// "Both" wallets prefer the role of the most-recently-visited dashboard,
// remembered via sessionStorage (`lastDashboardRole`, set by each role's
// layout). Falls back to developer since dispute participation is mostly a
// DAO concern.
export default function DisputesLayout({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [role, setRole] = useState<Role | 'loading' | 'unknown'>('loading');

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [devRes, clientRes] = await Promise.all([
          fetch(`${API_URL}/api/developers/${address}`),
          fetch(`${API_URL}/api/clients/${address}`, { headers: { 'x-wallet-address': address } }),
        ]);
        const hasDev = devRes.ok;
        const hasClient = clientRes.ok;

        if (cancelled) return;
        if (hasDev && hasClient) {
          const last = typeof window !== 'undefined' ? sessionStorage.getItem('lastDashboardRole') : null;
          setRole(last === 'client' ? 'client' : 'developer');
        } else if (hasDev) {
          setRole('developer');
        } else if (hasClient) {
          setRole('client');
        } else {
          setRole('unknown');
        }
      } catch {
        if (!cancelled) setRole('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, router]);

  if (role === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600 text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  if (role === 'unknown') {
    // Wallet has neither profile — let the page render bare; user can still
    // back out via the Home link inside the page.
    return <>{children}</>;
  }

  const navItems =
    role === 'developer'
      ? [
          { name: 'Profile', href: '/dashboard/developer', icon: Icons.profile },
          { name: 'Projects', href: '/dashboard/developer/projects', icon: Icons.projects },
          { name: 'Disputes', href: '/disputes', icon: Icons.disputes },
          { name: 'Settings', href: '/dashboard/developer/settings', icon: Icons.settings },
        ]
      : [
          { name: 'Profile', href: '/dashboard/client', icon: Icons.profile },
          { name: 'Projects', href: '/dashboard/client/projects', icon: Icons.projects },
          { name: 'Disputes', href: '/disputes', icon: Icons.disputes },
          { name: 'Settings', href: '/dashboard/client/settings', icon: Icons.settings },
        ];

  const switchRole =
    role === 'developer'
      ? { label: 'Client Dashboard', href: '/dashboard/client', icon: Icons.client }
      : { label: 'Developer Dashboard', href: '/dashboard/developer', icon: Icons.developers };

  return (
    <DashboardShell role={role} navItems={navItems} switchRole={switchRole}>
      {children}
    </DashboardShell>
  );
}
