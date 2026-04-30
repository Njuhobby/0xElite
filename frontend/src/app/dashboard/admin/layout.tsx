'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import DashboardShell, { Icons } from '@/components/dashboard/DashboardShell';
import { isAdminAddress } from '@/lib/auth';

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const isAdmin = isAdminAddress(address);

  useEffect(() => {
    if (!isConnected || !isAdmin) {
      router.push('/');
    }
  }, [isConnected, isAdmin, router]);

  if (!isConnected || !isAdmin) {
    return null;
  }

  const navItems = [
    { name: 'Developers', href: '/dashboard/admin', icon: Icons.developers },
    { name: 'Disputes', href: '/disputes', icon: Icons.disputes },
  ];

  return (
    <DashboardShell role="admin" navItems={navItems}>
      {children}
    </DashboardShell>
  );
}
