'use client';

import { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardShell, { Icons } from '@/components/dashboard/DashboardShell';

export default function DeveloperDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const [developerStatus, setDeveloperStatus] = useState<'loading' | 'active' | 'staked' | 'rejected' | 'pending' | 'unauthorized'>('loading');

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    const checkDeveloperStatus = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/developers/${address}`
        );

        if (!response.ok) {
          setDeveloperStatus('unauthorized');
          return;
        }

        const data = await response.json();

        if (data.status === 'active' || data.status === 'staked' || data.status === 'rejected') {
          setDeveloperStatus(data.status);
        } else if (data.status === 'pending') {
          setDeveloperStatus('pending');
        } else {
          setDeveloperStatus('unauthorized');
        }
      } catch (error) {
        console.error('Failed to check developer status:', error);
        setDeveloperStatus('unauthorized');
      }
    };

    checkDeveloperStatus();
  }, [address, isConnected, router]);

  // Loading state
  if (developerStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600 text-lg">Loading...</span>
        </div>
      </div>
    );
  }

  // Unauthorized state
  if (developerStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 mb-6">
            You need to be an active developer to access this dashboard.
          </p>
          <Link
            href="/apply"
            className="block w-full py-3 bg-violet-600 rounded-xl text-white font-semibold text-center hover:bg-violet-700 transition-colors"
          >
            Apply as Developer
          </Link>
          <button
            onClick={() => {
              disconnect();
              router.push('/');
            }}
            className="block w-full py-3 mt-3 bg-gray-100 rounded-xl text-gray-700 font-semibold text-center hover:bg-gray-200 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Pending state
  if (developerStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Application Pending</h2>
          <p className="text-gray-500 mb-6">
            Your developer application is under review. An admin will review and approve your account shortly.
          </p>
          <button
            onClick={() => {
              disconnect();
              router.push('/');
            }}
            className="block w-full py-3 bg-gray-100 rounded-xl text-gray-700 font-semibold text-center hover:bg-gray-200 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Profile', href: '/dashboard/developer', icon: Icons.profile },
    { name: 'Projects', href: '/dashboard/developer/projects', icon: Icons.projects },
    { name: 'Disputes', href: '/disputes', icon: Icons.disputes },
    { name: 'Settings', href: '/dashboard/developer/settings', icon: Icons.settings },
  ];

  return (
    <DashboardShell
      role="developer"
      navItems={navItems}
      switchRole={{ label: 'Client Dashboard', href: '/dashboard/client', icon: Icons.client }}
    >
      {children}
    </DashboardShell>
  );
}
