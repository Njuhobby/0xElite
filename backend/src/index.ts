import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import developersRouter from './api/routes/developers';
import projectsRouter, { initialize as initializeProjects } from './api/routes/projects';
import milestonesRouter, { initialize as initializeMilestones } from './api/routes/milestones';
import clientsRouter, { initialize as initializeClients } from './api/routes/clients';
import { databaseConfig } from './config/database';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
const db = new Pool(databaseConfig);

// Initialize blockchain connection and contract
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const projectManagerAddress = process.env.PROJECT_MANAGER_ADDRESS;

if (!projectManagerAddress) {
  throw new Error('PROJECT_MANAGER_ADDRESS not configured in .env');
}

// ProjectManager contract ABI (minimal - just what we need)
const projectManagerAbi = [
  'function createProject(uint256 _totalBudget) external returns (uint256)',
  'function assignDeveloper(uint256 _projectId, address _developer) external',
  'function updateProjectState(uint256 _projectId, uint8 _newState) external',
  'function getProject(uint256 _projectId) external view returns (tuple(uint256 projectId, address client, address assignedDeveloper, uint8 state, uint256 totalBudget, uint256 createdAt, uint256 activatedAt, uint256 completedAt))',
  'event ProjectCreated(uint256 indexed projectId, address indexed client, uint256 totalBudget)',
  'event DeveloperAssigned(uint256 indexed projectId, address indexed developer)',
  'event ProjectStateChanged(uint256 indexed projectId, uint8 oldState, uint8 newState)',
];

// Create contract instance with signer
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const projectManagerContract = new ethers.Contract(projectManagerAddress, projectManagerAbi, wallet);

// Initialize routes with dependencies
initializeProjects(db, projectManagerContract);
initializeMilestones(db, projectManagerContract);
initializeClients(db);

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
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ CORS enabled for: ${process.env.ALLOWED_ORIGINS || 'http://localhost:3000'}`);
});

export default app;
