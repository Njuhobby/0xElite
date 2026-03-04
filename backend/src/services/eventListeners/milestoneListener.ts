import { ethers } from 'ethers';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { eventSyncConfig } from '../../config/eventSync';

const PROJECT_MANAGER_ABI = [
  'event MilestoneApproved(uint256 indexed projectId, uint8 milestoneIndex, uint256 developerPayment, uint256 platformFee)',
  'event ProjectStateChanged(uint256 indexed projectId, uint8 oldState, uint8 newState)',
  'event DevelopersAssigned(uint256 indexed projectId, address[] developers)',
  'event MilestoneStatusChanged(uint256 indexed projectId, uint8 milestoneIndex, uint8 oldStatus, uint8 newStatus)',
];

const CHECKPOINT_KEY = 'last_processed_block_milestone_listener';

export class MilestoneEventListener {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private lastProcessedBlock: number;
  private consecutiveErrors: number = 0;

  constructor(projectManagerAddress: string) {
    this.provider = new ethers.JsonRpcProvider(eventSyncConfig.rpcUrl);
    this.contract = new ethers.Contract(
      projectManagerAddress,
      PROJECT_MANAGER_ABI,
      this.provider
    );
    this.lastProcessedBlock = eventSyncConfig.startBlock;
  }

  async initialize(): Promise<void> {
    try {
      const result = await pool.query(
        'SELECT value FROM system_state WHERE key = $1',
        [CHECKPOINT_KEY]
      );

      if (result.rows.length > 0) {
        this.lastProcessedBlock = parseInt(result.rows[0].value);
        logger.info(`[MilestoneListener] Loaded last processed block: ${this.lastProcessedBlock}`);
      } else {
        logger.info(`[MilestoneListener] Starting from block: ${this.lastProcessedBlock}`);
      }
    } catch (error) {
      logger.error('[MilestoneListener] Failed to load checkpoint:', error);
      throw error;
    }
  }

  async syncHistoricalEvents(): Promise<void> {
    logger.info('[MilestoneListener] Starting historical event sync...');

    try {
      const currentBlock = await this.provider.getBlockNumber();
      let fromBlock = this.lastProcessedBlock;

      while (fromBlock < currentBlock) {
        const toBlock = Math.min(fromBlock + eventSyncConfig.batchSize, currentBlock);

        try {
          // Query all relevant events
          const [approvedEvents, stateEvents, assignedEvents] = await Promise.all([
            this.contract.queryFilter(this.contract.filters.MilestoneApproved(), fromBlock, toBlock),
            this.contract.queryFilter(this.contract.filters.ProjectStateChanged(), fromBlock, toBlock),
            this.contract.queryFilter(this.contract.filters.DevelopersAssigned(), fromBlock, toBlock),
          ]);

          for (const event of approvedEvents) {
            await this.processMilestoneApproved(event as ethers.EventLog);
          }

          for (const event of stateEvents) {
            await this.processProjectStateChanged(event as ethers.EventLog);
          }

          for (const event of assignedEvents) {
            await this.processDevelopersAssigned(event as ethers.EventLog);
          }

          fromBlock = toBlock + 1;
          this.lastProcessedBlock = toBlock;
          await this.saveCheckpoint(toBlock);
          this.consecutiveErrors = 0;
        } catch (error) {
          logger.error(`[MilestoneListener] Error syncing blocks ${fromBlock}-${toBlock}:`, error);
          this.consecutiveErrors++;

          if (this.consecutiveErrors >= eventSyncConfig.alertOnErrorCount) {
            await this.alertAdmin(`Historical sync failed after ${this.consecutiveErrors} attempts`);
          }

          await this.sleep(eventSyncConfig.retryDelay);
        }
      }

      logger.info('[MilestoneListener] Historical sync complete');
    } catch (error) {
      logger.error('[MilestoneListener] Historical sync failed:', error);
      throw error;
    }
  }

