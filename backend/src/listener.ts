import dotenv from 'dotenv';
import { startEventListeners } from './services/eventListeners/stakeListener';
import { logger } from './utils/logger';

dotenv.config();

/**
 * Event Listener Service Entry Point
 *
 * This service runs independently from the API server and listens to
 * blockchain events to sync on-chain data with the database.
 */

async function main() {
  logger.info('Starting 0xElite Event Listener Service...');
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`RPC URL: ${process.env.RPC_URL?.substring(0, 50)}...`);
  logger.info(`Contract: ${process.env.STAKE_VAULT_ADDRESS}`);

  try {
    const listener = await startEventListeners();

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Received shutdown signal');
      await listener.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    logger.info('✓ Event Listener Service is running');
  } catch (error) {
    logger.error('Failed to start event listener:', error);
    process.exit(1);
  }
}

main();
