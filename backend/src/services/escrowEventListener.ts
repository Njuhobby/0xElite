import { ethers } from 'ethers';
import { Pool } from 'pg';
import escrowVaultAbi from '../contracts/EscrowVault.json';

interface EscrowListenerConfig {
  rpcUrl: string;
  escrowVaultAddress: string;
  startBlock: number;
  pollInterval: number; // ms
  batchSize: number;
  checkpointInterval: number; // blocks
}

interface Checkpoint {
  lastProcessedBlock: number;
  lastProcessedTxIndex: number;
  updatedAt: Date;
}

interface DepositedEvent {
  projectId: bigint;
  client: string;
  amount: bigint;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

interface ReleasedEvent {
  projectId: bigint;
  developer: string;
  amount: bigint;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

interface FeesCollectedEvent {
  projectId: bigint;
  treasury: string;
  feeAmount: bigint;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

interface FrozenEvent {
  projectId: bigint;
  frozenBy: string;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

interface UnfrozenEvent {
  projectId: bigint;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

interface DisputeResolvedEvent {
  projectId: bigint;
  clientShare: bigint;
  developerShare: bigint;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: number;
}

export class EscrowEventListener {
  private provider: ethers.WebSocketProvider | ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private db: Pool;
  private config: EscrowListenerConfig;
  private isRunning: boolean = false;
  private currentBlock: number = 0;

  constructor(db: Pool, config: EscrowListenerConfig) {
    this.db = db;
    this.config = config;

    // Initialize provider (prefer WebSocket, fallback to HTTP)
    if (config.rpcUrl.startsWith('ws')) {
      this.provider = new ethers.WebSocketProvider(config.rpcUrl);
    } else {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    }

    // Initialize contract
    this.contract = new ethers.Contract(
      config.escrowVaultAddress,
      escrowVaultAbi,
      this.provider
    );
  }

  /**
   * Start listening to events
   */
  async start(): Promise<void> {
    console.log('[EscrowListener] Starting event listener...');

    // Load checkpoint
    const checkpoint = await this.loadCheckpoint();
    this.currentBlock = checkpoint.lastProcessedBlock;

    console.log(`[EscrowListener] Resuming from block ${this.currentBlock}`);

    // Process missed events from checkpoint to current
    await this.processMissedEvents(checkpoint.lastProcessedBlock);

    // Start real-time listening
    this.isRunning = true;
    await this.startRealtimeListening();
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    console.log('[EscrowListener] Stopping event listener...');
    this.isRunning = false;
    await this.provider.destroy();
  }

  /**
   * Process missed events from checkpoint to current block
   */
  private async processMissedEvents(fromBlock: number): Promise<void> {
    try {
      const latestBlock = await this.provider.getBlockNumber();
      console.log(`[EscrowListener] Processing missed events from ${fromBlock} to ${latestBlock}`);

      // Process in batches to avoid RPC limits
      for (let start = fromBlock; start <= latestBlock; start += this.config.batchSize) {
        const end = Math.min(start + this.config.batchSize - 1, latestBlock);

        // Query all events in this range
        const events = await this.contract.queryFilter('*', start, end);

        for (const event of events) {
          await this.processEvent(event);
        }

        // Save checkpoint
        if ((end - fromBlock) % this.config.checkpointInterval === 0) {
          await this.saveCheckpoint(end, 0);
        }
      }

      console.log('[EscrowListener] Finished processing missed events');
    } catch (error) {
      console.error('[EscrowListener] Error processing missed events:', error);
      throw error;
    }
  }

  /**
   * Start real-time event listening
   */
  private async startRealtimeListening(): Promise<void> {
    console.log('[EscrowListener] Starting real-time event listening...');

    // Listen to all events
    this.contract.on('*', async (event) => {
      if (!this.isRunning) return;

      try {
        await this.processEvent(event);
        await this.saveCheckpoint(event.blockNumber, event.transactionIndex);
      } catch (error) {
        console.error('[EscrowListener] Error processing real-time event:', error);
      }
    });

    // Fallback: Poll for events if WebSocket disconnects
    if (this.provider instanceof ethers.WebSocketProvider) {
      this.provider.on('error', async (error) => {
        console.error('[EscrowListener] WebSocket error:', error);
        console.log('[EscrowListener] Attempting to reconnect...');
        await this.stop();
        setTimeout(() => this.start(), 5000); // Retry after 5s
      });
    }
  }

