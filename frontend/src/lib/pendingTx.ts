const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface PendingTxParams {
  entityType: string;
  entityId: string;
  action: string;
  txHash: string;
  walletAddress: string;
  metadata?: Record<string, unknown>;
}

/** Write to pending_transactions. Throws on failure. */
export async function writePendingTx(params: PendingTxParams): Promise<void> {
  const res = await fetch(`${API_URL}/api/transactions/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Failed to record pending transaction');
  }
}

export interface DeletePendingTxResult {
  success?: boolean;
  action?: string;
  data?: Record<string, unknown>;
}

/**
 * DELETE /api/transactions/pending/:txHash — server processes the action
 * (calls reconciliation handler) and returns the resulting data. Best-effort:
 * if the call fails the poller picks it up later.
 */
export async function deletePendingTx(txHash: string): Promise<DeletePendingTxResult> {
  try {
    const res = await fetch(`${API_URL}/api/transactions/pending/${txHash}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch {
    return {};
  }
}
