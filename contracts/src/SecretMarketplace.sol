// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISimpleMarket {
    enum Outcome { None, No, Yes, Inconclusive }
    function makePrediction(uint256 marketId, Outcome outcome, uint256 amount) external;
    function nextMarketId() external view returns (uint256);
}

contract SecretMarketplace is ReceiverTemplate {
    using SafeERC20 for IERC20;

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 externalMarketId,
        uint256 reservePrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        address previousBidder,
        uint256 previousBid
    );

    event AuctionClosed(
        uint256 indexed auctionId,
        address indexed buyer,
        uint256 winningBid,
        address seller,
        uint256 externalMarketId
    );

    event AuctionForceClosed(
        uint256 indexed auctionId,
        address indexed refundedBidder,
        uint256 refundAmount,
        address seller,
        uint256 externalMarketId,
        int8 reputationDelta
    );

    event TradeExecuted(
        uint256 indexed auctionId,
        uint256 indexed externalMarketId,
        address indexed buyer,
        uint256 amount
    );

    event ReputationUpdated(
        address indexed seller,
        uint256 indexed externalMarketId,
        int8 delta,
        int256 newScore
    );

    // ===========================
    // ======== ERRORS ===========
    // ===========================

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error BidTooLow();
    error EndTimeInPast();
    error ReservePriceZero();
    error AuctionDoesNotExist();
    error NotAdminOrCRE();
    error MarketAlreadyTracked(uint256 externalMarketId);
    error MarketNotTracked(uint256 externalMarketId);
    error MarketDoesNotExist(uint256 externalMarketId);

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum AuctionStatus { Open, Closed, ForceClosed }

    // CRE report action types
    uint8 constant ACTION_CLOSE_AUCTION = 0;
    uint8 constant ACTION_FORCE_CLOSE_AUCTION = 1;
    uint8 constant ACTION_UPDATE_REPUTATION = 2;

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct AuctionData {
        address seller;
        uint256 externalMarketId;
        uint256 reservePrice; //ebay-like minimum bid
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        AuctionStatus status;
    }

    // ===========================
    // ======= STATE VARS ========
    // ===========================

    uint256 public nextAuctionId;
    mapping(uint256 => AuctionData) public auctions;

    // Open auction tracking for CRE
    uint256[] public openAuctionIds;
    mapping(uint256 => uint256) private _openAuctionIndex; // auctionId => index+1 (0 means not present)

    // Reputation (stubbed for future implementation)
    mapping(address => int256) public reputationScores;
    // externalMarketId => seller who created an auction for it
    mapping(uint256 => address) public trackedMarkets;
    uint256[] public trackedMarketIds;
    mapping(uint256 => uint256) private _trackedMarketIndex; // marketId => index+1

    IERC20 public immutable paymentToken;
    ISimpleMarket public immutable market;

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(
        address token,
        address marketAddress,
        address forwarderAddress
    ) ReceiverTemplate(forwarderAddress) {
        paymentToken = IERC20(token);
        market = ISimpleMarket(marketAddress);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    function createAuction(
        uint256 externalMarketId,
        uint256 reservePrice,
        uint256 endTime
    ) external returns (uint256) {
        if (endTime <= block.timestamp) revert EndTimeInPast();
        if (reservePrice == 0) revert ReservePriceZero();
        if (externalMarketId >= market.nextMarketId()) revert MarketDoesNotExist(externalMarketId);

        uint256 auctionId = nextAuctionId++;
        auctions[auctionId] = AuctionData({
            seller: msg.sender,
            externalMarketId: externalMarketId,
            reservePrice: reservePrice,
            endTime: endTime,
            highestBidder: address(0),
            highestBid: 0,
            status: AuctionStatus.Open
        });

        // Track open auction for CRE
        openAuctionIds.push(auctionId);
        _openAuctionIndex[auctionId] = openAuctionIds.length; // index+1

        // Track the external market for reputation scoring
        if (trackedMarkets[externalMarketId] == address(0)) {
            trackedMarkets[externalMarketId] = msg.sender;
            trackedMarketIds.push(externalMarketId);
            _trackedMarketIndex[externalMarketId] = trackedMarketIds.length;
        }

        emit AuctionCreated(auctionId, msg.sender, externalMarketId, reservePrice, endTime);
        return auctionId;
    }

    function placeBid(uint256 auctionId, uint256 amount) external {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp >= a.endTime) revert AuctionNotActive();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();
        if (amount < a.reservePrice || amount <= a.highestBid) revert BidTooLow();

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        address prevBidder = a.highestBidder;
        uint256 prevBid = a.highestBid;

        a.highestBidder = msg.sender;
        a.highestBid = amount;

        // Refund the previous bidder directly
        if (prevBidder != address(0)) {
            paymentToken.safeTransfer(prevBidder, prevBid);
        }

        emit BidPlaced(auctionId, msg.sender, amount, prevBidder, prevBid);
    }

    function closeAuction(uint256 auctionId) external onlyOwner { //add roles based modifier for allowing admin + CRE 
        _closeAuction(auctionId);
    }

    function forceCloseAuction(uint256 auctionId, int8 reputationDelta) external onlyOwner {
        _forceCloseAuction(auctionId, reputationDelta);
    }

    function updateReputationScore(uint256 externalMarketId, int8 delta) external onlyOwner {
        _updateReputationScore(externalMarketId, delta);
    }

    // ===========================
    // ======== CRE ENTRY ========
    // ===========================

    function _processReport(bytes calldata report) internal override {
        uint8 action = uint8(report[0]);
        bytes calldata payload = report[1:];

        if (action == ACTION_CLOSE_AUCTION) {
            uint256 auctionId = abi.decode(payload, (uint256));
            _closeAuction(auctionId);
        } else if (action == ACTION_FORCE_CLOSE_AUCTION) {
            (uint256 auctionId, int8 delta) = abi.decode(payload, (uint256, int8));
            _forceCloseAuction(auctionId, delta);
        } else if (action == ACTION_UPDATE_REPUTATION) {
            (uint256 externalMarketId, int8 delta) = abi.decode(payload, (uint256, int8));
            _updateReputationScore(externalMarketId, delta);
        }
    }

    // ===========================
    // ======== INTERNAL =========
    // ===========================

    function _closeAuction(uint256 auctionId) internal {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp < a.endTime) revert AuctionNotEnded();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.Closed;
        _removeOpenAuction(auctionId);

        if (a.highestBidder != address(0)) {
            // Day one: just emit event. Later: call market.makePrediction(...)
            emit TradeExecuted(auctionId, a.externalMarketId, a.highestBidder, a.highestBid);
        }

        emit AuctionClosed(auctionId, a.highestBidder, a.highestBid, a.seller, a.externalMarketId);
    }

    function _forceCloseAuction(uint256 auctionId, int8 reputationDelta) internal {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.ForceClosed;
        _removeOpenAuction(auctionId);

        // Refund the current highest bidder directly
        if (a.highestBidder != address(0)) {
            paymentToken.safeTransfer(a.highestBidder, a.highestBid);
        }

        // Update reputation for the seller (also removes market from tracking)
        _updateReputationScore(a.externalMarketId, reputationDelta);

        emit AuctionForceClosed(auctionId, a.highestBidder, a.highestBid, a.seller, a.externalMarketId, reputationDelta);
    }

    function _updateReputationScore(uint256 externalMarketId, int8 delta) internal {
        address seller = trackedMarkets[externalMarketId];
        if (seller == address(0)) revert MarketNotTracked(externalMarketId);

        reputationScores[seller] += delta;

        // Remove market from tracking
        _removeTrackedMarket(externalMarketId);
        delete trackedMarkets[externalMarketId];

        emit ReputationUpdated(seller, externalMarketId, delta, reputationScores[seller]);
    }

    // ===========================
    // ======== VIEWS ============
    // ===========================

    function getAuction(uint256 auctionId) external view returns (AuctionData memory) {
        return auctions[auctionId];
    }

    function getOpenAuctions() external view returns (uint256[] memory) {
        return openAuctionIds;
    }

    function getTrackedMarkets() external view returns (uint256[] memory) {
        return trackedMarketIds;
    }

    // ===========================
    // ======= ARRAY HELPERS =====
    // ===========================

    function _removeOpenAuction(uint256 auctionId) private {
        uint256 idx1 = _openAuctionIndex[auctionId];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 last = openAuctionIds.length - 1;
        if (idx != last) {
            uint256 moved = openAuctionIds[last];
            openAuctionIds[idx] = moved;
            _openAuctionIndex[moved] = idx1;
        }
        openAuctionIds.pop();
        delete _openAuctionIndex[auctionId];
    }

    function _removeTrackedMarket(uint256 marketId) private {
        uint256 idx1 = _trackedMarketIndex[marketId];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 last = trackedMarketIds.length - 1;
        if (idx != last) {
            uint256 moved = trackedMarketIds[last];
            trackedMarketIds[idx] = moved;
            _trackedMarketIndex[moved] = idx1;
        }
        trackedMarketIds.pop();
        delete _trackedMarketIndex[marketId];
    }
}
