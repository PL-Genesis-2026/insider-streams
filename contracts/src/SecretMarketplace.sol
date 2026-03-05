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
        uint256 indexed auctionId,
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
    error SellerCannotBid();
    error EndTimeInPast();
    error ReservePriceZero();
    error AuctionDoesNotExist();
    error MarketDoesNotExist(uint256 externalMarketId);
    error NotSellerOrOwner();
    error UnknownAction(uint8 action);

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

    // Reputation — tracked per auction (not per market) to support multiple sellers on the same market
    mapping(address => int256) public reputationScores;

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

        emit AuctionCreated(auctionId, msg.sender, externalMarketId, reservePrice, endTime);
        return auctionId;
    }

    function placeBid(uint256 auctionId, uint256 amount) external {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp >= a.endTime) revert AuctionNotActive();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();
        if (msg.sender == a.seller) revert SellerCannotBid();
        if (amount < a.reservePrice || amount <= a.highestBid) revert BidTooLow();

        // Capture previous bidder before state changes (CEI pattern)
        address prevBidder = a.highestBidder;
        uint256 prevBid = a.highestBid;

        // Effects: update state first
        a.highestBidder = msg.sender;
        a.highestBid = amount;

        // Interactions: external calls last
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        if (prevBidder != address(0)) {
            paymentToken.safeTransfer(prevBidder, prevBid);
        }

        emit BidPlaced(auctionId, msg.sender, amount, prevBidder, prevBid);
    }

    /// @notice Close an expired auction. Callable by the seller or the contract owner.
    function closeAuction(uint256 auctionId) external {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (msg.sender != a.seller && msg.sender != owner()) revert NotSellerOrOwner();
        _closeAuction(auctionId);
    }

    function forceCloseAuction(uint256 auctionId, int8 reputationDelta) external onlyOwner {
        _forceCloseAuction(auctionId, reputationDelta);
    }

    function updateReputationScore(uint256 auctionId, int8 delta) external onlyOwner {
        _updateReputationScore(auctionId, delta);
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
            (uint256 auctionId, int8 delta) = abi.decode(payload, (uint256, int8));
            _updateReputationScore(auctionId, delta);
        } else {
            revert UnknownAction(action);
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
            // Transfer winning bid to seller
            paymentToken.safeTransfer(a.seller, a.highestBid);
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

        // Update reputation for the seller
        _updateReputationScore(auctionId, reputationDelta);

        emit AuctionForceClosed(auctionId, a.highestBidder, a.highestBid, a.seller, a.externalMarketId, reputationDelta);
    }

    function _updateReputationScore(uint256 auctionId, int8 delta) internal {
        AuctionData storage a = auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();

        reputationScores[a.seller] += delta;

        emit ReputationUpdated(a.seller, auctionId, delta, reputationScores[a.seller]);
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
}
