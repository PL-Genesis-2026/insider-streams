// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ExamplePredictionMarketShareToken} from "./ExamplePredictionMarketShareToken.sol";

/// @title ExamplePredictionMarket
/// @notice Binary prediction market with constant-product AMM and YES/NO ERC-20 share tokens.
/// @dev Settlement is performed by a designated settler address (replaces CRE ReceiverTemplate).
contract ExamplePredictionMarket is Ownable {
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

    event SettlerUpdated(address indexed previousSettler, address indexed newSettler);

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
    error NotSettler();

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
    address public settler;

    uint256 public constant INITIAL_LIQUIDITY = 10_000_000; // 10 USDC (6 decimals)

    // ===========================
    // ======== MODIFIERS ========
    // ===========================

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(address token, address settlerAddress) Ownable(msg.sender) {
        paymentToken = IERC20(token);
        settler = settlerAddress;
    }

    // ===========================
    // ======== ADMIN ============
    // ===========================

    function setSettler(address newSettler) external onlyOwner {
        address previous = settler;
        settler = newSettler;
        emit SettlerUpdated(previous, newSettler);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    /// @notice Create a new event. Caller deposits 10 USDC as initial AMM liquidity.
    function newEvent(string calldata question, uint256 duration) public returns (uint256) {
        if (duration == 0) revert DurationZero();
        paymentToken.safeTransferFrom(msg.sender, address(this), INITIAL_LIQUIDITY);

        uint256 eventId = nextEventId++;
        Event storage e = events[eventId];
        e.question = question;
        e.creator = msg.sender;
        e.eventOpen = block.timestamp;
        e.eventClose = block.timestamp + duration;

        string memory idStr = _uint2str(eventId);
        e.yesToken = new ExamplePredictionMarketShareToken(
            string.concat("YES-", idStr),
            string.concat("YES-", idStr)
        );
        e.noToken = new ExamplePredictionMarketShareToken(
            string.concat("NO-", idStr),
            string.concat("NO-", idStr)
        );

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
    function buyShares(uint256 eventId, Outcome outcome, uint256 usdcAmount) public {
        Event storage e = events[eventId];
        if (e.eventClose < block.timestamp) revert EventNotOpen(block.timestamp, e.eventClose);
        if (e.status != Status.Open) revert StatusNotOpen(e.status);
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        if (usdcAmount == 0) revert AmountZero();

        paymentToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        e.yesToken.mint(address(this), usdcAmount);
        e.noToken.mint(address(this), usdcAmount);

        uint256 sharesOut;

        if (outcome == Outcome.Yes) {
            uint256 k = e.yesReserve * e.noReserve;
            uint256 newNoReserve = e.noReserve + usdcAmount;
            uint256 newYesReserve = k / newNoReserve;
            uint256 yesFromPool = e.yesReserve - newYesReserve;
            sharesOut = yesFromPool + usdcAmount;

            e.yesReserve = newYesReserve;
            e.noReserve = newNoReserve;

            e.yesToken.transfer(msg.sender, sharesOut);
        } else {
            uint256 k = e.yesReserve * e.noReserve;
            uint256 newYesReserve = e.yesReserve + usdcAmount;
            uint256 newNoReserve = k / newYesReserve;
            uint256 noFromPool = e.noReserve - newNoReserve;
            sharesOut = noFromPool + usdcAmount;

            e.noReserve = newNoReserve;
            e.yesReserve = newYesReserve;

            e.noToken.transfer(msg.sender, sharesOut);
        }

        emit SharesPurchased(eventId, msg.sender, outcome, usdcAmount, sharesOut);
    }

    /// @notice Redeem winning shares for USDC after event settlement.
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
    function withdrawLiquidity(uint256 eventId) public {
        Event storage e = events[eventId];
        if (e.status != Status.Settled) revert NotSettledYet(e.status);
        if (msg.sender != e.creator) revert NotCreator();
        if (e.liquidityWithdrawn) revert LiquidityAlreadyWithdrawn();

        e.liquidityWithdrawn = true;

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

    function getMarketEvent(uint256 eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function getYesPrice(uint256 eventId) public view returns (uint256) {
        Event storage e = events[eventId];
        return (e.noReserve * 1e6) / (e.yesReserve + e.noReserve);
    }

    function getNoPrice(uint256 eventId) public view returns (uint256) {
        Event storage e = events[eventId];
        return (e.yesReserve * 1e6) / (e.yesReserve + e.noReserve);
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

    /// @notice Settle an event. Only callable by the designated settler address.
    function settleEvent(
        uint256 eventId,
        Outcome outcome,
        uint16 confidenceBps,
        string calldata evidenceURI
    ) external onlySettler {
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
    function adminCloseEvent(uint256 eventId) external onlyOwner {
        Event storage e = events[eventId];
        if (e.status != Status.Open) revert StatusNotOpen(e.status);
        e.eventClose = block.timestamp;
        emit EventAdminClosed(eventId);
    }

    /// @notice Debug-only: force-settle an event regardless of timestamps or status.
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
