import { ethers } from 'ethers';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { eventSyncConfig } from '../../config/eventSync';
import { createNotification } from '../notificationService';

// StakeVault ABI - only the parts we need
const STAKE_VAULT_ABI = [
  'event Staked(address indexed developer, uint256 amount)',
  'event Unstaked(address indexed developer, uint256 amount)',
  'function getStake(address developer) view returns (uint256)',
];

interface StakedEventArgs {
  developer: string;
  amount: bigint;
}

export class StakeEventListener {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private lastProcessedBlock: number;
  private consecutiveErrors: number = 0;

  constructor() {
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(eventSyncConfig.rpcUrl);

    // Initialize contract
    this.contract = new ethers.Contract(
      eventSyncConfig.stakeVaultAddress,
      STAKE_VAULT_ABI,
      this.provider
    );

    this.lastProcessedBlock = eventSyncConfig.startBlock;
  }

  /**
   * Initialize the listener by loading last processed block from database
   */
  async initialize(): Promise<void> {
    try {
      const result = await pool.query(
        'SELECT value FROM system_state WHERE key = $1',
        ['last_processed_block_stake_vault']
      );

      if (result.rows.length > 0) {
        this.lastProcessedBlock = parseInt(result.rows[0].value);
        logger.info(`Loaded last processed block: ${this.lastProcessedBlock}`);
      } else {
        logger.info(`Starting from block: ${this.lastProcessedBlock}`);
      }
    } catch (error) {
      logger.error('Failed to load last processed block:', error);
      throw error;
    }
  }

  /**
   * Sync historical events from lastProcessedBlock to current
   */
  async syncHistoricalEvents(): Promise<void> {
    logger.info('Starting historical event sync...');

    try {
      const currentBlock = await this.provider.getBlockNumber();
      let fromBlock = this.lastProcessedBlock;

      logger.info(`Current block: ${currentBlock}, starting from: ${fromBlock}`);

      while (fromBlock < currentBlock) {
        const toBlock = Math.min(fromBlock + eventSyncConfig.batchSize, currentBlock);

        logger.info(`Syncing blocks ${fromBlock} to ${toBlock}`);

        try {
          const [stakedEvents, unstakedEvents] = await Promise.all([
            this.contract.queryFilter(this.contract.filters.Staked(), fromBlock, toBlock),
            this.contract.queryFilter(this.contract.filters.Unstaked(), fromBlock, toBlock),
          ]);

          logger.info(`Found ${stakedEvents.length} Staked, ${unstakedEvents.length} Unstaked events in range ${fromBlock}-${toBlock}`);

          for (const event of stakedEvents) {
            await this.processStakedEvent(event as ethers.EventLog);
          }

          for (const event of unstakedEvents) {
            await this.processUnstakedEvent(event as ethers.EventLog);
          }

          fromBlock = toBlock + 1;
          this.lastProcessedBlock = toBlock;
          await this.saveCheckpoint(toBlock);

          // Reset error counter on success
          this.consecutiveErrors = 0;
        } catch (error) {
          logger.error(`Error syncing blocks ${fromBlock}-${toBlock}:`, error);
          this.consecutiveErrors++;

          if (this.consecutiveErrors >= eventSyncConfig.alertOnErrorCount) {
            await this.alertAdmin(`Historical sync failed after ${this.consecutiveErrors} attempts`);
          }

          // Wait before retrying
          await this.sleep(eventSyncConfig.retryDelay);
        }
      }

      logger.info('Historical sync complete');
    } catch (error) {
      logger.error('Historical sync failed:', error);
      throw error;
    }
  }

