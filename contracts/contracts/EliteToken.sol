// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title EliteToken
 * @notice Soulbound (non-transferable) ERC20Votes governance token for 0xElite platform
 * @dev Voting power = total_earned × (average_rating / 5.0), computed off-chain by backend.
 *      Backend mints/burns to keep balances in sync with platform data.
 *      Uses timestamp-based clock mode for L2 compatibility (ERC-6372).
 */
contract EliteToken is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    /// @notice Error when attempting to transfer soulbound tokens
    error SoulboundTransferDisabled();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     */
    function initialize() public initializer {
        __ERC20_init("0xElite Governance", "xELITE");
        __ERC20Permit_init("0xElite Governance");
        __ERC20Votes_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Returns 6 decimals to match USDC precision
     * @dev Voting power derived from USDC earnings maps 1:1 to token base units
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Timestamp-based clock for L2 compatibility (ERC-6372)
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @notice Clock mode descriptor (ERC-6372)
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    /**
     * @notice Mint governance tokens to a developer
     * @param to Developer address
     * @param amount Amount to mint (in 6-decimal units)
     * @dev Only callable by owner (backend service wallet)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn governance tokens from a developer
     * @param from Developer address
     * @param amount Amount to burn (in 6-decimal units)
     * @dev Only callable by owner (backend service wallet)
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @notice Override _update to enforce soulbound (non-transferable) behavior
     * @dev Only mint (from == 0) and burn (to == 0) are allowed. All other transfers revert.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        // Allow mint (from == 0) and burn (to == 0), block everything else
        if (from != address(0) && to != address(0)) {
            revert SoulboundTransferDisabled();
        }
        super._update(from, to, value);
    }

    /**
     * @notice Override nonces for ERC20Permit compatibility
     */
    function nonces(
        address owner_
    ) public view override(ERC20PermitUpgradeable, NoncesUpgradeable) returns (uint256) {
        return super.nonces(owner_);
    }

    /**
     * @notice Authorize upgrade to new implementation
     * @dev Only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Get the current implementation version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
