'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DeveloperDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [developerStatus, setDeveloperStatus] = useState<'loading' | 'active' | 'pending' | 'unauthorized'>('loading');

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    // Check if connected wallet is an active developer
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

        if (data.status === 'active') {
          setDeveloperStatus('active');
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

  // Show loading state
  if (developerStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show unauthorized state
  if (developerStatus === 'unauthorized') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-gray-300 mb-6">
            You need to be an active developer to access this dashboard.
          </p>
          <Link
            href="/apply"
            className="block w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold text-center hover:shadow-lg transition-shadow"
          >
            Apply as Developer
          </Link>
          <Link
            href="/"
            className="block w-full py-3 mt-3 bg-white/10 rounded-lg text-white font-semibold text-center hover:bg-white/20 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Show pending state
  if (developerStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Application Pending</h2>
          <p className="text-gray-300 mb-6">
            Your developer application is pending. Please complete the staking process to activate your account.
          </p>
          <Link
            href="/apply"
            className="block w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-white font-semibold text-center hover:shadow-lg transition-shadow"
          >
            Complete Application
          </Link>
          <Link
            href="/"
            className="block w-full py-3 mt-3 bg-white/10 rounded-lg text-white font-semibold text-center hover:bg-white/20 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // Navigation items
  const navItems = [
    { name: 'Profile', href: '/dashboard/developer', icon: '👤' },
    { name: 'Projects', href: '/dashboard/developer/projects', icon: '📁' },
    { name: 'Settings', href: '/dashboard/developer/settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-white/10 backdrop-blur-lg border-r border-white/20">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-2">Developer Dashboard</h1>
            <p className="text-gray-300 text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>

          <nav className="px-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard/developer' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}

            <div className="border-t border-white/20 my-4"></div>

            {/* Main Site Link */}
            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-2 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span className="text-xl">🏠</span>
              <span className="font-medium">Main Site</span>
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
