'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import DashboardShell, { Icons } from '@/components/dashboard/DashboardShell';
import { ClientContext } from './ClientContext';

interface ClientData {
  walletAddress: string;
  isRegistered: boolean;
  companyName: string | null;
  email: string | null;
}

export default function ClientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [clientStatus, setClientStatus] = useState<'loading' | 'registered' | 'unregistered'>('loading');

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    const checkClientStatus = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/clients/${address}`,
          { headers: { 'x-wallet-address': address } }
        );

        if (!response.ok) {
          setClientStatus('unregistered');
          return;
        }

        const data: ClientData = await response.json();
        setClientStatus(data.isRegistered ? 'registered' : 'unregistered');
      } catch {
        setClientStatus('unregistered');
      }
    };

    checkClientStatus();
  }, [address, isConnected, router]);

  if (clientStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600 text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  const navItems = clientStatus === 'registered'
    ? [
        { name: 'Profile', href: '/dashboard/client', icon: Icons.profile },
        { name: 'Projects', href: '/dashboard/client/projects', icon: Icons.projects },
        { name: 'Disputes', href: '/disputes', icon: Icons.disputes },
        { name: 'Settings', href: '/dashboard/client/settings', icon: Icons.settings },
      ]
    : [
        { name: 'Profile', href: '/dashboard/client', icon: Icons.profile },
      ];

  return (
    <ClientContext.Provider value={{ clientStatus, setClientStatus }}>
      <DashboardShell
        role="client"
        navItems={navItems}
        switchRole={{ label: 'Developer Dashboard', href: '/dashboard/developer', icon: Icons.developers }}
      >
        {children}
      </DashboardShell>
    </ClientContext.Provider>
  );
}
