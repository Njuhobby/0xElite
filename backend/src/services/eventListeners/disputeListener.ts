import { ethers } from 'ethers';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { eventSyncConfig } from '../../config/eventSync';

const DISPUTE_DAO_ABI = [
  'event DisputeCreated(uint256 indexed disputeId, uint256 indexed projectId, address indexed initiator)',
  'event EvidenceSubmitted(uint256 indexed disputeId, address indexed party, string evidenceURI)',
  'event VotingStarted(uint256 indexed disputeId, uint256 votingDeadline, uint256 votingSnapshot)',
  'event VoteCast(uint256 indexed disputeId, address indexed voter, bool supportClient, uint256 weight)',
  'event DisputeResolved(uint256 indexed disputeId, bool clientWon, uint256 clientShare, uint256 developerShare)',
  'event DisputeResolvedByOwner(uint256 indexed disputeId, bool clientWon)',
  'function getDisputeCore(uint256) external view returns (uint256, address, address, address, uint8, bool, bool, uint256)',
  'function getDisputeTimeline(uint256) external view returns (string, string, uint256, uint256, uint256)',
  'function getDisputeVoting(uint256) external view returns (uint256, uint256, uint256, uint256)',
];

const CHECKPOINT_KEY = 'dispute_listener_checkpoint';

export class DisputeEventListener {
  private provider: ethers.WebSocketProvider | ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private db: Pool;
  private lastProcessedBlock: number = 0;
  private consecutiveErrors: number = 0;
  private isRunning: boolean = false;
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor(db: Pool) {
    this.db = db;
    const disputeDAOAddress = process.env.DISPUTE_DAO_ADDRESS;
    if (!disputeDAOAddress) {
      throw new Error('DISPUTE_DAO_ADDRESS environment variable is required');
    }

    if (eventSyncConfig.rpcUrl.startsWith('ws')) {
      this.provider = new ethers.WebSocketProvider(eventSyncConfig.rpcUrl);
    } else {
      this.provider = new ethers.JsonRpcProvider(eventSyncConfig.rpcUrl);
    }
    this.contract = new ethers.Contract(disputeDAOAddress, DISPUTE_DAO_ABI, this.provider);
  }

  async initialize(): Promise<void> {
    const checkpoint = await this.loadCheckpoint();
    this.lastProcessedBlock = checkpoint;
    logger.info(`DisputeListener initialized at block ${this.lastProcessedBlock}`);
  }

  async syncHistoricalEvents(): Promise<void> {
    logger.info('DisputeListener: Starting historical event sync...');

    const currentBlock = await this.provider.getBlockNumber();
    let fromBlock = this.lastProcessedBlock;

    while (fromBlock < currentBlock) {
      const toBlock = Math.min(fromBlock + eventSyncConfig.batchSize, currentBlock);

      try {
        const events = await this.contract.queryFilter('*' as any, fromBlock, toBlock);
        logger.info(`DisputeListener: Found ${events.length} events in blocks ${fromBlock}-${toBlock}`);

        for (const event of events) {
          await this.processEvent(event as ethers.EventLog);
        }

        fromBlock = toBlock + 1;
        this.lastProcessedBlock = toBlock;
        await this.saveCheckpoint(toBlock);
        this.consecutiveErrors = 0;
      } catch (error) {
        logger.error(`DisputeListener: Error syncing blocks ${fromBlock}-${toBlock}:`, error);
        this.consecutiveErrors++;
        await this.sleep(eventSyncConfig.retryDelay);
      }
    }

    logger.info('DisputeListener: Historical sync complete');
  }

