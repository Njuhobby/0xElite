import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import developersRouter from './api/routes/developers';
import projectsRouter, { initialize as initializeProjects } from './api/routes/projects';
import milestonesRouter, { initialize as initializeMilestones } from './api/routes/milestones';
import clientsRouter, { initialize as initializeClients } from './api/routes/clients';
import escrowRouter, { initialize as initializeEscrow } from './api/routes/escrow';
import reviewsRouter from './api/routes/reviews';
import disputesRouter from './api/routes/disputes';
import adminRouter, { initialize as initializeAdmin } from './api/routes/admin';
import notificationsRouter from './api/routes/notifications';
import { pool } from './config/database';
import { startMilestoneListener } from './services/eventListeners/milestoneListener';
import { startEventListeners as startStakeListener } from './services/eventListeners/stakeListener';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const db = pool;

// Initialize blockchain connection and contract
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const projectManagerAddress = process.env.PROJECT_MANAGER_ADDRESS;
const escrowVaultAddress = process.env.ESCROW_VAULT_ADDRESS;

if (!projectManagerAddress) {
  throw new Error('PROJECT_MANAGER_ADDRESS not configured in .env');
}

if (!escrowVaultAddress) {
  throw new Error('ESCROW_VAULT_ADDRESS not configured in .env');
}

// ProjectManager contract ABI (V2 — includes milestones)
const projectManagerAbi = [
  // V1 functions
  'function createProject(uint256 _totalBudget) external returns (uint256)',
  'function assignDeveloper(uint256 _projectId, address _developer) external',
  'function updateProjectState(uint256 _projectId, uint8 _newState) external',
  'function getProject(uint256 _projectId) external view returns (tuple(uint256 projectId, address client, address assignedDeveloper, uint8 state, uint256 totalBudget, uint256 createdAt, uint256 activatedAt, uint256 completedAt))',
  // V2 functions
  'function createProjectWithMilestones(uint256 totalBudget, uint128[] milestoneBudgets, bytes32[] milestoneHashes) external returns (uint256)',
  'function assignDevelopers(uint256 _projectId, address[] _developers) external',
  'function approveMilestone(uint256 _projectId, uint8 _milestoneIndex) external',
  'function updateMilestoneStatus(uint256 _projectId, uint8 _milestoneIndex, uint8 _newStatus) external',
  'function getMilestone(uint256 _projectId, uint8 _index) external view returns (tuple(uint128 budget, bytes32 detailsHash, uint8 status))',
  'function getMilestones(uint256 _projectId) external view returns (tuple(uint128 budget, bytes32 detailsHash, uint8 status)[])',
  'function getProjectDevelopers(uint256 _projectId) external view returns (address[])',
  'function isProjectDeveloper(uint256 _projectId, address _addr) external view returns (bool)',
  'function version() external pure returns (string)',
  // V1 events
  'event ProjectCreated(uint256 indexed projectId, address indexed client, uint256 totalBudget)',
  'event DeveloperAssigned(uint256 indexed projectId, address indexed developer)',
  'event ProjectStateChanged(uint256 indexed projectId, uint8 oldState, uint8 newState)',
  // V2 events
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

// Create contract instances with signer
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const projectManagerContract = new ethers.Contract(projectManagerAddress, projectManagerAbi, wallet);
const escrowVaultContract = new ethers.Contract(escrowVaultAddress, escrowVaultAbi, wallet);

// Initialize routes with dependencies
initializeProjects(db, projectManagerContract);
initializeMilestones(db, projectManagerContract, escrowVaultContract);
initializeClients(db);
initializeEscrow(db, escrowVaultContract, projectManagerContract);
initializeAdmin(projectManagerContract);

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
app.use('/api/milestones', milestonesRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/escrow', escrowRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);

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

  // Start milestone event listener
  if (projectManagerAddress) {
    try {
      await startMilestoneListener(projectManagerAddress);
      console.log('✓ Milestone event listener started');
    } catch (error) {
      console.error('Failed to start milestone event listener:', error);
    }
  }

  // Start stake event listener
  try {
    await startStakeListener();
    console.log('✓ Stake event listener started');
  } catch (error) {
    console.error('Failed to start stake event listener:', error);
  }
});

export default app;
