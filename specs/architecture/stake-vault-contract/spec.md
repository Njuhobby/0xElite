# StakeVault Smart Contract Architecture

## Purpose

Provides an on-chain staking mechanism for developers to prove economic commitment and prevent Sybil attacks by requiring USDC deposits.

## System Context

```
┌──────────────┐
│   Frontend   │
│  (Next.js)   │
└──────┬───────┘
       │ Web3 (wagmi)
       ↓
┌──────────────────┐      ┌─────────────┐
│  StakeVault.sol  │─────→│  USDC Token │
│   (Arbitrum)     │      │  (ERC-20)   │
└──────┬───────────┘      └─────────────┘
       │ Events
       ↓
┌──────────────────┐
│ Backend Listener │
│   (Node.js)      │
└──────────────────┘
```

## Components

### Component: StakeVault Contract

**Type**: Smart Contract
**Blockchain**: Ethereum-compatible (Sepolia testnet, Arbitrum mainnet)
**Language**: Solidity ^0.8.20
**Responsibility**: Manages USDC stake deposits and withdrawals for developer membership

**Contract Interface**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract StakeVault is Ownable, ReentrancyGuard {
    /// @notice USDC token contract
    IERC20 public immutable stakeToken;

    /// @notice Required minimum stake amount in USDC (6 decimals)
    uint256 public requiredStake;

    /// @notice Mapping of developer addresses to their staked amounts
    mapping(address => uint256) public stakes;

    /// @notice Mapping of developer addresses to stake timestamps
    mapping(address => uint256) public stakedAt;

    /// @notice Emitted when a developer stakes USDC
    /// @param developer Address of the developer who staked
    /// @param amount Amount of USDC staked (in token base units)
    event Staked(address indexed developer, uint256 amount);

    /// @notice Emitted when a developer unstakes USDC
    /// @param developer Address of the developer who unstaked
    /// @param amount Amount of USDC unstaked
    event Unstaked(address indexed developer, uint256 amount);

    /// @notice Emitted when the required stake amount is updated
    /// @param oldAmount Previous required stake
    /// @param newAmount New required stake
    event RequiredStakeUpdated(uint256 oldAmount, uint256 newAmount);

    /// @param _stakeToken Address of USDC token contract
    /// @param _requiredStake Initial required stake amount (e.g., 150 * 10^6 for 150 USDC)
    constructor(address _stakeToken, uint256 _requiredStake) {
        stakeToken = IERC20(_stakeToken);
        requiredStake = _requiredStake;
    }

    /// @notice Stake USDC to become a developer member
    /// @param amount Amount of USDC to stake (must be >= requiredStake)
    function stake(uint256 amount) external nonReentrant {
        require(amount >= requiredStake, "Amount below required stake");
        require(stakeToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        stakes[msg.sender] += amount;
        stakedAt[msg.sender] = block.timestamp;

        emit Staked(msg.sender, amount);
    }

    /// @notice Withdraw staked USDC (future: implement unlock conditions)
    /// @param amount Amount to withdraw
    function unstake(uint256 amount) external nonReentrant {
        require(stakes[msg.sender] >= amount, "Insufficient stake");

        stakes[msg.sender] -= amount;
        require(stakeToken.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    /// @notice Get current stake for a developer
    /// @param developer Address to query
    /// @return Current staked amount
    function getStake(address developer) external view returns (uint256) {
        return stakes[developer];
    }

    /// @notice Update required stake amount (owner only)
    /// @param newAmount New required stake amount
    function setRequiredStake(uint256 newAmount) external onlyOwner {
        uint256 oldAmount = requiredStake;
        requiredStake = newAmount;
        emit RequiredStakeUpdated(oldAmount, newAmount);
    }
}
```

**Key Design Decisions**:

1. **Immutable Stake Token**: The USDC token address is set in constructor and cannot be changed. This prevents rug-pull scenarios where the owner could switch to a worthless token.

2. **Cumulative Staking**: Developers can call `stake()` multiple times to add to their stake. This allows incremental staking if they want to increase their commitment.

3. **No Automatic Unstaking**: The contract does not automatically enforce unstaking conditions (e.g., "must complete 10 projects"). This is enforced off-chain by the backend refusing unstake requests until conditions are met.

4. **ReentrancyGuard**: Protects against reentrancy attacks on stake/unstake functions.

5. **Ownable**: Platform owner can adjust `requiredStake` if economic conditions change (e.g., USDC price volatility, market rates).

**Dependencies**:
- OpenZeppelin Contracts v5.0+
  - `Ownable.sol` (access control)
  - `ReentrancyGuard.sol` (reentrancy protection)
  - `IERC20.sol` (token interface)
- USDC token contract (Arbitrum: 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8)

**Configuration**:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `stakeToken` | USDC contract address | Sepolia testnet: mock USDC, Arbitrum: official USDC |
| `requiredStake` | 150 * 10^6 | 150 USDC (6 decimals) |

**Gas Optimization**:
- Use `immutable` for `stakeToken` (saves SLOAD)
- Batch events instead of individual emits (not applicable here)
- Minimal storage updates

**Security Considerations**:
- ✅ Reentrancy protection via `nonReentrant`
- ✅ Integer overflow protection (Solidity 0.8+ built-in)
- ✅ Access control on `setRequiredStake`
- ✅ Safe ERC20 transfer checks
- ⚠️ No emergency pause mechanism (consider adding)
- ⚠️ No time-lock on ownership transfer (consider adding)

**Testing Requirements**:
- Unit tests with Foundry
- Fuzz testing for edge cases (very large stakes, zero amounts)
- Integration tests with mock USDC
- Testnet deployment and manual testing

**Deployment Plan**:
1. Deploy mock USDC to Sepolia testnet
2. Deploy StakeVault with mock USDC address
3. Verify contract on Etherscan
4. Test stake/unstake flows
5. Deploy to Arbitrum mainnet (use official USDC)

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Gas cost (stake) | < 100,000 gas | Includes USDC transfer approval |
| Gas cost (unstake) | < 80,000 gas | Transfer back to user |
| Transaction confirmation | < 15 seconds | On Arbitrum (L2) |

## Monitoring

**Contract Events**:
- Track `Staked` events → update backend database
- Track `Unstaked` events → update stake amounts
- Track `RequiredStakeUpdated` → notify admin

**Alerts**:
- Large stake (> 10,000 USDC) → notify admin
- Unstake within 24 hours of staking → potential abuse
- Failed stake transactions → investigate user issues

## Related Specs

- **Capabilities**: `capabilities/developer-onboarding/spec.md`
- **Data Models**: `data-models/developer/schema.md`
- **APIs**: `api/developer-management/spec.md`
- **Architecture**: `architecture/event-sync-system/spec.md`
- **RFCs**: [RFC-002](../../../../rfcs/RFC-002-sybil-prevention.md), [RFC-004](../../../../rfcs/RFC-004-data-architecture.md)