  startRealTimeListener(): void {
    logger.info('[MilestoneListener] Starting real-time event listener...');

    this.contract.on('MilestoneApproved', async (...args: any[]) => {
      const event = args[args.length - 1] as ethers.EventLog;
      try {
        await this.processMilestoneApproved(event);
        if (event.blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = event.blockNumber;
          await this.saveCheckpoint(event.blockNumber);
        }
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error('[MilestoneListener] Error processing MilestoneApproved:', error);
        this.consecutiveErrors++;
        await this.retryProcessEvent(() => this.processMilestoneApproved(event));
      }
    });

    this.contract.on('ProjectStateChanged', async (...args: any[]) => {
      const event = args[args.length - 1] as ethers.EventLog;
      try {
        await this.processProjectStateChanged(event);
        if (event.blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = event.blockNumber;
          await this.saveCheckpoint(event.blockNumber);
        }
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error('[MilestoneListener] Error processing ProjectStateChanged:', error);
        this.consecutiveErrors++;
        await this.retryProcessEvent(() => this.processProjectStateChanged(event));
      }
    });

    this.contract.on('DevelopersAssigned', async (...args: any[]) => {
      const event = args[args.length - 1] as ethers.EventLog;
      try {
        await this.processDevelopersAssigned(event);
        if (event.blockNumber > this.lastProcessedBlock) {
          this.lastProcessedBlock = event.blockNumber;
          await this.saveCheckpoint(event.blockNumber);
        }
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error('[MilestoneListener] Error processing DevelopersAssigned:', error);
        this.consecutiveErrors++;
        await this.retryProcessEvent(() => this.processDevelopersAssigned(event));
      }
    });

    logger.info('[MilestoneListener] Real-time listener started');
  }

