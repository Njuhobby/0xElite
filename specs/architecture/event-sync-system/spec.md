# Event Synchronization System Architecture

## Purpose

Listens to blockchain events from smart contracts and synchronizes on-chain data (stakes, transactions) with the off-chain backend database for fast querying and business logic.

## System Context

```
┌──────────────────────┐
│   Blockchain Node    │
│   (RPC Provider)     │
└──────────┬───────────┘
           │ WebSocket / Polling
           ↓
┌──────────────────────────────────┐
│     Event Listener Service       │
│         (Node.js)                │
│  ┌────────────────────────────┐  │
│  │  StakeVault Listener       │  │
│  │  (listens to Staked events)│  │
│  └────────────────────────────┘  │
└──────────┬───────────────────────┘
           │ Database writes
           ↓
┌──────────────────────┐
│   PostgreSQL DB      │
│   (developers table) │
└──────────────────────┘
```

## Components

### Component: Event Listener Service

**Type**: Backend Service (Daemon)
**Technology**: Node.js 20 + ethers.js v6
**Responsibility**: Continuously listen to blockchain events and update database state

**Process Lifecycle**:

```
1. Service starts
   ↓
2. Connect to RPC provider (Alchemy/Infura)
   ↓
3. Sync historical events (from last processed block)
   ↓
4. Start real-time listener (WebSocket or polling)
   ↓
5. On event received → Process → Update DB
   ↓
6. On error → Log → Retry → Alert if persistent
```

**Configuration**:

```typescript
// config/eventSync.ts
export const eventSyncConfig = {
  // RPC provider
  rpcUrl: process.env.RPC_URL || 'https://arb-sepolia.g.alchemy.com/v2/...',
  rpcType: 'websocket' as 'websocket' | 'polling',
  pollingInterval: 12000, // 12 seconds (if using polling)

  // Contract addresses
  stakeVaultAddress: process.env.STAKE_VAULT_ADDRESS!,

  // Sync settings
  startBlock: parseInt(process.env.START_BLOCK || '0'), // Block to start syncing from
  batchSize: 1000, // Events to fetch per batch during historical sync
  confirmations: 2, // Wait for N confirmations before processing

  // Retry settings
  retryAttempts: 3,
  retryDelay: 5000, // 5 seconds

  // Monitoring
  healthCheckInterval: 30000, // 30 seconds
  alertOnErrorCount: 5, // Alert if 5 errors in a row
};
```

**Implementation**:

