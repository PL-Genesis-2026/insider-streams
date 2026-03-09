// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ExamplePredictionMarketShareToken} from "./ExamplePredictionMarketShareToken.sol";

/// @title ExamplePredictionMarket
/// @notice Binary prediction market with constant-product AMM and YES/NO ERC-20 share tokens.
/// @dev Integrates with Chainlink Runtime Environment (CRE) through ReceiverTemplate.
contract ExamplePredictionMarket is ReceiverTemplate {
    using SafeERC20 for IERC20;

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event EventCreated(
        uint256 indexed eventId,
        address indexed creator,
        string question,
        uint256 eventOpen,
        uint256 eventClose,
        uint256 duration,
        address yesToken,
        address noToken
    );

    event SharesPurchased(
        uint256 indexed eventId,
        address indexed buyer,
        Outcome indexed outcome,
        uint256 usdcIn,
        uint256 sharesOut
    );

    event SharesRedeemed(
        uint256 indexed eventId,
        address indexed redeemer,
        uint256 sharesIn,
        uint256 usdcOut
    );

    event LiquidityWithdrawn(
        uint256 indexed eventId,
        address indexed creator,
        uint256 usdcOut
    );

    event SettlementRequested(
        uint256 indexed eventId,
        string question
    );

    event SettlementResponse(
        uint256 indexed eventId,
        Status indexed status,
        Outcome indexed outcome
    );

    event EventAdminClosed(uint256 indexed eventId);

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum Outcome { None, No, Yes, Inconclusive }
    enum Status { Open, SettlementRequested, Settled, NeedsManual }

    // ===========================
    // ======== ERRORS ===========
    // ===========================

    error EventNotClosed(uint256 nowTs, uint256 closeTs);
    error StatusNotOpen(Status current);
    error SettlementNotRequested(Status current);
    error InvalidOutcome();
    error ManualSettlementNotAllowed(Status current);
    error EventNotOpen(uint256 nowTs, uint256 closeTs);
    error AmountZero();
    error DurationZero();
    error AlreadySettled(Status current);
    error NotSettledYet(Status current);
    error NotCreator();
    error LiquidityAlreadyWithdrawn();

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct Event {
        string question;
        address creator;
        uint256 eventOpen;
        uint256 eventClose;
        Status status;
        Outcome outcome;
        uint256 settledAt;
        string evidenceURI;
        uint16 confidenceBps;
        ExamplePredictionMarketShareToken yesToken;
        ExamplePredictionMarketShareToken noToken;
        uint256 yesReserve;
        uint256 noReserve;
        bool liquidityWithdrawn;
    }

    // ===========================
    // ======= STATE VARS ========
    // ===========================

    uint256 public nextEventId;
    mapping(uint256 => Event) public events;
    IERC20 public immutable paymentToken;

    uint256 public constant INITIAL_LIQUIDITY = 10_000_000; // 10 USDC (6 decimals)

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(address token, address forwarderAddress) ReceiverTemplate(forwarderAddress) {
        paymentToken = IERC20(token);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    /// @notice Create a new event. Caller deposits 10 USDC as initial AMM liquidity.
    /// @param question The prediction question for this event.
    /// @param duration How long the event stays open for trading, in seconds.
    function newEvent(string calldata question, uint256 duration) public returns (uint256) {
        if (duration == 0) revert DurationZero();
        paymentToken.safeTransferFrom(msg.sender, address(this), INITIAL_LIQUIDITY);

        uint256 eventId = nextEventId++;
        Event storage e = events[eventId];
        e.question = question;
        e.creator = msg.sender;
        e.eventOpen = block.timestamp;
        e.eventClose = block.timestamp + duration;

        // Deploy YES/NO share tokens
        string memory idStr = _uint2str(eventId);
        e.yesToken = new ExamplePredictionMarketShareToken(
            string.concat("YES-", idStr),
            string.concat("YES-", idStr)
        );
        e.noToken = new ExamplePredictionMarketShareToken(
            string.concat("NO-", idStr),
            string.concat("NO-", idStr)
        );

        // Mint initial shares into pool reserves (10 each for 50/50 odds)
        e.yesToken.mint(address(this), INITIAL_LIQUIDITY);
        e.noToken.mint(address(this), INITIAL_LIQUIDITY);
        e.yesReserve = INITIAL_LIQUIDITY;
        e.noReserve = INITIAL_LIQUIDITY;

        emit EventCreated(
            eventId, msg.sender, question,
            e.eventOpen, e.eventClose, duration,
            address(e.yesToken), address(e.noToken)
        );
        return eventId;
    }

    /// @notice Buy YES or NO shares using USDC via constant-product AMM.
    /// @dev Mints complete sets (1 YES + 1 NO per USDC), adds unwanted side to pool,
    ///      and computes wanted shares out using x*y=k.
    function buyShares(uint256 eventId, Outcome outcome, uint256 usdcAmount) public {
        Event storage e = events[eventId];
        if (e.eventClose < block.timestamp) revert EventNotOpen(block.timestamp, e.eventClose);
        if (e.status != Status.Open) revert StatusNotOpen(e.status);
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        if (usdcAmount == 0) revert AmountZero();

        // Pull USDC from buyer
        paymentToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Mint complete sets: 1 USDC → 1 YES + 1 NO (held by this contract)
        e.yesToken.mint(address(this), usdcAmount);
        e.noToken.mint(address(this), usdcAmount);

        uint256 sharesOut;

        if (outcome == Outcome.Yes) {
            // Add NO tokens to pool, take YES tokens out
            // k = yesReserve * noReserve (before)
            // New noReserve = noReserve + usdcAmount
            // New yesReserve = k / newNoReserve
            // sharesOut = oldYesReserve - newYesReserve + usdcAmount (minted)
            uint256 k = e.yesReserve * e.noReserve;
            uint256 newNoReserve = e.noReserve + usdcAmount;
            uint256 newYesReserve = k / newNoReserve;
            uint256 yesFromPool = e.yesReserve - newYesReserve;
            sharesOut = yesFromPool + usdcAmount;

            e.yesReserve = newYesReserve;
            e.noReserve = newNoReserve; // newNoReserve already includes minted NO tokens

            // Transfer YES shares to buyer
            e.yesToken.transfer(msg.sender, sharesOut);
        } else {
            // Add YES tokens to pool, take NO tokens out
            uint256 k = e.yesReserve * e.noReserve;
            uint256 newYesReserve = e.yesReserve + usdcAmount;
            uint256 newNoReserve = k / newYesReserve;
            uint256 noFromPool = e.noReserve - newNoReserve;
            sharesOut = noFromPool + usdcAmount;

            e.noReserve = newNoReserve;
            e.yesReserve = newYesReserve; // newYesReserve already includes minted YES tokens

            // Transfer NO shares to buyer
            e.noToken.transfer(msg.sender, sharesOut);
        }

        emit SharesPurchased(eventId, msg.sender, outcome, usdcAmount, sharesOut);
    }

    /// @notice Redeem winning shares for USDC after event settlement. 1 winning share = 1 USDC.
    function redeemShares(uint256 eventId, uint256 amount) public {
        Event storage e = events[eventId];
        if (e.status != Status.Settled) revert NotSettledYet(e.status);
        if (amount == 0) revert AmountZero();

        ExamplePredictionMarketShareToken winningToken = e.outcome == Outcome.Yes ? e.yesToken : e.noToken;
        winningToken.burn(msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);

        emit SharesRedeemed(eventId, msg.sender, amount, amount);
    }

    /// @notice Creator withdraws remaining pool liquidity after settlement.
    /// @dev Burns pool's winning-side reserve tokens and sends equivalent USDC.
    function withdrawLiquidity(uint256 eventId) public {
        Event storage e = events[eventId];
        if (e.status != Status.Settled) revert NotSettledYet(e.status);
        if (msg.sender != e.creator) revert NotCreator();
        if (e.liquidityWithdrawn) revert LiquidityAlreadyWithdrawn();

        e.liquidityWithdrawn = true;

        // The pool holds both YES and NO reserve tokens. After settlement only the
        // winning side's tokens have value (1 winning token = 1 USDC).
        ExamplePredictionMarketShareToken winningToken = e.outcome == Outcome.Yes ? e.yesToken : e.noToken;
        uint256 poolWinningBalance = winningToken.balanceOf(address(this));

        if (poolWinningBalance > 0) {
            winningToken.burn(address(this), poolWinningBalance);
            paymentToken.safeTransfer(msg.sender, poolWinningBalance);
        }

        emit LiquidityWithdrawn(eventId, msg.sender, poolWinningBalance);
    }

    // ===========================
    // ======== VIEWS ============
    // ===========================

    function getEvent(uint256 eventId) public view returns (Event memory) {
        return events[eventId];
    }

    /// @notice Get the current price of YES shares in USDC terms (scaled by 1e6).
    function getYesPrice(uint256 eventId) public view returns (uint256) {
        Event storage e = events[eventId];
        // price_yes = noReserve / (yesReserve + noReserve)
        return (e.noReserve * 1e6) / (e.yesReserve + e.noReserve);
    }

    /// @notice Get the current price of NO shares in USDC terms (scaled by 1e6).
    function getNoPrice(uint256 eventId) public view returns (uint256) {
        Event storage e = events[eventId];
        return (e.yesReserve * 1e6) / (e.yesReserve + e.noReserve);
    }

    function getUri(uint256 eventId) public view returns (string memory) {
        return string.concat("http://localhost:3000/", events[eventId].evidenceURI);
    }

    // ===========================
    // ======== SETTLEMENT =======
    // ===========================

    function requestSettlement(uint256 eventId) public {
        Event storage e = events[eventId];
        if (e.eventClose > block.timestamp) revert EventNotClosed(block.timestamp, e.eventClose);
        if (e.status != Status.Open) revert StatusNotOpen(e.status);

        e.status = Status.SettlementRequested;
        emit SettlementRequested(eventId, e.question);
    }

    function settleEvent(
        uint256 eventId,
        Outcome outcome,
        uint16 confidenceBps,
        string memory evidenceURI
    ) private {
        Event storage e = events[eventId];
        if (e.status != Status.SettlementRequested) revert SettlementNotRequested(e.status);

        e.outcome = outcome;
        e.settledAt = block.timestamp;
        e.confidenceBps = confidenceBps;
        e.evidenceURI = evidenceURI;

        if (outcome == Outcome.Inconclusive) {
            e.status = Status.NeedsManual;
        } else {
            e.status = Status.Settled;
        }

        emit SettlementResponse(eventId, e.status, e.outcome);
    }

    function settleEventManually(uint256 eventId, Outcome outcome) public {
        Event storage e = events[eventId];
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        if (e.status != Status.NeedsManual) revert ManualSettlementNotAllowed(e.status);

        e.outcome = outcome;
        e.settledAt = block.timestamp;
        e.status = Status.Settled;

        emit SettlementResponse(eventId, e.status, e.outcome);
    }

    /// @notice Debug-only: immediately close an event so requestSettlement can proceed.
    /// @dev Sets eventClose to block.timestamp. For testing only — restricted to owner.
    function adminCloseEvent(uint256 eventId) external onlyOwner {
        Event storage e = events[eventId];
        if (e.status != Status.Open) revert StatusNotOpen(e.status);
        e.eventClose = block.timestamp;
        emit EventAdminClosed(eventId);
    }

    /// @notice Debug-only: force-settle an event regardless of timestamps or status.
    /// @dev Bypasses eventClose check and SettlementRequested status requirement.
    ///      Sets status directly to Settled. For testing only — restricted to owner.
    function forceSettle(uint256 eventId, Outcome outcome, uint16 confidenceBps, string calldata evidenceURI) public onlyOwner {
        Event storage e = events[eventId];
        if (e.status == Status.Settled) revert AlreadySettled(e.status);
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        e.outcome = outcome;
        e.settledAt = block.timestamp;
        e.confidenceBps = confidenceBps;
        e.evidenceURI = evidenceURI;
        e.status = Status.Settled;
        emit SettlementResponse(eventId, e.status, e.outcome);
    }

    function _processReport(bytes calldata report) internal override {
        (uint256 eventId, uint8 outcome, uint16 confidenceBps, string memory responseId) =
            abi.decode(report, (uint256, uint8, uint16, string));
        settleEvent(eventId, Outcome(outcome), confidenceBps, responseId);
    }

    // ===========================
    // ======== INTERNAL =========
    // ===========================

    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
