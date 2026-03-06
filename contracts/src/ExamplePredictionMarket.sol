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

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        uint256 marketOpen,
        uint256 marketClose,
        address yesToken,
        address noToken
    );

    event SharesPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        Outcome indexed outcome,
        uint256 usdcIn,
        uint256 sharesOut
    );

    event SharesRedeemed(
        uint256 indexed marketId,
        address indexed redeemer,
        uint256 sharesIn,
        uint256 usdcOut
    );

    event LiquidityWithdrawn(
        uint256 indexed marketId,
        address indexed creator,
        uint256 usdcOut
    );

    event SettlementRequested(
        uint256 indexed marketId,
        string question
    );

    event SettlementResponse(
        uint256 indexed marketId,
        Status indexed status,
        Outcome indexed outcome
    );

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum Outcome { None, No, Yes, Inconclusive }
    enum Status { Open, SettlementRequested, Settled, NeedsManual }

    // ===========================
    // ======== ERRORS ===========
    // ===========================

    error MarketNotClosed(uint256 nowTs, uint256 closeTs);
    error StatusNotOpen(Status current);
    error SettlementNotRequested(Status current);
    error InvalidOutcome();
    error ManualSettlementNotAllowed(Status current);
    error MarketNotOpen(uint256 nowTs, uint256 closeTs);
    error AmountZero();
    error NotSettledYet(Status current);
    error NotCreator();
    error LiquidityAlreadyWithdrawn();

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct Market {
        string question;
        address creator;
        uint256 marketOpen;
        uint256 marketClose;
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

    uint256 public nextMarketId;
    mapping(uint256 => Market) public markets;
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

    /// @notice Create a new market. Caller deposits 10 USDC as initial AMM liquidity.
    function newMarket(string calldata question) public returns (uint256) {
        paymentToken.safeTransferFrom(msg.sender, address(this), INITIAL_LIQUIDITY);

        uint256 marketId = nextMarketId++;
        Market storage m = markets[marketId];
        m.question = question;
        m.creator = msg.sender;
        m.marketOpen = block.timestamp;
        m.marketClose = block.timestamp + 3 minutes;

        // Deploy YES/NO share tokens
        string memory idStr = _uint2str(marketId);
        m.yesToken = new ExamplePredictionMarketShareToken(
            string.concat("YES-", idStr),
            string.concat("YES-", idStr)
        );
        m.noToken = new ExamplePredictionMarketShareToken(
            string.concat("NO-", idStr),
            string.concat("NO-", idStr)
        );

        // Mint initial shares into pool reserves (10 each for 50/50 odds)
        m.yesToken.mint(address(this), INITIAL_LIQUIDITY);
        m.noToken.mint(address(this), INITIAL_LIQUIDITY);
        m.yesReserve = INITIAL_LIQUIDITY;
        m.noReserve = INITIAL_LIQUIDITY;

        emit MarketCreated(
            marketId, msg.sender, question,
            m.marketOpen, m.marketClose,
            address(m.yesToken), address(m.noToken)
        );
        return marketId;
    }

    /// @notice Buy YES or NO shares using USDC via constant-product AMM.
    /// @dev Mints complete sets (1 YES + 1 NO per USDC), adds unwanted side to pool,
    ///      and computes wanted shares out using x*y=k.
    function buyShares(uint256 marketId, Outcome outcome, uint256 usdcAmount) public {
        Market storage m = markets[marketId];
        if (m.marketClose < block.timestamp) revert MarketNotOpen(block.timestamp, m.marketClose);
        if (m.status != Status.Open) revert StatusNotOpen(m.status);
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        if (usdcAmount == 0) revert AmountZero();

        // Pull USDC from buyer
        paymentToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Mint complete sets: 1 USDC → 1 YES + 1 NO (held by this contract)
        m.yesToken.mint(address(this), usdcAmount);
        m.noToken.mint(address(this), usdcAmount);

        uint256 sharesOut;

        if (outcome == Outcome.Yes) {
            // Add NO tokens to pool, take YES tokens out
            // k = yesReserve * noReserve (before)
            // New noReserve = noReserve + usdcAmount
            // New yesReserve = k / newNoReserve
            // sharesOut = oldYesReserve - newYesReserve + usdcAmount (minted)
            uint256 k = m.yesReserve * m.noReserve;
            uint256 newNoReserve = m.noReserve + usdcAmount;
            uint256 newYesReserve = k / newNoReserve;
            uint256 yesFromPool = m.yesReserve - newYesReserve;
            sharesOut = yesFromPool + usdcAmount;

            m.yesReserve = newYesReserve;
            m.noReserve = newNoReserve + usdcAmount; // pool gets the minted NO tokens too

            // Transfer YES shares to buyer
            m.yesToken.transfer(msg.sender, sharesOut);
        } else {
            // Add YES tokens to pool, take NO tokens out
            uint256 k = m.yesReserve * m.noReserve;
            uint256 newYesReserve = m.yesReserve + usdcAmount;
            uint256 newNoReserve = k / newYesReserve;
            uint256 noFromPool = m.noReserve - newNoReserve;
            sharesOut = noFromPool + usdcAmount;

            m.noReserve = newNoReserve;
            m.yesReserve = newYesReserve + usdcAmount; // pool gets the minted YES tokens too

            // Transfer NO shares to buyer
            m.noToken.transfer(msg.sender, sharesOut);
        }

        emit SharesPurchased(marketId, msg.sender, outcome, usdcAmount, sharesOut);
    }

    /// @notice Redeem winning shares for USDC after market settlement. 1 winning share = 1 USDC.
    function redeemShares(uint256 marketId, uint256 amount) public {
        Market storage m = markets[marketId];
        if (m.status != Status.Settled) revert NotSettledYet(m.status);
        if (amount == 0) revert AmountZero();

        ExamplePredictionMarketShareToken winningToken = m.outcome == Outcome.Yes ? m.yesToken : m.noToken;
        winningToken.burn(msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);

        emit SharesRedeemed(marketId, msg.sender, amount, amount);
    }

    /// @notice Creator withdraws remaining pool liquidity after settlement.
    /// @dev Burns pool's winning-side reserve tokens and sends equivalent USDC.
    function withdrawLiquidity(uint256 marketId) public {
        Market storage m = markets[marketId];
        if (m.status != Status.Settled) revert NotSettledYet(m.status);
        if (msg.sender != m.creator) revert NotCreator();
        if (m.liquidityWithdrawn) revert LiquidityAlreadyWithdrawn();

        m.liquidityWithdrawn = true;

        // The pool holds both YES and NO reserve tokens. After settlement only the
        // winning side's tokens have value (1 winning token = 1 USDC).
        ExamplePredictionMarketShareToken winningToken = m.outcome == Outcome.Yes ? m.yesToken : m.noToken;
        uint256 poolWinningBalance = winningToken.balanceOf(address(this));

        if (poolWinningBalance > 0) {
            winningToken.burn(address(this), poolWinningBalance);
            paymentToken.safeTransfer(msg.sender, poolWinningBalance);
        }

        emit LiquidityWithdrawn(marketId, msg.sender, poolWinningBalance);
    }

    // ===========================
    // ======== VIEWS ============
    // ===========================

    function getMarket(uint256 marketId) public view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Get the current price of YES shares in USDC terms (scaled by 1e6).
    function getYesPrice(uint256 marketId) public view returns (uint256) {
        Market storage m = markets[marketId];
        // price_yes = noReserve / (yesReserve + noReserve)
        return (m.noReserve * 1e6) / (m.yesReserve + m.noReserve);
    }

    /// @notice Get the current price of NO shares in USDC terms (scaled by 1e6).
    function getNoPrice(uint256 marketId) public view returns (uint256) {
        Market storage m = markets[marketId];
        return (m.yesReserve * 1e6) / (m.yesReserve + m.noReserve);
    }

    function getUri(uint256 marketId) public view returns (string memory) {
        return string.concat("http://localhost:3000/", markets[marketId].evidenceURI);
    }

    // ===========================
    // ======== SETTLEMENT =======
    // ===========================

    function requestSettlement(uint256 marketId) public {
        Market storage m = markets[marketId];
        if (m.marketClose > block.timestamp) revert MarketNotClosed(block.timestamp, m.marketClose);
        if (m.status != Status.Open) revert StatusNotOpen(m.status);

        m.status = Status.SettlementRequested;
        emit SettlementRequested(marketId, m.question);
    }

    function settleMarket(
        uint256 marketId,
        Outcome outcome,
        uint16 confidenceBps,
        string memory evidenceURI
    ) private {
        Market storage m = markets[marketId];
        if (m.status != Status.SettlementRequested) revert SettlementNotRequested(m.status);

        m.outcome = outcome;
        m.settledAt = block.timestamp;
        m.confidenceBps = confidenceBps;
        m.evidenceURI = evidenceURI;

        if (outcome == Outcome.Inconclusive) {
            m.status = Status.NeedsManual;
        } else {
            m.status = Status.Settled;
        }

        emit SettlementResponse(marketId, m.status, m.outcome);
    }

    function settleMarketManually(uint256 marketId, Outcome outcome) public {
        Market storage m = markets[marketId];
        if (outcome != Outcome.No && outcome != Outcome.Yes) revert InvalidOutcome();
        if (m.status != Status.NeedsManual) revert ManualSettlementNotAllowed(m.status);

        m.outcome = outcome;
        m.settledAt = block.timestamp;
        m.status = Status.Settled;

        emit SettlementResponse(marketId, m.status, m.outcome);
    }

    function _processReport(bytes calldata report) internal override {
        (uint256 marketId, uint8 outcome, uint16 confidenceBps, string memory responseId) =
            abi.decode(report, (uint256, uint8, uint16, string));
        settleMarket(marketId, Outcome(outcome), confidenceBps, responseId);
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