  startRealTimeListener(): void {
    this.isRunning = true;

    if (this.provider instanceof ethers.WebSocketProvider) {
      logger.info('DisputeListener: Starting real-time WebSocket listener...');

      this.contract.on('*', async (event: ethers.EventLog) => {
        if (!this.isRunning) return;
        try {
          await this.processEvent(event);
          if (event.blockNumber > this.lastProcessedBlock) {
            this.lastProcessedBlock = event.blockNumber;
            await this.saveCheckpoint(event.blockNumber);
          }
          this.consecutiveErrors = 0;
        } catch (error) {
          logger.error('DisputeListener: Error processing real-time event:', error);
          this.consecutiveErrors++;
        }
      });

      // Auto-reconnect on WebSocket disconnect
      this.provider.on('error', async (error) => {
        logger.error('DisputeListener: WebSocket error:', error);
        logger.info('DisputeListener: Attempting to reconnect...');
        await this.stop();
        setTimeout(() => {
          this.isRunning = true;
          this.startRealTimeListener();
        }, 5000);
      });
    } else {
      logger.info('DisputeListener: Starting real-time polling...');

      this.pollingTimer = setInterval(async () => {
        if (!this.isRunning) return;

        try {
          const currentBlock = await this.provider.getBlockNumber();
          if (currentBlock <= this.lastProcessedBlock) return;

          const fromBlock = this.lastProcessedBlock + 1;
          const toBlock = Math.min(fromBlock + eventSyncConfig.batchSize, currentBlock);

          const events = await this.contract.queryFilter('*' as any, fromBlock, toBlock);

          for (const event of events) {
            await this.processEvent(event as ethers.EventLog);
          }

          this.lastProcessedBlock = toBlock;
          await this.saveCheckpoint(toBlock);
          this.consecutiveErrors = 0;
        } catch (error) {
          logger.error('DisputeListener: Polling error:', error);
          this.consecutiveErrors++;
        }
      }, eventSyncConfig.pollingInterval);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.contract.removeAllListeners();
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    logger.info('DisputeListener: Stopped');
  }

  private async processEvent(event: ethers.EventLog): Promise<void> {
    if (!event.eventName) return;

    switch (event.eventName) {
      case 'DisputeCreated':
        await this.handleDisputeCreated(event);
        break;
      case 'EvidenceSubmitted':
        await this.handleEvidenceSubmitted(event);
        break;
      case 'VotingStarted':
        await this.handleVotingStarted(event);
        break;
      case 'VoteCast':
        await this.handleVoteCast(event);
        break;
      case 'DisputeResolved':
        await this.handleDisputeResolved(event);
        break;
      case 'DisputeResolvedByOwner':
        await this.handleDisputeResolvedByOwner(event);
        break;
    }
  }

  private async handleDisputeCreated(event: ethers.EventLog): Promise<void> {
    const [disputeId, projectId, initiator] = event.args!;
    const txHash = event.transactionHash;
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get on-chain dispute data
      const [, clientAddr, devAddr, initiatorAddr] = await this.contract.getDisputeCore(disputeId);
      const [clientEvidence, devEvidence, evidenceDeadline] = await this.contract.getDisputeTimeline(disputeId);

      // Find the project in our DB
      const projectResult = await client.query(
        'SELECT id FROM projects WHERE chain_project_id = $1',
        [projectId.toString()]
      );

      if (projectResult.rows.length === 0) {
        logger.warn(`DisputeListener: Project not found for chain ID ${projectId}`);
        await client.query('ROLLBACK');
        return;
      }

      const dbProjectId = projectResult.rows[0].id;
      const initiatorAddress = initiatorAddr.toLowerCase();
      const clientAddress = clientAddr.toLowerCase();
      const isClient = initiatorAddress === clientAddress;

      await client.query(
        `INSERT INTO disputes (
          project_id, client_address, developer_address, initiator_address,
          initiator_role, status, client_evidence_uri, developer_evidence_uri,
          evidence_deadline, arbitration_fee, chain_dispute_id, creation_tx_hash
        ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, 50.000000, $9, $10)
        ON CONFLICT (project_id) WHERE status != 'resolved' DO NOTHING`,
        [
          dbProjectId,
          clientAddr.toLowerCase(),
          devAddr.toLowerCase(),
          initiatorAddress,
          isClient ? 'client' : 'developer',
          clientEvidence || null,
          devEvidence || null,
          new Date(Number(evidenceDeadline) * 1000),
          Number(disputeId),
          txHash,
        ]
      );

      await client.query('COMMIT');
      logger.info(`DisputeListener: DisputeCreated #${disputeId} for project ${projectId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('DisputeListener: Error handling DisputeCreated:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async handleEvidenceSubmitted(event: ethers.EventLog): Promise<void> {
    const [disputeId, party, evidenceURI] = event.args!;

    try {
      const dispute = await this.db.query(
        'SELECT id, client_address FROM disputes WHERE chain_dispute_id = $1',
        [Number(disputeId)]
      );

      if (dispute.rows.length === 0) return;

      const isClient = party.toLowerCase() === dispute.rows[0].client_address;
      const field = isClient ? 'client_evidence_uri' : 'developer_evidence_uri';

      await this.db.query(
        `UPDATE disputes SET ${field} = $1 WHERE chain_dispute_id = $2`,
        [evidenceURI, Number(disputeId)]
      );

      logger.info(`DisputeListener: Evidence submitted for dispute #${disputeId}`);
    } catch (error) {
      logger.error('DisputeListener: Error handling EvidenceSubmitted:', error);
      throw error;
    }
  }

  private async handleVotingStarted(event: ethers.EventLog): Promise<void> {
    const [disputeId, votingDeadline, votingSnapshot] = event.args!;

    try {
      // Get total supply snapshot from contract
      const [, , , snapshotTotalSupply] = await this.contract.getDisputeVoting(disputeId);
      const quorumRequired = (Number(snapshotTotalSupply) * 25) / 100;

      await this.db.query(
        `UPDATE disputes SET
          status = 'voting',
          voting_deadline = $1,
          voting_snapshot = $2,
          quorum_required = $3
        WHERE chain_dispute_id = $4`,
        [
          new Date(Number(votingDeadline) * 1000),
          new Date(Number(votingSnapshot) * 1000),
          (quorumRequired / 1e6).toFixed(6), // Convert from raw to decimal
          Number(disputeId),
        ]
      );

      logger.info(`DisputeListener: Voting started for dispute #${disputeId}`);
    } catch (error) {
      logger.error('DisputeListener: Error handling VotingStarted:', error);
      throw error;
    }
  }

  private async handleVoteCast(event: ethers.EventLog): Promise<void> {
    const [disputeId, voter, supportClient, weight] = event.args!;
    const txHash = event.transactionHash;
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Find dispute
      const disputeResult = await client.query(
        'SELECT id FROM disputes WHERE chain_dispute_id = $1',
        [Number(disputeId)]
      );

      if (disputeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const dbDisputeId = disputeResult.rows[0].id;
      const voteWeight = (Number(weight) / 1e6).toFixed(6);

      // Insert vote
      await client.query(
        `INSERT INTO dispute_votes (dispute_id, voter_address, support_client, vote_weight, tx_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (dispute_id, voter_address) DO NOTHING`,
        [dbDisputeId, voter.toLowerCase(), supportClient, voteWeight, txHash]
      );

      // Update dispute vote tallies
      if (supportClient) {
        await client.query(
          'UPDATE disputes SET client_vote_weight = client_vote_weight + $1, total_vote_weight = total_vote_weight + $1 WHERE id = $2',
          [voteWeight, dbDisputeId]
        );
      } else {
        await client.query(
          'UPDATE disputes SET developer_vote_weight = developer_vote_weight + $1, total_vote_weight = total_vote_weight + $1 WHERE id = $2',
          [voteWeight, dbDisputeId]
        );
      }

      await client.query('COMMIT');
      logger.info(`DisputeListener: Vote cast on dispute #${disputeId} by ${voter}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('DisputeListener: Error handling VoteCast:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async handleDisputeResolved(event: ethers.EventLog): Promise<void> {
    const [disputeId, clientWon, clientShare, developerShare] = event.args!;
    const txHash = event.transactionHash;

    try {
      await this.db.query(
        `UPDATE disputes SET
          status = 'resolved',
          winner = $1,
          resolved_by_owner = false,
          client_share = $2,
          developer_share = $3,
          resolution_tx_hash = $4
        WHERE chain_dispute_id = $5`,
        [
          clientWon ? 'client' : 'developer',
          (Number(clientShare) / 1e6).toFixed(6),
          (Number(developerShare) / 1e6).toFixed(6),
          txHash,
          Number(disputeId),
        ]
      );

      logger.info(`DisputeListener: Dispute #${disputeId} resolved - ${clientWon ? 'client' : 'developer'} won`);
    } catch (error) {
      logger.error('DisputeListener: Error handling DisputeResolved:', error);
      throw error;
    }
  }

  private async handleDisputeResolvedByOwner(event: ethers.EventLog): Promise<void> {
    const [disputeId, clientWon] = event.args!;
    const txHash = event.transactionHash;

    try {
      await this.db.query(
        `UPDATE disputes SET
          status = 'resolved',
          winner = $1,
          resolved_by_owner = true,
          resolution_tx_hash = $2
        WHERE chain_dispute_id = $3`,
        [
          clientWon ? 'client' : 'developer',
          txHash,
          Number(disputeId),
        ]
      );

      logger.info(`DisputeListener: Dispute #${disputeId} resolved by owner - ${clientWon ? 'client' : 'developer'} won`);
    } catch (error) {
      logger.error('DisputeListener: Error handling DisputeResolvedByOwner:', error);
      throw error;
    }
  }

  private async loadCheckpoint(): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT value FROM system_state WHERE key = $1',
        [CHECKPOINT_KEY]
      );

      if (result.rows.length > 0) {
        const data = JSON.parse(result.rows[0].value);
        return data.lastProcessedBlock || eventSyncConfig.startBlock;
      }
    } catch (error) {
      logger.error('DisputeListener: Error loading checkpoint:', error);
    }

    return eventSyncConfig.startBlock;
  }

  private async saveCheckpoint(block: number): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO system_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [CHECKPOINT_KEY, JSON.stringify({ lastProcessedBlock: block, updatedAt: new Date().toISOString() })]
      );
    } catch (error) {
      logger.error('DisputeListener: Error saving checkpoint:', error);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; lastBlock: number; consecutiveErrors: number }> {
    return {
      healthy: this.consecutiveErrors < eventSyncConfig.alertOnErrorCount,
      lastBlock: this.lastProcessedBlock,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DisputeEventListener;
