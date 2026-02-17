'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();
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
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Unregistered clients see the registration prompt embedded in the profile page
  // so we still show the layout - the page.tsx handles registration flow

  const navItems = [
    { name: 'Profile', href: '/dashboard/client', icon: '👤' },
    { name: 'Projects', href: '/dashboard/client/projects', icon: '📁' },
    { name: 'Settings', href: '/dashboard/client/settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-white/10 backdrop-blur-lg border-r border-white/20">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-2">Client Dashboard</h1>
            <p className="text-gray-300 text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>

          <nav className="px-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard/client' && pathname.startsWith(item.href));

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

            {/* Developer Dashboard Link */}
            <Link
              href="/dashboard/developer"
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-2 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span className="text-xl">👨‍💻</span>
              <span className="font-medium">Developer Dashboard</span>
            </Link>

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