  /**
   * Start listening to new events in real-time
   */
  startRealTimeListener(): void {
    logger.info('Starting real-time event listener...');

    this.contract.on('Staked', async (developer: string, amount: bigint, event: ethers.Log) => {
      logger.info(`Received Staked event: ${developer} staked ${amount}`);

      try {
        const eventLog = event as ethers.EventLog;

        // Wait for confirmations (skip on local chains like Hardhat where blocks don't auto-advance)
        const receipt = await eventLog.getTransactionReceipt();
        let currentBlock = await this.provider.getBlockNumber();
        let confirmations = currentBlock - receipt.blockNumber;

        if (confirmations < eventSyncConfig.confirmations) {
          logger.info(`Waiting for confirmations: ${confirmations}/${eventSyncConfig.confirmations}`);

          // Poll for new blocks with timeout (handles Hardhat and other local chains)
          const maxWait = 30000; // 30 seconds
          const pollInterval = 1000;
          const start = Date.now();

          while (confirmations < eventSyncConfig.confirmations && Date.now() - start < maxWait) {
            await this.sleep(pollInterval);
            currentBlock = await this.provider.getBlockNumber();
            confirmations = currentBlock - receipt.blockNumber;
          }

          // If still not enough confirmations, process anyway (local chain)
          if (confirmations < eventSyncConfig.confirmations) {
            logger.info(`Processing event without full confirmations (${confirmations}/${eventSyncConfig.confirmations}) — likely local chain`);
          }
        }

        // Process event
        await this.processStakedEvent(eventLog);

        // Update checkpoint
        if (eventLog.blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = eventLog.blockNumber;
          await this.saveCheckpoint(eventLog.blockNumber);
        }

        // Reset error counter on success
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error('Error processing Staked event:', error);
        this.consecutiveErrors++;

        if (this.consecutiveErrors >= eventSyncConfig.alertOnErrorCount) {
          await this.alertAdmin(`Real-time processing failed after ${this.consecutiveErrors} errors`);
        }

        await this.retryProcessEvent(event as ethers.EventLog);
      }
    });

    this.contract.on('Unstaked', async (developer: string, amount: bigint, event: ethers.Log) => {
      logger.info(`Received Unstaked event: ${developer} unstaked ${amount}`);

      try {
        const eventLog = event as ethers.EventLog;
        await this.processUnstakedEvent(eventLog);

        if (eventLog.blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = eventLog.blockNumber;
          await this.saveCheckpoint(eventLog.blockNumber);
        }

        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error('Error processing Unstaked event:', error);
        this.consecutiveErrors++;
      }
    });

    logger.info('Real-time listener started');
  }

