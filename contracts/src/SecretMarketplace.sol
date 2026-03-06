// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IERC165} from "./interfaces/IERC165.sol";

interface IExamplePredictionMarket {
    enum Outcome { None, No, Yes, Inconclusive }
    function buyShares(uint256 marketId, Outcome outcome, uint256 usdcAmount) external;
    function nextMarketId() external view returns (uint256);
}

contract SecretMarketplace is ReceiverTemplate, AccessControl {
    using SafeERC20 for IERC20;

    // ===========================
    // ======== ROLES ============
    // ===========================

    bytes32 public constant CRE_ROLE = keccak256("CRE_ROLE");

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum AuctionStatus { Open, Closed, ForceClosed }

    // CRE report action types
    uint8 public constant ACTION_CLOSE_AUCTION = 0;
    uint8 public constant ACTION_FORCE_CLOSE_AUCTION = 1;
    uint8 public constant ACTION_RESOLVE_MARKET = 2;

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct Auction {
        string seller;
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

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event SellerRegistered(
        string seller
    );

    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed eventId,
        string seller,
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
        string seller,
        uint256 eventId
    );

    event AuctionForceClosed(
        uint256 indexed auctionId,
        uint256 heldAmount,
        string seller,
        uint256 eventId,
        int8 reputationDelta
    );

    event ExternalMarketResolved(
        uint256 indexed externalMarketId,
        int8 delta,
        uint256 auctionsAffected
    );

    event ReputationUpdated(
        string seller,
        uint256 indexed auctionId,
        int8 delta,
        int256 newScore
    );

    event SimpleMarketUpdated(
        address indexed previousMarket,
        address indexed newMarket
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
    error MarketDoesNotExist(uint256 eventId);
    error MarketAlreadyResolved(uint256 eventId);
    error UnknownAction(uint8 action);

    // ===========================
    // ======= STATE VARS ========
    // ===========================

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) internal _auctions;

    // Open auction tracking for CRE
    uint256[] public openAuctionIds;
    mapping(uint256 => uint256) private _openAuctionIndex; // auctionId => index+1

    // Unresolved market tracking for CRE reputation resolution
    uint256[] public unresolvedMarketIds;
    mapping(uint256 => uint256) private _unresolvedMarketIndex; // marketId => index+1
    mapping(uint256 => bool) public marketResolved;

    // Market → auctions (for batch reputation resolution)
    mapping(uint256 => uint256[]) public marketAuctions;

    // Seller registry (keyed by seller name)
    mapping(string => Seller) internal _sellers;
    mapping(string => uint256[]) public sellerAuctions;

    IERC20 public immutable paymentToken;
    IExamplePredictionMarket public simpleMarket;

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(
        address token,
        address marketAddress,
        address forwarderAddress
    ) ReceiverTemplate(forwarderAddress) {
        paymentToken = IERC20(token);
        simpleMarket = IExamplePredictionMarket(marketAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ===========================
    // ======== ADMIN ============
    // ===========================

    function setSimpleMarket(address newMarket) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previous = address(simpleMarket);
        simpleMarket = IExamplePredictionMarket(newMarket);
        emit SimpleMarketUpdated(previous, newMarket);
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

    /// @notice Register a seller by name. Admin only.
    function registerSeller(string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Seller storage s = _sellers[name];
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
        }
        emit SellerRegistered(name);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    function createAuction(
        string calldata seller,
        uint256 eventId,
        string calldata eventTitle,
        uint256 endTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        if (endTime <= block.timestamp) revert EndTimeInPast();
        if (eventId >= simpleMarket.nextMarketId()) revert MarketDoesNotExist(eventId);

        // Auto-register seller if not registered
        Seller storage s = _sellers[seller];
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
            emit SellerRegistered(seller);
        }

        uint256 auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.seller = seller;
        a.endTime = endTime;
        a.eventId = eventId;
        a.eventTitle = eventTitle;
        a.status = AuctionStatus.Open;

        // Track open auction for CRE
        openAuctionIds.push(auctionId);
        _openAuctionIndex[auctionId] = openAuctionIds.length; // index+1

        // Track market for reputation resolution (only if not already tracked/resolved)
        if (_unresolvedMarketIndex[eventId] == 0 && !marketResolved[eventId]) {
            unresolvedMarketIds.push(eventId);
            _unresolvedMarketIndex[eventId] = unresolvedMarketIds.length;
        }
        marketAuctions[eventId].push(auctionId);

        // Track seller's auctions
        sellerAuctions[seller].push(auctionId);

        emit AuctionCreated(auctionId, eventId, seller, eventTitle, endTime);
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

    /// @notice Force-close an auction with explicit reputation delta. Admin/CRE only.
    function forceCloseAuction(uint256 auctionId, int8 reputationDelta) external onlyAdminOrCRE {
        _forceCloseAuction(auctionId, reputationDelta);
    }

    /// @notice Resolve an external market — updates reputation for all linked auctions. Admin/CRE only.
    function resolveExternalMarket(uint256 externalMarketId, int8 delta) external onlyAdminOrCRE {
        _resolveExternalMarket(externalMarketId, delta);
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
            (uint256 auctionId, int8 reputationDelta) = abi.decode(payload, (uint256, int8));
            _forceCloseAuction(auctionId, reputationDelta);
        } else if (action == ACTION_RESOLVE_MARKET) {
            (uint256 externalMarketId, int8 delta) = abi.decode(payload, (uint256, int8));
            _resolveExternalMarket(externalMarketId, delta);
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

        emit AuctionClosed(auctionId, a.currentBid, a.seller, a.eventId);
    }

    function _forceCloseAuction(uint256 auctionId, int8 reputationDelta) internal {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.ForceClosed;
        _removeOpenAuction(auctionId);

        // Funds stay in contract; admin withdraws via withdrawFunds()

        // Update reputation
        if (reputationDelta != 0) {
            _sellers[a.seller].reputationScore += reputationDelta;
        }
        a.reputationResolved = true;

        emit AuctionForceClosed(auctionId, a.currentBid, a.seller, a.eventId, reputationDelta);
        if (reputationDelta != 0) {
            emit ReputationUpdated(a.seller, auctionId, reputationDelta, _sellers[a.seller].reputationScore);
        }
    }

    function _resolveExternalMarket(uint256 externalMarketId, int8 delta) internal {
        if (marketResolved[externalMarketId]) revert MarketAlreadyResolved(externalMarketId);

        marketResolved[externalMarketId] = true;
        _removeUnresolvedMarket(externalMarketId);

        uint256[] storage auctionIds = marketAuctions[externalMarketId];
        uint256 count = auctionIds.length;

        for (uint256 i = 0; i < count; i++) {
            uint256 aid = auctionIds[i];
            Auction storage a = _auctions[aid];

            // Force-close any still-open auctions
            if (a.status == AuctionStatus.Open) {
                a.status = AuctionStatus.ForceClosed;
                _removeOpenAuction(aid);
                emit AuctionForceClosed(aid, a.currentBid, a.seller, externalMarketId, 0);
            }

            // Update reputation if not already resolved
            if (!a.reputationResolved) {
                a.reputationResolved = true;
                if (delta != 0) {
                    _sellers[a.seller].reputationScore += delta;
                    emit ReputationUpdated(a.seller, aid, delta, _sellers[a.seller].reputationScore);
                }
            }
        }

        emit ExternalMarketResolved(externalMarketId, delta, count);
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

    function getUnresolvedMarkets() external view returns (uint256[] memory) {
        return unresolvedMarketIds;
    }

    function getMarketAuctions(uint256 externalMarketId) external view returns (uint256[] memory) {
        return marketAuctions[externalMarketId];
    }

    function getSeller(string calldata sellerName) external view returns (Seller memory) {
        return _sellers[sellerName];
    }

    function getSellerAuctions(string calldata sellerName) external view returns (uint256[] memory) {
        return sellerAuctions[sellerName];
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

    function _removeUnresolvedMarket(uint256 marketId) private {
        uint256 idx1 = _unresolvedMarketIndex[marketId];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 last = unresolvedMarketIds.length - 1;
        if (idx != last) {
            uint256 moved = unresolvedMarketIds[last];
            unresolvedMarketIds[idx] = moved;
            _unresolvedMarketIndex[moved] = idx1;
        }
        unresolvedMarketIds.pop();
        delete _unresolvedMarketIndex[marketId];
    }
}
