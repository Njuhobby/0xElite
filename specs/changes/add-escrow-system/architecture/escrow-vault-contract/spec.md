# EscrowVault Smart Contract Architecture

## Purpose

Provides on-chain escrow management for project funds using USDC, enabling secure milestone-based payments with freeze capability for dispute resolution.

## System Context

```
┌──────────────┐
│   Client     │
│   Wallet     │
└──────┬───────┘
       │ USDC.approve() + deposit()
       ↓
┌────────────────────┐
│  EscrowVault.sol   │
│   (Arbitrum)       │
│                    │
│  - deposit()       │
│  - release()       │◄─── ProjectManager.sol (on milestone approval)
│  - releaseFee()    │
│  - freeze()        │◄─── DisputeDAO.sol (on dispute)
│  - resolveDispute()│
└──────┬─────────────┘
       │ Events: Deposited, Released, FeesCollected, Frozen, etc.
       ↓
┌──────────────────┐      ┌─────────────┐
│ Backend Listener │─────→│  PostgreSQL │
│   (Node.js)      │      │  (escrow +  │
│                  │      │   payments) │
└──────────────────┘      └─────────────┘
```

## Components

### Component: EscrowVault Contract

**Type**: Smart Contract
**Technology**: Solidity ^0.8.20, OpenZeppelin Contracts v5
**Network**: Arbitrum One (mainnet), Arbitrum Sepolia (testnet)
**Responsibility**: Manages USDC escrow deposits and milestone-based payment releases with dispute freeze capability

**Interfaces**:

```solidity
interface IEscrowVault {
    struct EscrowInfo {
        uint256 projectId;
        address client;
        uint256 totalAmount;
        uint256 releasedAmount;
        bool disputed;
    }

    function deposit(uint256 projectId, uint256 amount) external returns (bool);
    function release(uint256 projectId, address developer, uint256 amount) external returns (bool);
    function releaseFee(uint256 projectId, uint256 feeAmount) external returns (bool);
    function freeze(uint256 projectId) external returns (bool);
    function unfreeze(uint256 projectId) external returns (bool);
    function resolveDispute(uint256 projectId, address developer, uint256 clientShare, uint256 developerShare) external returns (bool);
    function getEscrowInfo(uint256 projectId) external view returns (EscrowInfo memory);

    event Deposited(uint256 indexed projectId, address indexed client, uint256 amount, uint256 timestamp);
    event Released(uint256 indexed projectId, address indexed developer, uint256 amount, uint256 timestamp);
    event FeesCollected(uint256 indexed projectId, address indexed treasury, uint256 feeAmount, uint256 timestamp);
    event Frozen(uint256 indexed projectId, address indexed frozenBy, uint256 timestamp);
    event Unfrozen(uint256 indexed projectId, uint256 timestamp);
    event DisputeResolved(uint256 indexed projectId, uint256 clientShare, uint256 developerShare, uint256 timestamp);
}
```

**Dependencies**:
- **USDC Token**: ERC20 stablecoin contract on Arbitrum (0x...)
- **ProjectManager.sol**: Authorized to call release() and releaseFee()
- **DisputeDAO.sol**: Authorized to call freeze(), unfreeze(), resolveDispute() (Spec 5)
- **OpenZeppelin**: Ownable, ReentrancyGuard, SafeERC20

**Configuration**:
- Environment variables: USDC_TOKEN_ADDRESS, PROJECT_MANAGER_ADDRESS, TREASURY_ADDRESS, DISPUTE_DAO_ADDRESS
- Access control: Only ProjectManager can release funds, only DisputeDAO can freeze/resolve
- Gas optimization: Minimize storage writes, use events for off-chain indexing

**State Variables**:
```solidity
IERC20 public usdcToken;
address public projectManager;
address public disputeDAO;
address public treasury;
mapping(uint256 => EscrowInfo) public escrows;
```

**Security Features**:
- **ReentrancyGuard**: Prevents reentrancy attacks on release functions
- **Access Control**: onlyProjectManager, onlyDisputeDAO modifiers
- **SafeERC20**: Uses OpenZeppelin SafeERC20 for safe USDC transfers
- **Balance Validation**: Ensures releases don't exceed deposited amounts
- **Freeze Check**: Prevents releases when escrow is frozen

**Key Functions**:

