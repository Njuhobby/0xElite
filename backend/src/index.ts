import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import developersRouter from './api/routes/developers';
import projectsRouter, { initialize as initializeProjects } from './api/routes/projects';
import clientsRouter, { initialize as initializeClients } from './api/routes/clients';
import escrowRouter, { initialize as initializeEscrow } from './api/routes/escrow';
import reviewsRouter, { initialize as initializeReviews } from './api/routes/reviews';
import disputesRouter from './api/routes/disputes';
import adminRouter, { initialize as initializeAdmin } from './api/routes/admin';
import notificationsRouter from './api/routes/notifications';
import transactionsRouter, { initialize as initializeTransactions } from './api/routes/transactions';
import { pool } from './config/database';
import { startConsistencyScheduler } from './services/consistencyScheduler';
import { startChainReconciler } from './services/chainReconciler';
import VotingPowerSync from './services/votingPowerSync';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const db = pool;

// Initialize blockchain connection and contract
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const projectManagerAddress = process.env.PROJECT_MANAGER_ADDRESS;
const escrowVaultAddress = process.env.ESCROW_VAULT_ADDRESS;
const disputeDAOAddress = process.env.DISPUTE_DAO_ADDRESS;

if (!projectManagerAddress) {
  throw new Error('PROJECT_MANAGER_ADDRESS not configured in .env');
}

if (!escrowVaultAddress) {
  throw new Error('ESCROW_VAULT_ADDRESS not configured in .env');
}

if (!disputeDAOAddress) {
  throw new Error('DISPUTE_DAO_ADDRESS not configured in .env');
}

const eliteTokenAddress = process.env.ELITE_TOKEN_ADDRESS;
if (!eliteTokenAddress) {
  throw new Error('ELITE_TOKEN_ADDRESS not configured in .env');
}

// ProjectManager contract ABI
const projectManagerAbi = [
  'function createProjectWithMilestones(uint256 totalBudget, uint128[] milestoneBudgets, bytes32[] milestoneHashes) external returns (uint256)',
  'function assignDevelopers(uint256 _projectId, address[] _developers) external',
  'function approveMilestone(uint256 _projectId, uint8 _milestoneIndex) external',
  'function updateMilestoneStatus(uint256 _projectId, uint8 _milestoneIndex, uint8 _newStatus) external',
  'function getProject(uint256 _projectId) external view returns (tuple(uint256 projectId, address client, address assignedDeveloper, uint8 state, uint256 totalBudget, uint256 createdAt, uint256 activatedAt, uint256 completedAt))',
  'function getMilestone(uint256 _projectId, uint8 _index) external view returns (tuple(uint128 budget, bytes32 detailsHash, uint8 status))',
  'function getMilestones(uint256 _projectId) external view returns (tuple(uint128 budget, bytes32 detailsHash, uint8 status)[])',
  'function getProjectDevelopers(uint256 _projectId) external view returns (address[])',
  'function isProjectDeveloper(uint256 _projectId, address _addr) external view returns (bool)',
  'function version() external pure returns (string)',
  'event ProjectCreated(uint256 indexed projectId, address indexed client, uint256 totalBudget)',
  'event ProjectStateChanged(uint256 indexed projectId, uint8 oldState, uint8 newState)',
  'event MilestonesCreated(uint256 indexed projectId, uint8 count)',
  'event MilestoneStatusChanged(uint256 indexed projectId, uint8 milestoneIndex, uint8 oldStatus, uint8 newStatus)',
  'event MilestoneApproved(uint256 indexed projectId, uint8 milestoneIndex, uint256 developerPayment, uint256 platformFee)',
  'event DevelopersAssigned(uint256 indexed projectId, address[] developers)',
];