```typescript
// services/eventListeners/stakeListener.ts
import { ethers } from 'ethers';
import { StakeVault__factory } from '@/contracts/types';
import { db } from '@/db';
import { logger } from '@/utils/logger';
import { eventSyncConfig } from '@/config/eventSync';

export class StakeEventListener {
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private lastProcessedBlock: number;

  constructor() {
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(eventSyncConfig.rpcUrl);

    // Initialize contract
    this.contract = StakeVault__factory.connect(
      eventSyncConfig.stakeVaultAddress,
      this.provider
    );

    this.lastProcessedBlock = eventSyncConfig.startBlock;
  }

  /**
   * Sync historical events from lastProcessedBlock to current
   */
  async syncHistoricalEvents(): Promise<void> {
    logger.info('Starting historical event sync...');

    const currentBlock = await this.provider.getBlockNumber();
    let fromBlock = this.lastProcessedBlock;

    while (fromBlock < currentBlock) {
      const toBlock = Math.min(fromBlock + eventSyncConfig.batchSize, currentBlock);

      logger.info(`Syncing blocks ${fromBlock} to ${toBlock}`);

      const events = await this.contract.queryFilter(
        this.contract.filters.Staked(),
        fromBlock,
        toBlock
      );

      for (const event of events) {
        await this.processStakedEvent(event);
      }

      fromBlock = toBlock + 1;
      this.lastProcessedBlock = toBlock;
      await this.saveCheckpoint(toBlock);
    }

    logger.info('Historical sync complete');
  }

  /**
   * Start listening to new events in real-time
   */
  startRealTimeListener(): void {
    logger.info('Starting real-time event listener...');

    this.contract.on('Staked', async (developer: string, amount: bigint, event) => {
      logger.info(`Received Staked event: ${developer} staked ${amount}`);

      try {
        // Wait for confirmations
        await event.wait(eventSyncConfig.confirmations);

        // Process event
        await this.processStakedEvent(event);

        // Update checkpoint
        this.lastProcessedBlock = event.blockNumber;
        await this.saveCheckpoint(event.blockNumber);
      } catch (error) {
        logger.error('Error processing Staked event:', error);
        await this.retryProcessEvent(event);
      }
    });

    logger.info('Real-time listener started');
  }

  /**
   * Process a Staked event and update database
   */
  private async processStakedEvent(event: ethers.EventLog): Promise<void> {
    const { developer, amount } = event.args!;
    const developerAddress = developer.toLowerCase();

    logger.info(`Processing stake for ${developerAddress}: ${amount}`);

    try {
      // Update developer record
      const updated = await db.developers.update(
        { walletAddress: developerAddress },
        {
          stakeAmount: ethers.formatUnits(amount, 6), // USDC has 6 decimals
          stakedAt: new Date(),
          status: 'active', // Activate account
          updatedAt: new Date(),
        }
      );

      if (!updated) {
        logger.warn(`Developer ${developerAddress} not found in database`);
        return;
      }

      // Send welcome email (async, don't wait)
      this.sendWelcomeEmail(developerAddress).catch((err) => {
        logger.error('Failed to send welcome email:', err);
      });

      logger.info(`Successfully activated developer ${developerAddress}`);
    } catch (error) {
      logger.error(`Database update failed for ${developerAddress}:`, error);
      throw error; // Re-throw to trigger retry
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
        await new Promise((resolve) => setTimeout(resolve, delay));
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
    await db.systemState.upsert(
      { key: 'last_processed_block_stake_vault' },
      { value: blockNumber.toString(), updatedAt: new Date() }
    );
  }

  /**
   * Send welcome email to newly activated developer
   */
  private async sendWelcomeEmail(developerAddress: string): Promise<void> {
    const developer = await db.developers.findOne({ walletAddress: developerAddress });
    if (!developer || !developer.email) return;

    // TODO: Implement email service
    logger.info(`Sending welcome email to ${developer.email}`);
  }

  /**
   * Alert admin about persistent errors
   */
  private async alertAdmin(message: string): Promise<void> {
    // TODO: Implement alerting (email, Slack, PagerDuty)
    logger.error(`ADMIN ALERT: ${message}`);
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{ healthy: boolean; lastBlock: number }> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const lag = currentBlock - this.lastProcessedBlock;

      return {
        healthy: lag < 100, // Unhealthy if more than 100 blocks behind
        lastBlock: this.lastProcessedBlock,
      };
    } catch (error) {
      return { healthy: false, lastBlock: this.lastProcessedBlock };
    }
  }
}

// Initialize and start listener
export async function startEventListeners() {
  const stakeListener = new StakeEventListener();

  // Sync historical events first
  await stakeListener.syncHistoricalEvents();

  // Start real-time listener
  stakeListener.startRealTimeListener();

  // Health check interval
  setInterval(async () => {
    const health = await stakeListener.healthCheck();
    if (!health.healthy) {
      logger.error('Event listener unhealthy!', health);
    }
  }, eventSyncConfig.healthCheckInterval);

  logger.info('Event listeners started successfully');
}
```

**Error Handling**:

| Error Type | Handling |
|------------|----------|
| RPC connection failure | Retry with exponential backoff, alert after 5 failures |
| Event processing failure | Retry 3 times, log error, continue |
| Database write failure | Retry with backoff, store event in dead-letter queue |
| Provider rate limit | Implement request throttling, use backup provider |

**Monitoring**:

```typescript
// Metrics to track
interface EventSyncMetrics {
  eventsProcessed: number;
  eventsFailed: number;
  lastProcessedBlock: number;
  processingLatency: number; // ms between event emission and DB update
  rpcErrors: number;
  dbErrors: number;
}
```

**Alerts**:
- Event listener stopped/crashed → Immediate alert
- Processing lag > 100 blocks → Warning
- 5+ consecutive errors → Critical alert
- RPC provider down → Switch to backup provider

**Recovery Procedure**:

If the service crashes:
1. Service restarts (via PM2 or Docker restart policy)
2. Load `last_processed_block` from database
3. Sync from `last_processed_block + 1` to current
4. Resume real-time listening

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Event processing latency | < 2 seconds | From block confirmation to DB update |
| Historical sync speed | 1000 events/min | During initial sync |
| Memory usage | < 512 MB | Per listener instance |
| Uptime | 99.9% | With auto-restart on failure |

## Scaling Considerations

- **Horizontal scaling**: Each listener handles one contract type (StakeVault, ProjectManager, etc.)
- **Load balancing**: Not needed (single instance per contract is sufficient)
- **High availability**: Run on multiple nodes with leader election (Redis-based)

## Related Specs

- **Capabilities**: `capabilities/developer-onboarding/spec.md`
- **Data Models**: `data-models/developer/schema.md`
- **Architecture**: `architecture/stake-vault-contract/spec.md`
- **RFCs**: [RFC-004](../../../../rfcs/RFC-004-data-architecture.md)