#### deposit(uint256 projectId, uint256 amount)
- Transfers USDC from client to contract
- Creates EscrowInfo record
- Emits Deposited event
- Requirements: Client must approve USDC first, projectId must not already have escrow

#### release(uint256 projectId, address developer, uint256 amount)
- Transfers USDC to developer
- Updates releasedAmount
- Emits Released event
- Requirements: Only ProjectManager, escrow not frozen, sufficient balance

#### releaseFee(uint256 projectId, uint256 feeAmount)
- Transfers USDC to treasury
- Updates releasedAmount
- Emits FeesCollected event
- Requirements: Only ProjectManager, escrow not frozen

#### freeze(uint256 projectId)
- Sets disputed flag to true
- Emits Frozen event
- Requirements: Only DisputeDAO, not already frozen

#### resolveDispute(uint256 projectId, address developer, uint256 clientShare, uint256 developerShare)
- Distributes remaining funds per dispute ruling
- Sets disputed flag to false
- Emits DisputeResolved event
- Requirements: Only DisputeDAO, escrow must be frozen

**Scaling**: Stateless contract, horizontally scalable via multiple instances of backend listeners

**Monitoring**:
- Event indexing: All events indexed by backend listener
- Metrics: deposit_count, release_count, total_value_locked, freeze_count
- Alerts: failed_releases, balance_mismatches, unauthorized_access_attempts

**Gas Costs** (estimated):
- deposit(): ~70,000 gas
- release(): ~50,000 gas
- releaseFee(): ~40,000 gas
- freeze(): ~30,000 gas
- resolveDispute(): ~80,000 gas

## Design Decisions

### Decision: Use USDC Only (No Native ETH)

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
Need to choose whether escrow supports USDC stablecoins, native ETH, or both.

**Decision**:
Support USDC only for all escrow deposits and payments.

**Consequences**:
- ✅ Price stability (no volatility risk for developers expecting $X but ETH price drops)
- ✅ Simpler accounting (all amounts in USD, no conversion needed)
- ✅ Consistent with stake mechanism (developers already hold USDC for staking)
- ✅ Easier fee calculations (platform fee in stable USD terms)
- ⚠️ Clients must acquire USDC before depositing (extra step)
- ⚠️ Gas costs paid in ETH separately (users need both USDC and ETH)

**Alternatives Considered**:
1. **Native ETH support**: Rejected due to price volatility risk
2. **Multi-token support (USDC + DAI + USDT)**: Rejected to keep initial implementation simple

### Decision: Atomic Releases (Developer + Fee in One Transaction)

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
Should developer payment and platform fee be released in one transaction or separately?

**Decision**:
Use separate release() and releaseFee() calls, but both executed atomically in backend.

**Consequences**:
- ✅ Clear separation of developer payment vs platform fee (better accounting)
- ✅ Separate events for better analytics
- ✅ Flexibility to adjust fee collection timing if needed
- ⚠️ Higher gas cost (two USDC transfers instead of one)
- ⚠️ Backend must ensure both succeed or both fail (transaction safety)

**Alternatives Considered**:
1. **Single releaseWithFee() function**: Rejected to maintain clearer event logs
2. **Deferred fee collection**: Rejected to avoid accumulating uncollected fees

### Decision: Freeze Instead of Pause

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
How to handle disputes? Global pause or per-project freeze?

**Decision**:
Implement per-project freeze functionality (not global pause).

**Consequences**:
- ✅ Disputes don't affect other projects (isolated impact)
- ✅ More granular control (freeze only disputed escrows)
- ✅ Better user experience (non-disputed projects continue normally)
- ⚠️ More complex than global pause (per-project state)

**Alternatives Considered**:
1. **Global pause**: Rejected due to collateral damage to unrelated projects
2. **No freeze mechanism**: Rejected as disputes need fund protection

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Deposit confirmation | < 30 seconds | Time from tx broadcast to event detection |
| Release transaction | < 30 seconds | Time from milestone approval to payment |
| Event processing lag | < 5 minutes | Max delay from blockchain event to DB update |
| Gas efficiency | < 100k gas | Per release operation (developer + fee) |
| Contract availability | 99.9% | Uptime (dependent on Arbitrum network) |

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`
- **APIs**: `api/escrow-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`, `data-models/payment-history/schema.md`
- **Architecture**: `architecture/escrow-event-listener/spec.md`