  /**
   * Process a Staked event and update database
   */
  private async processStakedEvent(event: ethers.EventLog): Promise<void> {
    const args = event.args as unknown as StakedEventArgs;
    const developerAddress = args.developer.toLowerCase();
    const amount = args.amount;

    logger.info(`Processing stake for ${developerAddress}: ${amount}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Convert amount from wei to USDC (6 decimals)
      const stakeAmount = ethers.formatUnits(amount, 6);

      // Update developer record — set to 'staked' (pending admin approval)
      const result = await client.query(
        `UPDATE developers
         SET stake_amount = $1,
             staked_at = NOW(),
             status = 'staked',
             updated_at = NOW()
         WHERE wallet_address = $2
         RETURNING *`,
        [stakeAmount, developerAddress]
      );

      if (result.rows.length === 0) {
        logger.warn(`Developer ${developerAddress} not found in database`);
        await client.query('ROLLBACK');
        return;
      }

      await client.query('COMMIT');

      logger.info(`Developer ${developerAddress} staked ${stakeAmount} USDC, pending admin approval`);

      // Notify all admins about new application
      const adminAddresses = (process.env.ADMIN_ADDRESSES || '')
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.length > 0);

      for (const admin of adminAddresses) {
        await createNotification(
          admin,
          'new_application',
          'New Developer Application',
          `Developer ${developerAddress.slice(0, 6)}...${developerAddress.slice(-4)} has staked ${stakeAmount} USDC and is awaiting approval.`,
          '/dashboard/admin'
        );
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Database update failed for ${developerAddress}:`, error);
      throw error; // Re-throw to trigger retry
    } finally {
      client.release();
    }
  }

  /**
   * Process an Unstaked event and update database
   */
  private async processUnstakedEvent(event: ethers.EventLog): Promise<void> {
    const args = event.args as unknown as StakedEventArgs;
    const developerAddress = args.developer.toLowerCase();
    const amount = args.amount;

    logger.info(`Processing unstake for ${developerAddress}: ${amount}`);

    const unstakeAmount = ethers.formatUnits(amount, 6);

    try {
      await pool.query(
        `UPDATE developers
         SET stake_amount = GREATEST(0, stake_amount - $1),
             updated_at = NOW()
         WHERE wallet_address = $2`,
        [unstakeAmount, developerAddress]
      );

      logger.info(`Developer ${developerAddress} unstaked ${unstakeAmount} USDC`);
    } catch (error) {
      logger.error(`Database update failed for unstake ${developerAddress}:`, error);
      throw error;
    }
  }

  /**
   * Retry processing an event with exponential backoff
   */
  private async retryProcessEvent(event: ethers.EventLog): Promise<void> {
    for (let i = 0; i < eventSyncConfig.retryAttempts; i++) {
      try {
        logger.info(`Retry attempt ${i + 1} for event at block ${event.blockNumber}`);
        await this.processStakedEvent(event);
        return; // Success
      } catch (error) {
        const delay = eventSyncConfig.retryDelay * Math.pow(2, i);
        logger.warn(`Retry ${i + 1} failed, waiting ${delay}ms`);
        await this.sleep(delay);
      }
    }

    // All retries failed
    logger.error(`Failed to process event after ${eventSyncConfig.retryAttempts} attempts`);
    await this.alertAdmin(`Event processing failed: block ${event.blockNumber}`);
  }

  /**
   * Save last processed block to database for recovery
   */
  private async saveCheckpoint(blockNumber: number): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO system_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = NOW()`,
        ['last_processed_block_stake_vault', blockNumber.toString()]
      );
      logger.debug(`Checkpoint saved: block ${blockNumber}`);
    } catch (error) {
      logger.error('Failed to save checkpoint:', error);
    }
  }

  /**
   * Send welcome email to newly activated developer
   */
  private async sendWelcomeEmail(developerAddress: string, email: string): Promise<void> {
    // TODO: Implement email service integration
    logger.info(`Sending welcome email to ${email} (developer: ${developerAddress})`);

    // Placeholder - integrate with SendGrid, Mailgun, or AWS SES
    // const emailContent = {
    //   to: email,
    //   subject: 'Welcome to 0xElite!',
    //   body: `Your account has been activated. You can now browse projects and submit proposals.`
    // };
  }

  /**
   * Alert admin about persistent errors
   */
  private async alertAdmin(message: string): Promise<void> {
    // TODO: Implement alerting (email, Slack, PagerDuty)
    logger.error(`ADMIN ALERT: ${message}`);

    // Placeholder - integrate with alerting service
    // await slackClient.sendMessage({
    //   channel: '#alerts',
    //   text: `🚨 0xElite Event Listener Alert: ${message}`
    // });
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{ healthy: boolean; lastBlock: number; lag: number }> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const lag = currentBlock - this.lastProcessedBlock;

      return {
        healthy: lag < 100, // Unhealthy if more than 100 blocks behind
        lastBlock: this.lastProcessedBlock,
        lag,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        healthy: false,
        lastBlock: this.lastProcessedBlock,
        lag: -1,
      };
    }
  }

  /**
   * Utility: sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop the listener gracefully
   */
  async stop(): Promise<void> {
    logger.info('Stopping event listener...');
    this.contract.removeAllListeners();
    logger.info('Event listener stopped');
  }
}

/**
 * Initialize and start event listeners
 */
export async function startEventListeners(): Promise<StakeEventListener> {
  logger.info('Initializing event listeners...');

  // Validate configuration
  if (!eventSyncConfig.stakeVaultAddress) {
    throw new Error('STAKE_VAULT_ADDRESS environment variable is required');
  }

  const stakeListener = new StakeEventListener();

  // Initialize and load checkpoint
  await stakeListener.initialize();

  // Sync historical events first
  await stakeListener.syncHistoricalEvents();

  // Start real-time listener
  stakeListener.startRealTimeListener();

  // Health check interval
  setInterval(async () => {
    const health = await stakeListener.healthCheck();
    if (!health.healthy) {
      logger.error('Event listener unhealthy!', health);
    } else {
      logger.debug(`Health check OK - Block: ${health.lastBlock}, Lag: ${health.lag}`);
    }
  }, eventSyncConfig.healthCheckInterval);

  logger.info('Event listeners started successfully');

  return stakeListener;
}
