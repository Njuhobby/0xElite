// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StakeVault
 * @notice Manages USDC stake deposits for developer membership on 0xElite platform
 * @dev Implements staking mechanism with minimum stake requirements and event emission
 */
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
    constructor(address _stakeToken, uint256 _requiredStake) Ownable(msg.sender) {
        require(_stakeToken != address(0), "Invalid token address");
        require(_requiredStake > 0, "Required stake must be positive");

        stakeToken = IERC20(_stakeToken);
        requiredStake = _requiredStake;
    }

    /// @notice Stake USDC to become a developer member
    /// @param amount Amount of USDC to stake (first stake must be >= requiredStake)
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");

        // Only check minimum stake for first-time stakers
        if (stakes[msg.sender] == 0) {
            require(amount >= requiredStake, "Amount below required stake");
        }

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
        require(newAmount > 0, "Required stake must be positive");

        uint256 oldAmount = requiredStake;
        requiredStake = newAmount;

        emit RequiredStakeUpdated(oldAmount, newAmount);
    }
}
