'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import DashboardShell, { Icons } from '@/components/dashboard/DashboardShell';

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  if (!isConnected) {
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
