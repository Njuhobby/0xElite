# Escrow Event Listener Service Architecture

## Purpose

Background service that listens to EscrowVault blockchain events and synchronizes escrow state with the PostgreSQL database for real-time payment tracking.

## System Context

```
┌────────────────────┐
│  EscrowVault.sol   │
│   (Arbitrum)       │
└──────┬─────────────┘
       │ Emits events:
       │ - Deposited
       │ - Released
       │ - FeesCollected
       │ - Frozen
       │ - Unfrozen
       │ - DisputeResolved
       ↓
┌──────────────────────────┐
│ Escrow Event Listener    │
│ (Background Service)     │
│                          │
│ - Polls/subscribes events│
│ - Validates events       │
│ - Updates database       │
│ - Checkpoints progress   │
└──────┬───────────────────┘
       │ Updates tables:
       │ - escrow_deposits
       │ - payment_history
       │ - milestones (paid_at)
       │ - projects (escrow_balance)
       ↓
┌─────────────┐
│ PostgreSQL  │
└─────────────┘
```

## Components

### Component: Escrow Event Listener

**Type**: Background Service
**Technology**: Node.js 20 + TypeScript + ethers.js v6
**Responsibility**: Synchronizes EscrowVault events to database in real-time with checkpoint recovery

**Interfaces**:
- Blockchain RPC connection (WebSocket preferred for real-time events)
- PostgreSQL connection pool
- Internal checkpoint storage (system_state table)

