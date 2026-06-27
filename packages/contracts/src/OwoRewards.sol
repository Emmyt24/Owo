// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title OwoRewards
/// @notice Auditable on-chain grant of Engagement Rewards (first-spend, referral) in G$.
///         The off-chain Rewards service performs uniqueness + anti-abuse gating, then the
///         isolated `granter` key calls {grant}. On-chain idempotency keys make every grant
///         replay-safe and auditable, removing off-chain reward-accounting disputes.
contract OwoRewards is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice The G$ token this contract pays rewards in (funded by treasury/owner).
    IERC20 public immutable gdollar;

    /// @notice Backend key allowed to issue grants within caps (KMS-backed).
    address public granter;

    /// @notice Max G$ payable in a single grant (bounds blast radius of a leaked key).
    uint256 public maxGrant;

    /// @notice Idempotency: a grant id can only ever be paid once.
    mapping(bytes32 => bool) public granted;

    event Granted(bytes32 indexed grantId, address indexed to, uint256 amount, bytes32 reason);
    event GranterUpdated(address indexed granter);
    event MaxGrantUpdated(uint256 maxGrant);

    error NotGranter();
    error ZeroAddress();
    error AlreadyGranted();
    error ExceedsMaxGrant();

    modifier onlyGranter() {
        if (msg.sender != granter) revert NotGranter();
        _;
    }

    constructor(address gdollar_, address granter_, uint256 maxGrant_, address owner_)
        Ownable(owner_)
    {
        if (gdollar_ == address(0) || granter_ == address(0)) revert ZeroAddress();
        gdollar = IERC20(gdollar_);
        granter = granter_;
        maxGrant = maxGrant_;
    }

    /// @notice Pay a fraud-gated reward. `grantId` must be unique (idempotent); `reason`
    ///         tags the action (e.g. keccak("first_spend"), keccak("referral")).
    function grant(bytes32 grantId, address to, uint256 amount, bytes32 reason)
        external
        nonReentrant
        whenNotPaused
        onlyGranter
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount > maxGrant) revert ExceedsMaxGrant();
        if (granted[grantId]) revert AlreadyGranted();
        granted[grantId] = true;
        gdollar.safeTransfer(to, amount);
        emit Granted(grantId, to, amount, reason);
    }

    function setGranter(address granter_) external onlyOwner {
        if (granter_ == address(0)) revert ZeroAddress();
        granter = granter_;
        emit GranterUpdated(granter_);
    }

    function setMaxGrant(uint256 maxGrant_) external onlyOwner {
        maxGrant = maxGrant_;
        emit MaxGrantUpdated(maxGrant_);
    }

    /// @notice Owner (multisig) reclaims unused reward inventory.
    function sweep(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        gdollar.safeTransfer(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
