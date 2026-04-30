/**
 * Number of block confirmations to wait before considering a tx confirmed.
 */
export const TX_CONFIRMATIONS = Number(process.env.NEXT_PUBLIC_CONFIRMATIONS ?? 1);

/**
 * ProjectManager ABI — functions used by the frontend
 */
export const PROJECT_MANAGER_ABI = [
  // Client creates project with milestones
  {
    type: 'function',
    name: 'createProjectWithMilestones',
    inputs: [
      { name: 'totalBudget', type: 'uint256' },
      { name: 'milestoneBudgets', type: 'uint128[]' },
      { name: 'milestoneHashes', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'projectId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // Client approves milestone (triggers atomic payment)
  {
    type: 'function',
    name: 'approveMilestone',
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_milestoneIndex', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // View: Get all milestones
  {
    type: 'function',
    name: 'getMilestones',
    inputs: [{ name: '_projectId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'budget', type: 'uint128' },
          { name: 'detailsHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  // View: Get developers
  {
    type: 'function',
    name: 'getProjectDevelopers',
    inputs: [{ name: '_projectId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  // View: Check developer
  {
    type: 'function',
    name: 'isProjectDeveloper',
    inputs: [
      { name: '_projectId', type: 'uint256' },
      { name: '_addr', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  // View: version
  {
    type: 'function',
    name: 'version',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
  },
  // Events
  {
    type: 'event',
    name: 'ProjectCreated',
    inputs: [
      { name: 'projectId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'totalBudget', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MilestonesCreated',
    inputs: [
      { name: 'projectId', type: 'uint256', indexed: true },
      { name: 'count', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MilestoneApproved',
    inputs: [
      { name: 'projectId', type: 'uint256', indexed: true },
      { name: 'milestoneIndex', type: 'uint8', indexed: false },
      { name: 'developerPayment', type: 'uint256', indexed: false },
      { name: 'platformFee', type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Get the ProjectManager contract address from env
 */
export function getProjectManagerAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS not configured');
  }
  return address as `0x${string}`;
}

/**
 * Get the EscrowVault contract address from env
 */
export function getEscrowVaultAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_ESCROW_VAULT_ADDRESS not configured');
  }
  return address as `0x${string}`;
}

/**
 * DisputeDAO ABI — write functions used by detail-page panels
 * (evidence/voting/owner-resolve) plus the view functions needed
 * for client-side eligibility prechecks.
 */
export const DISPUTE_DAO_ABI = [
  {
    type: 'function',
    name: 'createDispute',
    inputs: [
      { name: 'projectId', type: 'uint256' },
      { name: 'evidenceURI', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'arbitrationFee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'submitEvidence',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'evidenceURI', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'castVote',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'supportClient', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'ownerResolve',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'clientWon', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'hasVoted',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export function getDisputeDAOAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_DISPUTE_DAO_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_DISPUTE_DAO_ADDRESS not configured');
  }
  return address as `0x${string}`;
}

/**
 * Minimal EliteToken ABI — balanceOf is a sufficient UX gate for voting
 * eligibility. Final voting power is enforced on-chain via getPastVotes.
 */
export const ELITE_TOKEN_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPastVotes',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'timepoint', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function getEliteTokenAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_ELITE_TOKEN_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_ELITE_TOKEN_ADDRESS not configured');
  }
  return address as `0x${string}`;
}

/**
 * Minimal USDC (ERC20) ABI — approve + allowance are enough to gate
 * any USDC-spending action (escrow deposit, dispute fee, etc.).
 */
export const USDC_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function getUsdcAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_USDC_ADDRESS not configured');
  }
  return address as `0x${string}`;
}
