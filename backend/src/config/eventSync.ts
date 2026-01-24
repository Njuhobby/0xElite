import dotenv from 'dotenv';

dotenv.config();

export const eventSyncConfig = {
  // RPC provider
  rpcUrl: process.env.RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/YOUR_API_KEY',
  rpcType: (process.env.RPC_TYPE as 'websocket' | 'polling') || 'polling',
  pollingInterval: parseInt(process.env.POLLING_INTERVAL || '12000'), // 12 seconds

  // Contract addresses
  stakeVaultAddress: process.env.STAKE_VAULT_ADDRESS || '',

  // Sync settings
  startBlock: parseInt(process.env.START_BLOCK || '0'), // Block to start syncing from
  batchSize: parseInt(process.env.BATCH_SIZE || '1000'), // Events to fetch per batch
  confirmations: parseInt(process.env.CONFIRMATIONS || '2'), // Wait for N confirmations

  // Retry settings
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '5000'), // 5 seconds

  // Monitoring
  healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
  alertOnErrorCount: parseInt(process.env.ALERT_ERROR_COUNT || '5'), // Alert if 5 errors in a row
};

export default eventSyncConfig;
