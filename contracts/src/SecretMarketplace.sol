// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IERC165} from "./interfaces/IERC165.sol";
import {IExamplePredictionMarket} from "./interfaces/IExamplePredictionMarket.sol";

contract SecretMarketplace is ReceiverTemplate, AccessControl {
    using SafeERC20 for IERC20;

    // ===========================
    // ======== ROLES ============
    // ===========================

    bytes32 public constant CRE_ROLE = keccak256("CRE_ROLE");

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum AuctionStatus { Open, Closed, Cancelled }

    enum PredictionOutcome { NoPrediction, PredictionCorrect, PredictionWrong }

    // CRE report action types
    uint8 public constant ACTION_CLOSE_AUCTION = 0;
    uint8 public constant ACTION_CANCEL_AUCTION = 1;
    uint8 public constant ACTION_RECORD_EVENT_OUTCOME = 2;

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct Auction {
        string sellerId;
        uint256 endTime;
        uint256 currentBid;
        uint256 eventId;
        string eventTitle;
        AuctionStatus status;
        bool reputationResolved;
    }

    struct Seller {
        int256 reputationScore;
        bool registered;
    }

    struct AuctionResult {
        uint256 auctionId;
        PredictionOutcome predictionOutcome;
    }

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event SellerRegistered(
        string sellerId
    );

    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed eventId,
        string sellerId,
        string eventTitle,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        uint256 bidAmount,
        uint256 previousBid
    );

    event AuctionClosed(
        uint256 indexed auctionId,
        uint256 winningBid,
        string sellerId,
        uint256 eventId
    );

    event AuctionCancelled(
        uint256 indexed auctionId,
        uint256 cancelledBidAmount,
        string sellerId,
        uint256 eventId
    );

    event ExternalEventResolved(
        uint256 indexed externalEventId,
        uint256 auctionsAffected,
        uint256 resultsApplied
    );

    event SellerReputationScoreUpdated(
        string sellerId,
        uint256 indexed auctionId,
        PredictionOutcome predictionOutcome,
        int8 scoreChange,
        int256 newScore
    );

    event MarketplaceUpdated(
        address indexed previousMarketplace,
        address indexed newMarketplace
    );

    // ===========================
    // ======== ERRORS ===========
    // ===========================

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error BidTooLow();
    error EndTimeInPast();
    error AuctionDoesNotExist();
    error EventDoesNotExist(uint256 eventId);
    error EventAlreadyResolved(uint256 eventId);
    error UnknownAction(uint8 action);

    // ===========================
    // ======= STATE VARS ========
    // ===========================

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) internal _auctions;

    // Open auction tracking for CRE
    uint256[] public openAuctionIds;
    mapping(uint256 => uint256) private _openAuctionIndex; // auctionId => index+1

    // Unresolved event tracking for CRE reputation resolution
    uint256[] public unresolvedEventIds;
    mapping(uint256 => uint256) private _unresolvedEventIndex; // eventId => index+1
    mapping(uint256 => bool) public eventResolved;

    // Event → auctions (for batch reputation resolution)
    mapping(uint256 => uint256[]) public eventAuctions;

    // Seller registry (keyed by seller ID)
    mapping(string => Seller) internal _sellers;
    mapping(string => uint256[]) public sellerAuctions;

    IERC20 public immutable paymentToken;
    IExamplePredictionMarket public marketplace;

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(
        address token,
        address marketAddress,
        address forwarderAddress
    ) ReceiverTemplate(forwarderAddress) {
        paymentToken = IERC20(token);
        marketplace = IExamplePredictionMarket(marketAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ===========================
    // ======== ADMIN ============
    // ===========================

    function setMarketplace(address newMarketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previous = address(marketplace);
        marketplace = IExamplePredictionMarket(newMarketplace);
        emit MarketplaceUpdated(previous, newMarketplace);
    }

    function withdrawFunds(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paymentToken.safeTransfer(to, amount);
    }

    // ===========================
    // ======== MODIFIERS ========
    // ===========================

    modifier onlyAdminOrCRE() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(CRE_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, CRE_ROLE);
        }
        _;
    }

    // ===========================
    // ======== SELLER ===========
    // ===========================

    /// @notice Register a seller by ID. Admin only.
    function registerSeller(string calldata sellerId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Seller storage s = _sellers[sellerId];
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
        }
        emit SellerRegistered(sellerId);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    function createAuction(
        string calldata sellerId,
        uint256 eventId,
        string calldata eventTitle,
        uint256 endTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        if (endTime <= block.timestamp) revert EndTimeInPast();
        if (eventId >= marketplace.nextEventId()) revert EventDoesNotExist(eventId);

        // Auto-register seller if not registered
        Seller storage s = _sellers[sellerId];
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
            emit SellerRegistered(sellerId);
        }

        uint256 auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.sellerId = sellerId;
        a.endTime = endTime;
        a.eventId = eventId;
        a.eventTitle = eventTitle;
        a.status = AuctionStatus.Open;

        // Track open auction for CRE
        openAuctionIds.push(auctionId);
        _openAuctionIndex[auctionId] = openAuctionIds.length; // index+1

        // Track event for reputation resolution (only if not already tracked/resolved)
        if (_unresolvedEventIndex[eventId] == 0 && !eventResolved[eventId]) {
            unresolvedEventIds.push(eventId);
            _unresolvedEventIndex[eventId] = unresolvedEventIds.length;
        }
        eventAuctions[eventId].push(auctionId);

        // Track seller's auctions
        sellerAuctions[sellerId].push(auctionId);

        emit AuctionCreated(auctionId, eventId, sellerId, eventTitle, endTime);
        return auctionId;
    }

    function placeBid(uint256 auctionId, uint256 bidAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp >= a.endTime) revert AuctionNotActive();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();
        if (bidAmount <= a.currentBid) revert BidTooLow();

        uint256 prevBid = a.currentBid;
        a.currentBid = bidAmount;

        // Pull new bid from admin
        paymentToken.safeTransferFrom(msg.sender, address(this), bidAmount);
        // Refund previous bid to admin
        if (prevBid > 0) {
            paymentToken.safeTransfer(msg.sender, prevBid);
        }

        emit BidPlaced(auctionId, bidAmount, prevBid);
    }

    /// @notice Close an expired auction. Admin or CRE only.
    function closeAuction(uint256 auctionId) external onlyAdminOrCRE {
        _closeAuction(auctionId);
    }

    /// @notice Cancel an auction with a prediction outcome. Admin/CRE only.
    function cancelAuction(uint256 auctionId, PredictionOutcome predictionOutcome) external onlyAdminOrCRE {
        _cancelAuction(auctionId, predictionOutcome);
    }

    /// @notice Record event outcome and update reputation scores per auction. Admin/CRE only.
    function recordEventOutcomeAndUpdateRepScore(uint256 externalEventId, AuctionResult[] calldata results) external onlyAdminOrCRE {
        _recordEventOutcomeAndUpdateRepScore(externalEventId, results);
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
        } else if (action == ACTION_CANCEL_AUCTION) {
            (uint256 auctionId, uint8 outcomeRaw) = abi.decode(payload, (uint256, uint8));
            _cancelAuction(auctionId, PredictionOutcome(outcomeRaw));
        } else if (action == ACTION_RECORD_EVENT_OUTCOME) {
            (uint256 externalEventId, AuctionResult[] memory results) = abi.decode(payload, (uint256, AuctionResult[]));
            _recordEventOutcomeAndUpdateRepScore(externalEventId, results);
        } else {
            revert UnknownAction(action);
        }
    }

    // ===========================
    // ======== INTERNAL =========
    // ===========================

    function _closeAuction(uint256 auctionId) internal {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp < a.endTime) revert AuctionNotEnded();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.Closed;
        _removeOpenAuction(auctionId);

        // Funds stay in contract; admin withdraws via withdrawFunds()

        emit AuctionClosed(auctionId, a.currentBid, a.sellerId, a.eventId);
    }

    function _cancelAuction(uint256 auctionId, PredictionOutcome predictionOutcome) internal {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.Cancelled;
        _removeOpenAuction(auctionId);

        // Funds stay in contract; admin withdraws via withdrawFunds()

        // Update reputation
        (int8 scoreChange, int256 newScore) = _applyReputation(a.sellerId, predictionOutcome);
        a.reputationResolved = true;

        emit AuctionCancelled(auctionId, a.currentBid, a.sellerId, a.eventId);
        emit SellerReputationScoreUpdated(a.sellerId, auctionId, predictionOutcome, scoreChange, newScore);
    }

    function _recordEventOutcomeAndUpdateRepScore(uint256 externalEventId, AuctionResult[] memory results) internal {
        if (eventResolved[externalEventId]) revert EventAlreadyResolved(externalEventId);

        uint256[] storage auctionIds = eventAuctions[externalEventId];
        uint256 count = auctionIds.length;

        // Single pass: cancel open auctions, apply reputation from results, mark remaining resolved
        for (uint256 i = 0; i < count; i++) {
            uint256 aid = auctionIds[i];
            Auction storage a = _auctions[aid];

            // Cancel if still open
            if (a.status == AuctionStatus.Open) {
                a.status = AuctionStatus.Cancelled;
                _removeOpenAuction(aid);
                emit AuctionCancelled(aid, a.currentBid, a.sellerId, externalEventId);
            }

            // Apply reputation if not already resolved
            if (!a.reputationResolved) {
                a.reputationResolved = true;
                PredictionOutcome outcome = _findOutcomeForAuction(aid, results);
                (int8 scoreChange, int256 newScore) = _applyReputation(a.sellerId, outcome);
                emit SellerReputationScoreUpdated(a.sellerId, aid, outcome, scoreChange, newScore);
            }
        }

        eventResolved[externalEventId] = true;
        _removeUnresolvedEvent(externalEventId);

        emit ExternalEventResolved(externalEventId, count, results.length);
    }

    function _applyReputation(string memory sellerId, PredictionOutcome outcome)
        internal returns (int8 scoreChange, int256 newScore)
    {
        if (outcome == PredictionOutcome.PredictionCorrect) {
            scoreChange = 1;
        } else if (outcome == PredictionOutcome.PredictionWrong) {
            scoreChange = -1;
        } else {
            scoreChange = 0;
        }

        if (scoreChange != 0) {
            _sellers[sellerId].reputationScore += scoreChange;
        }
        newScore = _sellers[sellerId].reputationScore;
    }

    function _findOutcomeForAuction(uint256 auctionId, AuctionResult[] memory results)
        internal pure returns (PredictionOutcome)
    {
        for (uint256 i = 0; i < results.length; i++) {
            if (results[i].auctionId == auctionId) {
                return results[i].predictionOutcome;
            }
        }
        return PredictionOutcome.NoPrediction;
    }

    // ===========================
    // ======== VIEWS ============
    // ===========================

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    function getOpenAuctions() external view returns (uint256[] memory) {
        return openAuctionIds;
    }

    function getUnresolvedEvents() external view returns (uint256[] memory) {
        return unresolvedEventIds;
    }

    function getEventAuctions(uint256 externalEventId) external view returns (uint256[] memory) {
        return eventAuctions[externalEventId];
    }

    function getSeller(string calldata sellerId) external view returns (Seller memory) {
        return _sellers[sellerId];
    }

    function getSellerAuctions(string calldata sellerId) external view returns (uint256[] memory) {
        return sellerAuctions[sellerId];
    }

    // ===========================
    // ==== supportsInterface ====
    // ===========================

    function supportsInterface(bytes4 interfaceId)
        public
        pure
        override(ReceiverTemplate, AccessControl)
        returns (bool)
    {
        return interfaceId == type(IReceiver).interfaceId
            || interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IAccessControl).interfaceId;
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

    function _removeUnresolvedEvent(uint256 eventId) private {
        uint256 idx1 = _unresolvedEventIndex[eventId];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 last = unresolvedEventIds.length - 1;
        if (idx != last) {
            uint256 moved = unresolvedEventIds[last];
            unresolvedEventIds[idx] = moved;
            _unresolvedEventIndex[moved] = idx1;
        }
        unresolvedEventIds.pop();
        delete _unresolvedEventIndex[eventId];
    }
}
