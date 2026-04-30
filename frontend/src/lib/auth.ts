/**
 * Read admin addresses from NEXT_PUBLIC_ADMIN_ADDRESSES at call time so
 * tests and config changes are picked up.
 */
export function getAdminAddresses(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

export function isAdminAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return getAdminAddresses().includes(address.toLowerCase());
}
