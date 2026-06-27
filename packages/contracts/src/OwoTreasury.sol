// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title OwoTreasury
/// @notice Owo-owned liquidity float: counterparty of last resort that buys G$ from
///         sellers when no peer is available and supplies G$ to buyers / merchant
///         settlement. Governed by a Safe multisig (owner). No single hot key moves
///         principal; an operator can only act within on-chain caps.
///
/// @dev Sprint 1 establishes the controls surface (caps, daily volume window, pause).
///      Pricing/rebalancing/hedging live off-chain in the Treasury/Liquidity service
///      (Section 5) and act through `operator` within these bounds.
contract OwoTreasury is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice The G$ token held as inventory.
    IERC20 public immutable gdollar;

    /// @notice Stable leg used for rebalancing/hedging (e.g. cUSD/USDC on Celo).
    IERC20 public immutable stable;

    /// @notice Backend key allowed to move funds within caps (KMS-backed). Principal
    ///         changes (sweeps, withdrawals) require the multisig owner.
    address public operator;

    /// @notice Max G$ that may leave the treasury in a single operator transaction.
    uint256 public maxPerTx;

    /// @notice Rolling 24h cap on G$ outflow via the operator.
    uint256 public dailyOutflowCap;

    uint256 public windowStart;
    uint256 public windowOutflow;

    event OperatorUpdated(address indexed operator);
    event CapsUpdated(uint256 maxPerTx, uint256 dailyOutflowCap);
    event GdollarSupplied(address indexed to, uint256 amount);
    event StableMoved(address indexed to, uint256 amount);

    error NotOperator();
    error ZeroAddress();
    error ExceedsPerTx();
    error ExceedsDailyCap();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(
        address gdollar_,
        address stable_,
        address operator_,
        uint256 maxPerTx_,
        uint256 dailyOutflowCap_,
        address owner_
    ) Ownable(owner_) {
        if (gdollar_ == address(0) || stable_ == address(0) || operator_ == address(0)) {
            revert ZeroAddress();
        }
        gdollar = IERC20(gdollar_);
        stable = IERC20(stable_);
        operator = operator_;
        maxPerTx = maxPerTx_;
        dailyOutflowCap = dailyOutflowCap_;
        windowStart = block.timestamp;
    }

    /// @notice Operator supplies G$ from inventory to a buyer/merchant within caps.
    function supplyGdollar(address to, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyOperator
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount > maxPerTx) revert ExceedsPerTx();
        _accrueOutflow(amount);
        gdollar.safeTransfer(to, amount);
        emit GdollarSupplied(to, amount);
    }

    /// @notice Owner (multisig) moves the stable leg for rebalancing/hedging. Principal-level.
    function moveStable(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        stable.safeTransfer(to, amount);
        emit StableMoved(to, amount);
    }

    /// @notice Owner (multisig) withdraws principal — full-trust, multisig-gated path.
    function sweep(IERC20 asset, address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        asset.safeTransfer(to, amount);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function setCaps(uint256 maxPerTx_, uint256 dailyOutflowCap_) external onlyOwner {
        maxPerTx = maxPerTx_;
        dailyOutflowCap = dailyOutflowCap_;
        emit CapsUpdated(maxPerTx_, dailyOutflowCap_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _accrueOutflow(uint256 amount) internal {
        if (block.timestamp >= windowStart + 1 days) {
            windowStart = block.timestamp;
            windowOutflow = 0;
        }
        uint256 next = windowOutflow + amount;
        if (next > dailyOutflowCap) revert ExceedsDailyCap();
        windowOutflow = next;
    }
}
