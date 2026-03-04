/**
 * Shared test fixtures
 */

// Valid Ethereum addresses
export const ADDRESSES = {
  developer1: '0x' + 'aa'.repeat(20),
  developer2: '0x' + 'bb'.repeat(20),
  client1: '0x' + 'cc'.repeat(20),
  client2: '0x' + 'dd'.repeat(20),
  admin: '0x' + 'ee'.repeat(20),
  random: '0x' + 'ff'.repeat(20),
} as const;

// Sample developer DB records
export const SAMPLE_DEVELOPER = {
  wallet_address: ADDRESSES.developer1,
  email: 'dev@example.com',
  github_username: 'devuser',
  skills: ['Solidity', 'React', 'Node.js'],
  bio: 'Full-stack blockchain developer',
  hourly_rate: 100,
  availability: 'available',
  stake_amount: '1000.000000',
  staked_at: new Date('2024-01-01'),
  status: 'active',
  average_rating: 4.5,
  total_reviews: 10,
  rating_distribution: { '1': 0, '2': 0, '3': 1, '4': 4, '5': 5 },
  voting_power: '4500.000000',
  elite_token_balance: '4500.000000',
  last_assignment_at: new Date('2024-06-01'),
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-06-01'),
};

export const SAMPLE_DEVELOPER_STAKED = {
  ...SAMPLE_DEVELOPER,
  wallet_address: ADDRESSES.developer1,
  status: 'staked',
  stake_amount: '150.000000',
  staked_at: new Date('2024-01-15'),
  admin_notes: null,
  reviewed_by: null,
  reviewed_at: null,
};

export const SAMPLE_DEVELOPER_2 = {
  ...SAMPLE_DEVELOPER,
  wallet_address: ADDRESSES.developer2,
  email: 'dev2@example.com',
  github_username: 'devuser2',
  skills: ['Solidity', 'Rust'],
  average_rating: 3.8,
  last_assignment_at: null,
};

// Sample client DB records
export const SAMPLE_CLIENT = {
  wallet_address: ADDRESSES.client1,
  email: 'client@example.com',
  company_name: 'Acme Corp',
  description: 'We build things',
  website: 'https://acme.com',
  is_registered: true,
  projects_created: 5,
  projects_completed: 3,
  total_spent: '15000.000000',
  reputation_score: null,
  average_rating: 4.2,
  total_reviews: 3,
  rating_distribution: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 },
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-06-01'),
};

// Sample project DB records
export const SAMPLE_PROJECT = {
  id: 'proj-uuid-001',
  project_number: 1,
  client_address: ADDRESSES.client1,
  assigned_developer: ADDRESSES.developer1,
  title: 'DeFi Dashboard',
  description: 'Build a DeFi analytics dashboard',
  required_skills: ['React', 'Solidity', 'Node.js'],
  total_budget: '5000.00',
  status: 'active',
  contract_project_id: '1',
  escrow_deposited: true,
  escrow_deposit_tx_hash: '0x' + '11'.repeat(32),
  company_name: 'Acme Corp',
  client_email: 'client@example.com',
  created_at: new Date('2024-02-01'),
  assigned_at: new Date('2024-02-02'),
  started_at: new Date('2024-02-02'),
  completed_at: null,
  updated_at: new Date('2024-02-02'),
};

export const SAMPLE_PROJECT_DRAFT = {
  ...SAMPLE_PROJECT,
  id: 'proj-uuid-002',
  project_number: 2,
  status: 'draft',
  assigned_developer: null,
  escrow_deposited: false,
};

export const SAMPLE_PROJECT_COMPLETED = {
  ...SAMPLE_PROJECT,
  id: 'proj-uuid-003',
  project_number: 3,
  status: 'completed',
  completed_at: new Date('2024-05-01'),
};

// Sample milestone DB records
export const SAMPLE_MILESTONE = {
  id: 'ms-uuid-001',
  project_id: SAMPLE_PROJECT.id,
  milestone_number: 1,
  title: 'Frontend Setup',
  description: 'Set up React app with routing',
  deliverables: ['React app scaffold', 'Routing configured'],
  budget: '2000.00',
  status: 'pending',
  client_address: ADDRESSES.client1,
  assigned_developer: ADDRESSES.developer1,
  project_status: 'active',
  total_budget: '5000.00',
  created_at: new Date('2024-02-01'),
  updated_at: new Date('2024-02-01'),
};

// Sample review DB records
export const SAMPLE_REVIEW = {
  id: 'rev-uuid-001',
  project_id: SAMPLE_PROJECT_COMPLETED.id,
  reviewer_address: ADDRESSES.client1,
  reviewee_address: ADDRESSES.developer1,
  reviewer_type: 'client',
  rating: 5,
  comment: 'Excellent work!',
  created_at: new Date(),
  updated_at: new Date(),
};

// Sample dispute DB records
export const SAMPLE_DISPUTE = {
  id: 'disp-uuid-001',
  dispute_number: 1,
  project_id: SAMPLE_PROJECT.id,
  client_address: ADDRESSES.client1,
  developer_address: ADDRESSES.developer1,
  initiator_address: ADDRESSES.client1,
  initiator_role: 'client',
  status: 'open',
  client_evidence_uri: 'ipfs://evidence-client',
  developer_evidence_uri: null,
  evidence_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  voting_deadline: null,
  voting_snapshot: null,
  client_vote_weight: '0',
  developer_vote_weight: '0',
  total_vote_weight: '0',
  quorum_required: null,
  winner: null,
  resolved_by_owner: false,
  client_share: null,
  developer_share: null,
  arbitration_fee: '50.000000',
  chain_dispute_id: null,
  creation_tx_hash: null,
  resolution_tx_hash: null,
  created_at: new Date(),
  resolved_at: null,
  updated_at: new Date(),
};

// Sample escrow deposit DB records
export const SAMPLE_ESCROW_DEPOSIT = {
  id: 'esc-uuid-001',
  project_id: SAMPLE_PROJECT.id,
  contract_project_id: '1',
  total_deposited: '5000.000000',
  total_released: '2000.000000',
  escrow_balance: '3000.000000',
  is_frozen: false,
  frozen_at: null,
  frozen_by: null,
  deposit_tx_hash: '0x' + '11'.repeat(32),
  created_at: new Date(),
  updated_at: new Date(),
};

// Auth helpers — used for requests that require signature verification
export const VALID_AUTH = {
  address: ADDRESSES.developer1,
  message: 'Sign this message',
  signature: '0x' + 'ab'.repeat(65),
};

export const CLIENT_AUTH = {
  address: ADDRESSES.client1,
  message: 'Sign this message',
  signature: '0x' + 'cd'.repeat(65),
};

export const ADMIN_AUTH = {
  address: ADDRESSES.admin,
  message: 'Sign this message',
  signature: '0x' + 'ee'.repeat(65),
};

// Sample dispute vote
export const SAMPLE_DISPUTE_VOTE = {
  id: 'vote-uuid-001',
  dispute_id: SAMPLE_DISPUTE.id,
  voter_address: ADDRESSES.developer2,
  support_client: true,
  vote_weight: '100.000000',
  reward_amount: null,
  tx_hash: '0x' + 'ff'.repeat(32),
  voted_at: new Date(),
};
