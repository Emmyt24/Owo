// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC677Receiver} from "./interfaces/IERC677.sol";

/// @title OwoEscrow
/// @notice Holds a seller's G$ during a P2P G$->Naira trade and releases it to the
///         buyer once the off-chain Naira payment is attested, or refunds the seller
///         on timeout/dispute. Owo never custodies the G$ leg: each trade is isolated
///         and funds can only move along the state machine the seller initiated.
///
/// @dev State machine (per trade):
///   CREATED -> FUNDED -> LOCKED -> RELEASED   (happy path)
///                  \        \-> DISPUTED -> RELEASED | REFUNDED (arbiter)
///                   \-> REFUNDED            (timeout / cancel)
///
///      v1 uses an operator-attestation release model: the off-chain Payout service
///      verifies the Naira receipt, then the isolated `confirmationSigner` calls
///      `release()`. v2 can tighten this toward verifiable webhook proofs / arbiter set.
contract OwoEscrow is IERC677Receiver, ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    enum State {
        NONE,
        FUNDED,
        LOCKED,
        RELEASED,
        REFUNDED,
        DISPUTED
    }

    struct Trade {
        address seller;
        address buyer; // set on lock
        uint256 amount; // G$ held in escrow for this trade
        uint64 lockDeadline; // buyer must pay Naira before this (0 until locked)
        State state;
    }

    /// @notice The G$ (ERC-677) token this escrow holds.
    IERC20 public immutable token;

    /// @notice Isolated backend key allowed to attest payment and release funds.
    address public confirmationSigner;

    /// @notice Receives the protocol fee (in G$) on release. Typically OwoTreasury.
    address public feeRecipient;

    /// @notice Protocol fee in basis points taken from the released amount. Max 1000 (10%).
    uint16 public feeBps;

    /// @notice Hard upper bound on a single trade size in v1 (caps blast radius).
    uint256 public maxTradeAmount;

    /// @notice How long, once locked, a buyer has to pay before anyone can refund.
    uint64 public lockDuration;

    uint256 public nextTradeId = 1;
    mapping(uint256 => Trade) public trades;

    /// @notice Sum of G$ currently held across all live trades. Invariant target:
    ///         token.balanceOf(this) >= totalEscrowed at all times.
    uint256 public totalEscrowed;

    uint16 public constant MAX_FEE_BPS = 1000;

    event TradeFunded(uint256 indexed tradeId, address indexed seller, uint256 amount);
    event TradeLocked(uint256 indexed tradeId, address indexed buyer, uint64 deadline);
    event TradeReleased(
        uint256 indexed tradeId, address indexed buyer, uint256 toBuyer, uint256 fee
    );
    event TradeRefunded(uint256 indexed tradeId, address indexed seller, uint256 amount);
    event TradeDisputed(uint256 indexed tradeId, address indexed by);
    event ConfirmationSignerUpdated(address indexed signer);
    event FeeConfigUpdated(address indexed recipient, uint16 feeBps);
    event LimitsUpdated(uint256 maxTradeAmount, uint64 lockDuration);

    error InvalidToken();
    error NotConfirmationSigner();
    error NotSeller();
    error WrongState(State expected, State actual);
    error AmountTooLarge();
    error ZeroAmount();
    error DeadlineNotPassed();
    error FeeTooHigh();
    error ZeroAddress();

    modifier onlyConfirmationSigner() {
        if (msg.sender != confirmationSigner) revert NotConfirmationSigner();
        _;
    }

    constructor(
        address token_,
        address confirmationSigner_,
        address feeRecipient_,
        uint16 feeBps_,
        uint256 maxTradeAmount_,
        uint64 lockDuration_,
        address owner_
    ) Ownable(owner_) {
        if (token_ == address(0)) revert InvalidToken();
        if (confirmationSigner_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        token = IERC20(token_);
        confirmationSigner = confirmationSigner_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        maxTradeAmount = maxTradeAmount_;
        lockDuration = lockDuration_;
    }

    // ---------------------------------------------------------------------
    // Funding (ERC-677 path: seller calls token.transferAndCall(escrow, amt, ""))
    // ---------------------------------------------------------------------

    /// @inheritdoc IERC677Receiver
    /// @dev Only the G$ token may invoke this. Creates a FUNDED trade for `from`.
    function onTokenTransfer(address from, uint256 amount, bytes calldata)
        external
        whenNotPaused
        returns (bool)
    {
        if (msg.sender != address(token)) revert InvalidToken();
        _openTrade(from, amount);
        return true;
    }

    function _openTrade(address seller, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > maxTradeAmount) revert AmountTooLarge();
        uint256 tradeId = nextTradeId++;
        trades[tradeId] = Trade({
            seller: seller,
            buyer: address(0),
            amount: amount,
            lockDeadline: 0,
            state: State.FUNDED
        });
        totalEscrowed += amount;
        emit TradeFunded(tradeId, seller, amount);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice Matching engine (via owner/operator) locks a funded trade to a buyer.
    function lock(uint256 tradeId, address buyer) external whenNotPaused onlyOwner {
        if (buyer == address(0)) revert ZeroAddress();
        Trade storage t = trades[tradeId];
        _require(t.state == State.FUNDED, State.FUNDED, t.state);
        t.buyer = buyer;
        t.lockDeadline = uint64(block.timestamp) + lockDuration;
        t.state = State.LOCKED;
        emit TradeLocked(tradeId, buyer, t.lockDeadline);
    }

    /// @notice Release escrowed G$ to the buyer after the Naira payment is attested.
    ///         Only callable by the isolated confirmation signer.
    function release(uint256 tradeId) external nonReentrant whenNotPaused onlyConfirmationSigner {
        Trade storage t = trades[tradeId];
        _require(t.state == State.LOCKED, State.LOCKED, t.state);

        uint256 amount = t.amount;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 toBuyer = amount - fee;
        address buyer = t.buyer;

        // effects
        t.state = State.RELEASED;
        totalEscrowed -= amount;

        // interactions
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        token.safeTransfer(buyer, toBuyer);

        emit TradeReleased(tradeId, buyer, toBuyer, fee);
    }

    /// @notice Refund the seller. Seller may cancel a FUNDED (unmatched) trade anytime;
    ///         anyone may refund a LOCKED trade once its deadline has passed.
    function refund(uint256 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];

        if (t.state == State.FUNDED) {
            if (msg.sender != t.seller) revert NotSeller();
        } else if (t.state == State.LOCKED) {
            if (block.timestamp < t.lockDeadline) revert DeadlineNotPassed();
        } else {
            revert WrongState(State.FUNDED, t.state);
        }

        uint256 amount = t.amount;
        address seller = t.seller;
        t.state = State.REFUNDED;
        totalEscrowed -= amount;

        token.safeTransfer(seller, amount);
        emit TradeRefunded(tradeId, seller, amount);
    }

    /// @notice Either party (or owner ops) flags a LOCKED trade as disputed, freezing it
    ///         until an arbiter resolves via {resolveDispute}.
    function dispute(uint256 tradeId) external whenNotPaused {
        Trade storage t = trades[tradeId];
        _require(t.state == State.LOCKED, State.LOCKED, t.state);
        if (msg.sender != t.seller && msg.sender != t.buyer && msg.sender != owner()) {
            revert NotSeller();
        }
        t.state = State.DISPUTED;
        emit TradeDisputed(tradeId, msg.sender);
    }

    /// @notice Arbiter (owner, initially a Safe multisig) resolves a dispute: release to
    ///         buyer or refund to seller. Disputed funds can never be unilaterally moved.
    function resolveDispute(uint256 tradeId, bool releaseToBuyer) external nonReentrant onlyOwner {
        Trade storage t = trades[tradeId];
        _require(t.state == State.DISPUTED, State.DISPUTED, t.state);

        uint256 amount = t.amount;
        totalEscrowed -= amount;

        if (releaseToBuyer) {
            uint256 fee = (amount * feeBps) / 10_000;
            uint256 toBuyer = amount - fee;
            t.state = State.RELEASED;
            if (fee > 0) token.safeTransfer(feeRecipient, fee);
            token.safeTransfer(t.buyer, toBuyer);
            emit TradeReleased(tradeId, t.buyer, toBuyer, fee);
        } else {
            t.state = State.REFUNDED;
            token.safeTransfer(t.seller, amount);
            emit TradeRefunded(tradeId, t.seller, amount);
        }
    }

    // ---------------------------------------------------------------------
    // Admin (timelocked owner / multisig in production)
    // ---------------------------------------------------------------------

    function setConfirmationSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        confirmationSigner = signer;
        emit ConfirmationSignerUpdated(signer);
    }

    function setFeeConfig(address recipient, uint16 feeBps_) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeRecipient = recipient;
        feeBps = feeBps_;
        emit FeeConfigUpdated(recipient, feeBps_);
    }

    function setLimits(uint256 maxTradeAmount_, uint64 lockDuration_) external onlyOwner {
        maxTradeAmount = maxTradeAmount_;
        lockDuration = lockDuration_;
        emit LimitsUpdated(maxTradeAmount_, lockDuration_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _require(bool ok, State expected, State actual) internal pure {
        if (!ok) revert WrongState(expected, actual);
    }
}
