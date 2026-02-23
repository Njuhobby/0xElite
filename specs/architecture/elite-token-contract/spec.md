# EliteToken Contract Architecture

## Purpose

A soulbound (non-transferable) ERC20Votes governance token that represents developer voting power on the 0xElite platform, weighted by platform earnings and reputation.

## Components

### Component: EliteToken.sol

**Type**: Smart Contract (Solidity)
**Technology**: Solidity 0.8.20, OpenZeppelin Contracts Upgradeable v5
**Responsibility**: Manages non-transferable governance token balances with built-in vote delegation and historical checkpointing.

**Inheritance**:
- `Initializable` (UUPS upgrade pattern)
- `ERC20Upgradeable` (base ERC20)
- `ERC20PermitUpgradeable` (gasless approvals)
- `ERC20VotesUpgradeable` (vote delegation + snapshots)
- `OwnableUpgradeable` (admin functions)
- `UUPSUpgradeable` (upgrade mechanism)

**Key Behavior**:
- `transfer()` and `transferFrom()` -- always revert ("EliteToken: soulbound, non-transferable")
- `mint(address to, uint256 amount)` -- onlyOwner, mints tokens to a developer
- `burn(address from, uint256 amount)` -- onlyOwner, burns tokens from a developer
- `delegate()` -- supported, developers must self-delegate to activate voting power
- `clock()` -- returns `block.timestamp` (timestamp-based, for L2 compatibility)
- `CLOCK_MODE()` -- returns "mode=timestamp"

**Interfaces**:
- Standard ERC20 read interface (balanceOf, totalSupply)
- ERC20Votes interface (getVotes, getPastVotes, getPastTotalSupply, delegates)
- Admin interface (mint, burn)

**Dependencies**:
- OpenZeppelin Contracts Upgradeable v5 (`@openzeppelin/contracts-upgradeable`)
- ERC1967Proxy for deployment

**Configuration**:
- Token name: "0xElite Governance"
- Token symbol: "xELITE"
- Decimals: 6 (matches USDC for consistency with voting power formula)
- Owner: Backend service wallet (same as other contract owners)

**Voting Power Formula** (computed off-chain by backend):
```
voting_power = total_earned_usdc x (average_rating / 5.0)
```
- `total_earned_usdc`: Developer's cumulative milestone payments (from DB, USDC 6 decimals)
- `average_rating`: 1.0 to 5.0 scale (from reviews)
- Result is minted as token amount with 6 decimals

**Events**:
- `Transfer(from, to, amount)` -- standard ERC20, only emitted on mint (from=0x0) and burn (to=0x0)
- `DelegateChanged(delegator, fromDelegate, toDelegate)` -- when delegation changes
- `DelegateVotesChanged(delegate, previousVotes, newVotes)` -- when vote power changes

**Security Considerations**:
- Soulbound enforcement: override `_update()` to revert on transfers between non-zero addresses
- Only owner (backend wallet) can mint/burn -- centralization tradeoff accepted for MVP
- All mint/burn operations are on-chain and auditable
- Historical snapshots prevent flash-mint attacks on voting

## Design Decisions

### Decision: Soulbound (Non-transferable) Token

**Status**: Accepted

**Context**: Voting power must reflect genuine platform contribution. If transferable, a wealthy actor could buy voting power to influence disputes.

**Decision**: Override `_update()` to revert on transfers between non-zero addresses. Only mint (from 0x0) and burn (to 0x0) are allowed.

**Consequences**:
- Voting power cannot be bought, sold, or borrowed
- Backend is sole authority for adjusting balances
- Cannot use DEX liquidity or token markets (intentional)

### Decision: Timestamp-based Clock Mode

**Status**: Accepted

**Context**: 0xElite will deploy on L2 networks where block times are irregular. ERC-6372 recommends timestamp mode for L2s.

**Decision**: Override `clock()` to return `block.timestamp` and `CLOCK_MODE()` to return "mode=timestamp".

**Consequences**:
- Compatible with all L2 chains
- DisputeDAO deadline calculations use timestamps consistently
- Snapshot queries use timestamps (getPastVotes with timestamp parameter)

### Decision: 6 Decimal Places

**Status**: Accepted

**Context**: Voting power is derived from USDC earnings (6 decimals). Using 18 decimals would require scaling.

**Decision**: Use 6 decimals to match USDC precision directly.

**Consequences**:
- `total_earned` in USDC maps 1:1 to token base units (before rating multiplier)
- Simpler backend logic -- no decimal conversion needed

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **Architecture**: `architecture/dispute-dao-contract/spec.md`
- **Data Models**: `data-models/developer/schema.md`