  private async processMilestoneApproved(event: ethers.EventLog): Promise<void> {
    const contractProjectId = event.args[0].toString();
    const milestoneIndex = Number(event.args[1]);
    const developerPayment = event.args[2];
    const platformFee = event.args[3];

    logger.info(`[MilestoneListener] MilestoneApproved: project=${contractProjectId}, milestone=${milestoneIndex}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find the DB project by contract_project_id
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1 AND uses_onchain_milestones = true',
        [contractProjectId]
      );

      if (projectResult.rows.length === 0) {
        logger.warn(`[MilestoneListener] Project not found for contract ID ${contractProjectId}`);
        await client.query('ROLLBACK');
        return;
      }

      const projectId = projectResult.rows[0].id;

      // Find milestone by project_id and on_chain_index
      const paymentAmount = ethers.formatUnits(developerPayment, 6);
      const feeAmount = ethers.formatUnits(platformFee, 6);

      await client.query(
        `UPDATE milestones
         SET status = 'completed',
             payment_amount = $1,
             platform_fee = $2,
             payment_tx_hash = $3,
             paid_at = NOW(),
             completed_at = NOW(),
             updated_at = NOW()
         WHERE project_id = $4 AND on_chain_index = $5`,
        [paymentAmount, feeAmount, event.transactionHash, projectId, milestoneIndex]
      );

      await client.query('COMMIT');
      logger.info(`[MilestoneListener] Milestone ${milestoneIndex} updated for project ${projectId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[MilestoneListener] DB update failed for MilestoneApproved:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async processProjectStateChanged(event: ethers.EventLog): Promise<void> {
    const contractProjectId = event.args[0].toString();
    const newState = Number(event.args[2]);

    // Only handle Completed state from on-chain (state enum: 0=Draft, 1=Active, 2=Completed)
    if (newState !== 2) return;

    logger.info(`[MilestoneListener] ProjectStateChanged to Completed: project=${contractProjectId}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(
        'SELECT id, assigned_developer, client_address, total_budget FROM projects WHERE contract_project_id = $1 AND uses_onchain_milestones = true',
        [contractProjectId]
      );

      if (projectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const project = projectResult.rows[0];

      await client.query(
        `UPDATE projects
         SET status = 'completed',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [project.id]
      );

      // Update developer stats
      if (project.assigned_developer) {
        await client.query(
          `UPDATE developers
           SET projects_completed = projects_completed + 1,
               availability = 'available',
               current_project_id = NULL,
               updated_at = NOW()
           WHERE wallet_address = $1`,
          [project.assigned_developer]
        );
      }

      // Update client stats
      await client.query(
        `UPDATE clients
         SET projects_completed = projects_completed + 1,
             total_spent = total_spent + $1,
             updated_at = NOW()
         WHERE wallet_address = $2`,
        [project.total_budget || 0, project.client_address]
      );

      await client.query('COMMIT');
      logger.info(`[MilestoneListener] Project ${project.id} marked as completed`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[MilestoneListener] DB update failed for ProjectStateChanged:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async processDevelopersAssigned(event: ethers.EventLog): Promise<void> {
    const contractProjectId = event.args[0].toString();
    const developers: string[] = event.args[1];

    logger.info(`[MilestoneListener] DevelopersAssigned: project=${contractProjectId}, devs=${developers.join(',')}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [contractProjectId]
      );

      if (projectResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const projectId = projectResult.rows[0].id;
      const primaryDev = developers[0].toLowerCase();

      await client.query(
        `UPDATE projects
         SET assigned_developer = $1,
             status = 'active',
             assigned_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [primaryDev, projectId]
      );

      // Update developer availability
      for (const dev of developers) {
        await client.query(
          `UPDATE developers
           SET availability = 'busy',
               current_project_id = $1,
               updated_at = NOW()
           WHERE wallet_address = $2`,
          [projectId, dev.toLowerCase()]
        );
      }

      await client.query('COMMIT');
      logger.info(`[MilestoneListener] Developers assigned for project ${projectId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[MilestoneListener] DB update failed for DevelopersAssigned:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async retryProcessEvent(processFn: () => Promise<void>): Promise<void> {
    for (let i = 0; i < eventSyncConfig.retryAttempts; i++) {
      try {
        logger.info(`[MilestoneListener] Retry attempt ${i + 1}`);
        await processFn();
        return;
      } catch (error) {
        const delay = eventSyncConfig.retryDelay * Math.pow(2, i);
        logger.warn(`[MilestoneListener] Retry ${i + 1} failed, waiting ${delay}ms`);
        await this.sleep(delay);
      }
    }

    logger.error(`[MilestoneListener] Failed after ${eventSyncConfig.retryAttempts} retries`);
    await this.alertAdmin('Event processing failed after all retries');
  }

  private async saveCheckpoint(blockNumber: number): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO system_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = NOW()`,
        [CHECKPOINT_KEY, blockNumber.toString()]
      );
    } catch (error) {
      logger.error('[MilestoneListener] Failed to save checkpoint:', error);
    }
  }

  private async alertAdmin(message: string): Promise<void> {
    logger.error(`[MilestoneListener] ADMIN ALERT: ${message}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; lastBlock: number; lag: number }> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const lag = currentBlock - this.lastProcessedBlock;
      return {
        healthy: lag < 100,
        lastBlock: this.lastProcessedBlock,
        lag,
      };
    } catch (error) {
      return { healthy: false, lastBlock: this.lastProcessedBlock, lag: -1 };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async stop(): Promise<void> {
    logger.info('[MilestoneListener] Stopping...');
    this.contract.removeAllListeners();
    logger.info('[MilestoneListener] Stopped');
  }
}

export async function startMilestoneListener(projectManagerAddress: string): Promise<MilestoneEventListener> {
  logger.info('[MilestoneListener] Initializing...');

  if (!projectManagerAddress) {
    throw new Error('PROJECT_MANAGER_ADDRESS is required for milestone listener');
  }

  const listener = new MilestoneEventListener(projectManagerAddress);
  await listener.initialize();
  await listener.syncHistoricalEvents();
  listener.startRealTimeListener();

  setInterval(async () => {
    const health = await listener.healthCheck();
    if (!health.healthy) {
      logger.error('[MilestoneListener] Unhealthy!', health);
    }
  }, eventSyncConfig.healthCheckInterval);

  logger.info('[MilestoneListener] Started successfully');
  return listener;
}