// EscrowVault contract ABI (minimal - just what we need for routes)
const escrowVaultAbi = [
  'function deposit(uint256 projectId, uint256 amount) external returns (bool)',
  'function release(uint256 projectId, address developer, uint256 amount) external returns (bool)',
  'function releaseFee(uint256 projectId, uint256 feeAmount) external returns (bool)',
  'function freeze(uint256 projectId) external returns (bool)',
  'function unfreeze(uint256 projectId) external returns (bool)',
  'function getEscrowInfo(uint256 projectId) external view returns (tuple(uint256 projectId, address client, uint256 totalAmount, uint256 releasedAmount, bool disputed))',
  'function getAvailableBalance(uint256 projectId) external view returns (uint256)',
];

// DisputeDAO contract ABI — events + view functions the pendingTx handlers need,
// plus executeResolution (called by the consistency scheduler to finalize
// overdue disputes; the EVM has no cron, so the backend acts as keeper).
const disputeDAOAbi = [
  'function getDisputeCore(uint256) view returns (uint256, address, address, address, uint8, bool, bool, uint256)',
  'function getDisputeTimeline(uint256) view returns (string, string, uint256, uint256, uint256)',
  'function getDisputeVoting(uint256) view returns (uint256, uint256, uint256, uint256)',
  'function quorumNumerator() view returns (uint256)',
  'function executeResolution(uint256 disputeId) external',
  'event DisputeCreated(uint256 indexed disputeId, uint256 indexed projectId, address indexed initiator)',
  'event EvidenceSubmitted(uint256 indexed disputeId, address indexed party, string evidenceURI)',
  'event VotingStarted(uint256 indexed disputeId, uint256 votingDeadline, uint256 votingSnapshot)',
  'event VoteCast(uint256 indexed disputeId, address indexed voter, bool supportClient, uint256 weight)',
  'event DisputeResolved(uint256 indexed disputeId, bool clientWon, uint256 clientShare, uint256 developerShare)',
  'event DisputeResolvedByOwner(uint256 indexed disputeId, bool clientWon)',
];

// Create contract instances with signer
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const projectManagerContract = new ethers.Contract(projectManagerAddress, projectManagerAbi, wallet);
const escrowVaultContract = new ethers.Contract(escrowVaultAddress, escrowVaultAbi, wallet);
// Bound to wallet (not provider) so the consistency scheduler can write
// (executeResolution); reads/parsing still work the same.
const disputeDAOContract = new ethers.Contract(disputeDAOAddress, disputeDAOAbi, wallet);

// VotingPowerSync mints/burns xELITE on-chain to keep balances in line with
// developers.voting_power (which the DB trigger derives from total_earned ×
// average_rating). Wired into the pending-tx pipeline via Contracts bag and
// invoked from handleApproveMilestone postCommit + reviews route.
const votingPowerSync = new VotingPowerSync(db, eliteTokenAddress, wallet);

const contracts = {
  projectManager: projectManagerContract,
  disputeDAO: disputeDAOContract,
  votingPowerSync,
};

// Initialize routes with dependencies
initializeProjects(db, projectManagerContract);
initializeClients(db);
initializeEscrow(db, escrowVaultContract, projectManagerContract);
initializeAdmin(projectManagerContract);
initializeTransactions(provider, contracts);
initializeReviews(votingPowerSync);

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/developers', developersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/escrow', escrowRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/transactions', transactionsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ CORS enabled for: ${process.env.ALLOWED_ORIGINS || 'http://localhost:3000'}`);

  // Start consistency scheduler — backend-driven reconciliation. Drains
  // pending_transactions (fast-path for user-initiated tx) and sweeps
  // voting_power drift (xELITE balance vs developers.voting_power) on
  // separate cadences but in the same scheduler.
  try {
    startConsistencyScheduler(provider, contracts, votingPowerSync);
    console.log('✓ Consistency scheduler started');
  } catch (error) {
    console.error('Failed to start consistency scheduler:', error);
  }

  // Start chain reconciler (safety net for events that bypass the
  // pending_transactions table — direct contract calls, frontend crashed
  // before recording the row, restored backups, etc.)
  try {
    await startChainReconciler(provider, contracts);
    console.log('✓ Chain reconciler started');
  } catch (error) {
    console.error('Failed to start chain reconciler:', error);
  }
});

export default app;