**Dependencies**:
- **Arbitrum RPC**: WebSocket endpoint (wss://arb1.arbitrum.io/rpc or Infura/Alchemy)
- **PostgreSQL**: Database connection for writes
- **ethers.js v6**: Event listening and parsing
- **EscrowVault ABI**: Contract interface for event decoding

**Configuration**:
```typescript
interface EscrowListenerConfig {
  rpcUrl: string;                    // WSS endpoint for Arbitrum
  escrowVaultAddress: string;        // EscrowVault contract address
  startBlock: number;                // Block to start listening from
  pollInterval: number;              // Polling interval if WSS unavailable (ms)
  batchSize: number;                 // Events to process in one batch
  checkpointInterval: number;        // Save checkpoint every N blocks
  retryAttempts: number;             // Max retries for failed operations
  retryDelay: number;                // Delay between retries (ms)
}
```

**Event Handlers**:

#### Deposited(projectId, client, amount, timestamp)
```typescript
async function handleDeposited(event: DepositedEvent) {
  await db.transaction(async (trx) => {
    // 1. Create escrow_deposits record
    await trx('escrow_deposits').insert({
      project_id: findProjectByContractId(event.projectId),
      contract_project_id: event.projectId,
      total_deposited: event.amount,
      total_released: 0,
      deposit_tx_hash: event.transactionHash,
    });

    // 2. Update projects table
    await trx('projects')
      .where('contract_project_id', event.projectId)
      .update({
        escrow_deposited: true,
        escrow_deposit_tx_hash: event.transactionHash,
        escrow_deposited_at: new Date(event.timestamp * 1000),
        status: 'active',
      });

    // 3. Create payment_history entry
    await trx('payment_history').insert({
      project_id: findProjectByContractId(event.projectId),
      transaction_type: 'deposit',
      amount: event.amount,
      from_address: event.client,
      to_address: escrowVaultAddress,
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      block_timestamp: new Date(event.timestamp * 1000),
    });
  });
}
```

#### Released(projectId, developer, amount, timestamp)
```typescript
async function handleReleased(event: ReleasedEvent) {
  await db.transaction(async (trx) => {
    // 1. Find associated milestone (most recent pending_review for this project)
    const milestone = await trx('milestones')
      .where('project_id', findProjectByContractId(event.projectId))
      .where('status', 'pending_review')
      .orderBy('submitted_at', 'desc')
      .first();

    // 2. Update milestone payment info
    await trx('milestones')
      .where('id', milestone.id)
      .update({
        payment_amount: event.amount,
        payment_tx_hash: event.transactionHash,
        paid_at: new Date(event.timestamp * 1000),
      });

    // 3. Update escrow_deposits
    await trx('escrow_deposits')
      .where('contract_project_id', event.projectId)
      .increment('total_released', event.amount);

    // 4. Create payment_history entry
    await trx('payment_history').insert({
      project_id: milestone.project_id,
      milestone_id: milestone.id,
      transaction_type: 'release',
      amount: event.amount,
      from_address: escrowVaultAddress,
      to_address: event.developer,
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      block_timestamp: new Date(event.timestamp * 1000),
      developer_payment: event.amount,
    });
  });
}
```

#### FeesCollected(projectId, treasury, feeAmount, timestamp)
```typescript
async function handleFeesCollected(event: FeesCollectedEvent) {
  await db.transaction(async (trx) => {
    // 1. Find associated milestone
    const milestone = await findMilestoneForFeeEvent(event);

    // 2. Update milestone platform_fee
    await trx('milestones')
      .where('id', milestone.id)
      .update({ platform_fee: event.feeAmount });

    // 3. Update escrow_deposits
    await trx('escrow_deposits')
      .where('contract_project_id', event.projectId)
      .increment('total_released', event.feeAmount);

    // 4. Create payment_history entry
    await trx('payment_history').insert({
      project_id: milestone.project_id,
      milestone_id: milestone.id,
      transaction_type: 'fee_collection',
      amount: event.feeAmount,
      from_address: escrowVaultAddress,
      to_address: event.treasury,
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      block_timestamp: new Date(event.timestamp * 1000),
      platform_fee: event.feeAmount,
    });
  });
}
```

#### Frozen(projectId, frozenBy, timestamp)
```typescript
async function handleFrozen(event: FrozenEvent) {
  await db.transaction(async (trx) => {
    // 1. Update escrow_deposits
    await trx('escrow_deposits')
      .where('contract_project_id', event.projectId)
      .update({
        is_frozen: true,
        frozen_at: new Date(event.timestamp * 1000),
        frozen_by: event.frozenBy,
      });

    // 2. Create payment_history entry
    await trx('payment_history').insert({
      project_id: findProjectByContractId(event.projectId),
      transaction_type: 'freeze',
      amount: 0,
      from_address: event.frozenBy,
      to_address: escrowVaultAddress,
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      block_timestamp: new Date(event.timestamp * 1000),
      notes: 'Escrow frozen due to dispute',
    });
  });
}
```

**Checkpoint Recovery**:
```typescript
interface Checkpoint {
  lastProcessedBlock: number;
  lastProcessedTxIndex: number;
  updatedAt: Date;
}

async function saveCheckpoint(block: number, txIndex: number) {
  await db('system_state')
    .where('key', 'escrow_listener_checkpoint')
    .update({
      value: JSON.stringify({ lastProcessedBlock: block, lastProcessedTxIndex: txIndex }),
      updated_at: new Date(),
    });
}

async function loadCheckpoint(): Promise<Checkpoint> {
  const record = await db('system_state')
    .where('key', 'escrow_listener_checkpoint')
    .first();
  return record ? JSON.parse(record.value) : { lastProcessedBlock: startBlock, lastProcessedTxIndex: 0 };
}

async function resumeFromCheckpoint() {
  const checkpoint = await loadCheckpoint();
  console.log(`Resuming from block ${checkpoint.lastProcessedBlock}`);
  startListening(checkpoint.lastProcessedBlock);
}
```

**Error Handling**:
- **Network failures**: Exponential backoff retry (1s, 2s, 4s, 8s, 16s max)
- **Database failures**: Retry with transaction rollback, alert on repeated failures
- **Event parsing errors**: Log error, skip event, continue processing (with alert)
- **Duplicate events**: Use tx_hash uniqueness constraint to prevent duplicate inserts

**Monitoring**:
- Health check endpoint: GET /health/escrow-listener
- Metrics: events_processed_count, processing_lag_seconds, error_count, last_checkpoint_block
- Alerts: processing_stopped > 5min, error_rate > 5%, db_connection_lost

**Startup Sequence**:
1. Connect to database
2. Connect to Arbitrum RPC
3. Load checkpoint from system_state
4. Query missed events from checkpoint to current block
5. Process missed events in batches
6. Start real-time event subscription
7. Save checkpoint every 100 blocks

**Scaling**: Single instance (stateful checkpoint), can shard by project range if needed

## Design Decisions

### Decision: WebSocket vs Polling

**Status**: Accepted (with fallback)
**Date**: 2024-01-25

**Context**:
Choose between WebSocket subscription for real-time events or HTTP polling.

**Decision**:
Use WebSocket subscription with HTTP polling as fallback.

**Consequences**:
- ✅ Lower latency (real-time event detection vs polling delay)
- ✅ Lower RPC costs (no repeated getLogs calls)
- ✅ More responsive payment confirmations
- ⚠️ WebSocket connection can drop (need reconnection logic)
- ⚠️ Fallback to polling if WebSocket unavailable

**Alternatives Considered**:
1. **HTTP polling only**: Rejected due to higher latency and costs
2. **WebSocket only**: Rejected as not all RPC providers support it reliably

### Decision: Transactional Event Processing

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
Should each event update multiple tables atomically or allow partial updates?

**Decision**:
Wrap all database updates for each event in a single transaction.

**Consequences**:
- ✅ Data consistency (all updates succeed or none do)
- ✅ No partial state corruption
- ✅ Easier error recovery (rollback on failure)
- ⚠️ Slightly higher database load (transaction overhead)

**Alternatives Considered**:
1. **Individual updates**: Rejected due to inconsistency risk
2. **Event sourcing**: Rejected as too complex for current needs

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Event detection lag | < 30 seconds | Time from blockchain to listener receiving event |
| Database update lag | < 5 seconds | Time from event received to DB committed |
| Checkpoint frequency | Every 100 blocks | ~5 minutes on Arbitrum (~2s block time) |
| Error recovery | < 1 minute | Time to recover from crash and resume |
| Throughput | 100 events/second | Max processing rate |

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`
- **APIs**: `api/escrow-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`, `data-models/payment-history/schema.md`
- **Architecture**: `architecture/escrow-vault-contract/spec.md`