  /**
   * Process a single blockchain event
   */
  private async processEvent(event: ethers.EventLog): Promise<void> {
    try {
      switch (event.eventName) {
        case 'Deposited':
          await this.handleDeposited(event as unknown as DepositedEvent);
          break;
        case 'Released':
          await this.handleReleased(event as unknown as ReleasedEvent);
          break;
        case 'FeesCollected':
          await this.handleFeesCollected(event as unknown as FeesCollectedEvent);
          break;
        case 'Frozen':
          await this.handleFrozen(event as unknown as FrozenEvent);
          break;
        case 'Unfrozen':
          await this.handleUnfrozen(event as unknown as UnfrozenEvent);
          break;
        case 'DisputeResolved':
          await this.handleDisputeResolved(event as unknown as DisputeResolvedEvent);
          break;
        default:
          console.log(`[EscrowListener] Unknown event: ${event.eventName}`);
      }
    } catch (error) {
      console.error(`[EscrowListener] Error processing ${event.eventName}:`, error);
      throw error;
    }
  }

  /**
   * Handle Deposited event
   */
  private async handleDeposited(event: DepositedEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project by contract_project_id
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const projectId = projectResult.rows[0].id;
      const amountUsdc = this.formatUSDC(event.amount);

      // Create escrow_deposits record
      await client.query(
        `INSERT INTO escrow_deposits (
          project_id, contract_project_id, total_deposited, total_released, deposit_tx_hash
        ) VALUES ($1, $2, $3, 0, $4)
        ON CONFLICT (project_id) DO NOTHING`,
        [projectId, event.projectId.toString(), amountUsdc, event.transactionHash]
      );

      // Update projects table
      await client.query(
        `UPDATE projects SET
          escrow_deposited = true,
          escrow_deposit_tx_hash = $1,
          escrow_deposited_at = $2,
          status = 'active'
        WHERE id = $3 AND escrow_deposited = false`,
        [event.transactionHash, new Date(Number(event.timestamp) * 1000), projectId]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp
        ) VALUES ($1, 'deposit', $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          projectId,
          amountUsdc,
          event.client,
          this.config.escrowVaultAddress,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed Deposited: project ${event.projectId}, amount ${amountUsdc} USDC`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle Released event
   */
  private async handleReleased(event: ReleasedEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const projectId = projectResult.rows[0].id;
      const amountUsdc = this.formatUSDC(event.amount);

      // Find most recent pending_review milestone (payment association)
      const milestoneResult = await client.query(
        `SELECT id, budget FROM milestones
        WHERE project_id = $1 AND status = 'pending_review' AND paid_at IS NULL
        ORDER BY submitted_at DESC LIMIT 1`,
        [projectId]
      );

      let milestoneId = null;
      if (milestoneResult.rows.length > 0) {
        milestoneId = milestoneResult.rows[0].id;

        // Update milestone payment info
        await client.query(
          `UPDATE milestones SET
            payment_amount = $1,
            payment_tx_hash = $2,
            paid_at = $3
          WHERE id = $4`,
          [amountUsdc, event.transactionHash, new Date(Number(event.timestamp) * 1000), milestoneId]
        );
      }

      // Update escrow_deposits
      await client.query(
        `UPDATE escrow_deposits SET
          total_released = total_released + $1,
          updated_at = NOW()
        WHERE project_id = $2`,
        [amountUsdc, projectId]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, milestone_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp, developer_payment
        ) VALUES ($1, $2, 'release', $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          projectId,
          milestoneId,
          amountUsdc,
          this.config.escrowVaultAddress,
          event.developer,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
          amountUsdc,
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed Released: project ${event.projectId}, amount ${amountUsdc} USDC to ${event.developer}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle FeesCollected event
   */
  private async handleFeesCollected(event: FeesCollectedEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const projectId = projectResult.rows[0].id;
      const feeAmount = this.formatUSDC(event.feeAmount);

      // Find milestone (match by recent payment_history release)
      const milestoneResult = await client.query(
        `SELECT milestone_id FROM payment_history
        WHERE project_id = $1 AND transaction_type = 'release'
        ORDER BY block_timestamp DESC LIMIT 1`,
        [projectId]
      );

      let milestoneId = milestoneResult.rows.length > 0 ? milestoneResult.rows[0].milestone_id : null;

      if (milestoneId) {
        // Update milestone platform_fee
        await client.query(
          `UPDATE milestones SET platform_fee = $1 WHERE id = $2`,
          [feeAmount, milestoneId]
        );
      }

      // Update escrow_deposits
      await client.query(
        `UPDATE escrow_deposits SET
          total_released = total_released + $1,
          updated_at = NOW()
        WHERE project_id = $2`,
        [feeAmount, projectId]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, milestone_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp, platform_fee
        ) VALUES ($1, $2, 'fee_collection', $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          projectId,
          milestoneId,
          feeAmount,
          this.config.escrowVaultAddress,
          event.treasury,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
          feeAmount,
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed FeesCollected: project ${event.projectId}, fee ${feeAmount} USDC`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle Frozen event
   */
  private async handleFrozen(event: FrozenEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const projectId = projectResult.rows[0].id;

      // Update escrow_deposits
      await client.query(
        `UPDATE escrow_deposits SET
          is_frozen = true,
          frozen_at = $1,
          frozen_by = $2,
          updated_at = NOW()
        WHERE project_id = $3`,
        [new Date(Number(event.timestamp) * 1000), event.frozenBy, projectId]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp, notes
        ) VALUES ($1, 'freeze', 0, $2, $3, $4, $5, $6, 'Escrow frozen due to dispute')
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          projectId,
          event.frozenBy,
          this.config.escrowVaultAddress,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed Frozen: project ${event.projectId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle Unfrozen event
   */
  private async handleUnfrozen(event: UnfrozenEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const projectId = projectResult.rows[0].id;

      // Update escrow_deposits
      await client.query(
        `UPDATE escrow_deposits SET
          is_frozen = false,
          frozen_at = NULL,
          frozen_by = NULL,
          updated_at = NOW()
        WHERE project_id = $1`,
        [projectId]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp, notes
        ) VALUES ($1, 'unfreeze', 0, $2, $3, $4, $5, $6, 'Escrow unfrozen after dispute resolution')
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          projectId,
          this.config.escrowVaultAddress,
          this.config.escrowVaultAddress,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed Unfrozen: project ${event.projectId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle DisputeResolved event
   */
  private async handleDisputeResolved(event: DisputeResolvedEvent): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find project
      const projectResult = await client.query(
        'SELECT id, client_address, assigned_developer FROM projects WHERE contract_project_id = $1',
        [event.projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        throw new Error(`Project not found for contract_project_id: ${event.projectId}`);
      }

      const project = projectResult.rows[0];
      const clientShare = this.formatUSDC(event.clientShare);
      const developerShare = this.formatUSDC(event.developerShare);
      const totalResolved = parseFloat(clientShare) + parseFloat(developerShare);

      // Update escrow_deposits
      await client.query(
        `UPDATE escrow_deposits SET
          total_released = total_released + $1,
          is_frozen = false,
          frozen_at = NULL,
          frozen_by = NULL,
          updated_at = NOW()
        WHERE project_id = $2`,
        [totalResolved.toFixed(6), project.id]
      );

      // Create payment_history entry
      await client.query(
        `INSERT INTO payment_history (
          project_id, transaction_type, amount, from_address, to_address,
          tx_hash, block_number, block_timestamp, notes
        ) VALUES ($1, 'dispute_resolution', $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tx_hash) DO NOTHING`,
        [
          project.id,
          totalResolved.toFixed(6),
          this.config.escrowVaultAddress,
          project.client_address,
          event.transactionHash,
          event.blockNumber,
          new Date(Number(event.timestamp) * 1000),
          `Dispute resolved: client ${clientShare} USDC, developer ${developerShare} USDC`,
        ]
      );

      await client.query('COMMIT');
      console.log(`[EscrowListener] Processed DisputeResolved: project ${event.projectId}, client ${clientShare}, developer ${developerShare}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load checkpoint from database
   */
  private async loadCheckpoint(): Promise<Checkpoint> {
    try {
      const result = await this.db.query(
        `SELECT value FROM system_state WHERE key = 'escrow_listener_checkpoint'`
      );

      if (result.rows.length > 0) {
        const checkpoint = JSON.parse(result.rows[0].value);
        return {
          lastProcessedBlock: checkpoint.lastProcessedBlock,
          lastProcessedTxIndex: checkpoint.lastProcessedTxIndex,
          updatedAt: new Date(checkpoint.updatedAt),
        };
      }

      // No checkpoint, start from config startBlock
      return {
        lastProcessedBlock: this.config.startBlock,
        lastProcessedTxIndex: 0,
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('[EscrowListener] Error loading checkpoint:', error);
      return {
        lastProcessedBlock: this.config.startBlock,
        lastProcessedTxIndex: 0,
        updatedAt: new Date(),
      };
    }
  }

  /**
   * Save checkpoint to database
   */
  private async saveCheckpoint(block: number, txIndex: number): Promise<void> {
    try {
      const checkpoint = {
        lastProcessedBlock: block,
        lastProcessedTxIndex: txIndex,
        updatedAt: new Date().toISOString(),
      };

      await this.db.query(
        `INSERT INTO system_state (key, value, updated_at)
        VALUES ('escrow_listener_checkpoint', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(checkpoint)]
      );

      this.currentBlock = block;
    } catch (error) {
      console.error('[EscrowListener] Error saving checkpoint:', error);
    }
  }

  /**
   * Format USDC amount from wei (6 decimals)
   */
  private formatUSDC(amount: bigint): string {
    return (Number(amount) / 1e6).toFixed(6);
  }
}

// Export factory function
export function createEscrowEventListener(db: Pool, config: EscrowListenerConfig): EscrowEventListener {
  return new EscrowEventListener(db, config);
}
