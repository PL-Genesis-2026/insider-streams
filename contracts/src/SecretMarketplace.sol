// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IERC165} from "./interfaces/IERC165.sol";

interface ISimpleMarket {
    enum Outcome { None, No, Yes, Inconclusive }
    function makePrediction(uint256 marketId, Outcome outcome, uint256 amount) external;
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

    struct MarketMetadata {
        uint256 marketId;
        address yesToken;   // placeholder for future token-based markets
        address noToken;    // placeholder for future token-based markets
        bool betOnYes;      // seller's claim about market direction
    }

    struct Auction {
        address seller;
        uint256 reservePrice;
        uint256 endTime;
        uint256 currentBid;
        address currentBidder;
        uint256 automaticBetAmount;  // winning bidder's intended bet on the prediction market
        MarketMetadata marketMetadata;
        AuctionStatus status;
        bool reputationResolved;
    }

    struct Seller {
        string name;
        int256 reputationScore;
        bool registered;
    }

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event SellerRegistered(
        address indexed seller,
        string name
    );

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        uint256 indexed externalMarketId,
        uint256 reservePrice,
        uint256 endTime,
        bool betOnYes
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 bidAmount,
        uint256 automaticBetAmount,
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
        uint256 automaticBetAmount,
        bool betOnYes
    );

    event ExternalMarketResolved(
        uint256 indexed externalMarketId,
        uint8 outcome,
        uint256 auctionsAffected
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
    error MarketAlreadyResolved(uint256 externalMarketId);
    error NotSellerOrAdmin();
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

    // Seller registry
    mapping(address => Seller) internal _sellers;

    // Address → auction ID lookups
    mapping(address => uint256[]) public buyerAuctions;
    mapping(address => uint256[]) public sellerAuctions;

    IERC20 public immutable paymentToken;
    ISimpleMarket public immutable simpleMarket;

    // ===========================
    // ======== CONSTRUCTOR ======
    // ===========================

    constructor(
        address token,
        address marketAddress,
        address forwarderAddress
    ) ReceiverTemplate(forwarderAddress) {
        paymentToken = IERC20(token);
        simpleMarket = ISimpleMarket(marketAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
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

    /// @notice Register as a seller or update your name.
    function registerSeller(string calldata name) external {
        Seller storage s = _sellers[msg.sender];
        s.name = name;
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
        }
        emit SellerRegistered(msg.sender, name);
    }

    // ===========================
    // ======== FUNCTIONS ========
    // ===========================

    function createAuction(
        uint256 externalMarketId,
        uint256 reservePrice,
        uint256 endTime,
        address yesToken,
        address noToken,
        bool betOnYes
    ) external returns (uint256) {
        if (endTime <= block.timestamp) revert EndTimeInPast();
        if (reservePrice == 0) revert ReservePriceZero();
        if (externalMarketId >= simpleMarket.nextMarketId()) revert MarketDoesNotExist(externalMarketId);

        // Auto-register seller if not registered
        Seller storage seller = _sellers[msg.sender];
        if (!seller.registered) {
            seller.registered = true;
            seller.reputationScore = 0;
            emit SellerRegistered(msg.sender, "");
        }

        uint256 auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.seller = msg.sender;
        a.reservePrice = reservePrice;
        a.endTime = endTime;
        a.marketMetadata = MarketMetadata({
            marketId: externalMarketId,
            yesToken: yesToken,
            noToken: noToken,
            betOnYes: betOnYes
        });
        a.status = AuctionStatus.Open;

        // Track open auction for CRE
        openAuctionIds.push(auctionId);
        _openAuctionIndex[auctionId] = openAuctionIds.length; // index+1

        // Track market for reputation resolution (only if not already tracked/resolved)
        if (_unresolvedMarketIndex[externalMarketId] == 0 && !marketResolved[externalMarketId]) {
            unresolvedMarketIds.push(externalMarketId);
            _unresolvedMarketIndex[externalMarketId] = unresolvedMarketIds.length;
        }
        marketAuctions[externalMarketId].push(auctionId);

        // Track seller's auctions
        sellerAuctions[msg.sender].push(auctionId);

        emit AuctionCreated(auctionId, msg.sender, externalMarketId, reservePrice, endTime, betOnYes);
        return auctionId;
    }

    function placeBid(uint256 auctionId, uint256 bidAmount, uint256 automaticBetAmount) external {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp >= a.endTime) revert AuctionNotActive();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();
        if (msg.sender == a.seller) revert SellerCannotBid();
        if (bidAmount < a.reservePrice || bidAmount <= a.currentBid) revert BidTooLow();

        // Capture previous bidder (CEI pattern)
        address prevBidder = a.currentBidder;
        uint256 prevBid = a.currentBid;

        // Effects
        a.currentBidder = msg.sender;
        a.currentBid = bidAmount;
        a.automaticBetAmount = automaticBetAmount;

        // Interactions
        paymentToken.safeTransferFrom(msg.sender, address(this), bidAmount);
        if (prevBidder != address(0)) {
            paymentToken.safeTransfer(prevBidder, prevBid);
        }

        emit BidPlaced(auctionId, msg.sender, bidAmount, automaticBetAmount, prevBidder, prevBid);
    }

    /// @notice Close an expired auction. Callable by seller, admin, or CRE role.
    function closeAuction(uint256 auctionId) external {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (msg.sender != a.seller && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(CRE_ROLE, msg.sender)) {
            revert NotSellerOrAdmin();
        }
        _closeAuction(auctionId);
    }

    /// @notice Force-close an auction (e.g. market resolved while auction open). Admin/CRE only.
    function forceCloseAuction(uint256 auctionId, uint8 marketOutcome) external onlyAdminOrCRE {
        _forceCloseAuction(auctionId, marketOutcome);
    }

    /// @notice Resolve an external market — updates reputation for all linked auctions. Admin/CRE only.
    function resolveExternalMarket(uint256 externalMarketId, uint8 outcome) external onlyAdminOrCRE {
        _resolveExternalMarket(externalMarketId, outcome);
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
            (uint256 auctionId, uint8 marketOutcome) = abi.decode(payload, (uint256, uint8));
            _forceCloseAuction(auctionId, marketOutcome);
        } else if (action == ACTION_RESOLVE_MARKET) {
            (uint256 externalMarketId, uint8 outcome) = abi.decode(payload, (uint256, uint8));
            _resolveExternalMarket(externalMarketId, outcome);
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

        if (a.currentBidder != address(0)) {
            // Transfer winning bid to seller
            paymentToken.safeTransfer(a.seller, a.currentBid);

            // Track buyer's auction
            buyerAuctions[a.currentBidder].push(auctionId);

            emit TradeExecuted(
                auctionId,
                a.marketMetadata.marketId,
                a.currentBidder,
                a.automaticBetAmount,
                a.marketMetadata.betOnYes
            );
        }

        emit AuctionClosed(auctionId, a.currentBidder, a.currentBid, a.seller, a.marketMetadata.marketId);
    }

    function _forceCloseAuction(uint256 auctionId, uint8 marketOutcome) internal {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.ForceClosed;
        _removeOpenAuction(auctionId);

        // Refund bidder
        if (a.currentBidder != address(0)) {
            paymentToken.safeTransfer(a.currentBidder, a.currentBid);
        }

        // Update reputation
        int8 delta = _computeReputationDelta(a.marketMetadata.betOnYes, marketOutcome);
        if (delta != 0) {
            _sellers[a.seller].reputationScore += delta;
        }
        a.reputationResolved = true;

        emit AuctionForceClosed(
            auctionId, a.currentBidder, a.currentBid, a.seller, a.marketMetadata.marketId, delta
        );
        if (delta != 0) {
            emit ReputationUpdated(a.seller, auctionId, delta, _sellers[a.seller].reputationScore);
        }
    }

    function _resolveExternalMarket(uint256 externalMarketId, uint8 outcome) internal {
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
                if (a.currentBidder != address(0)) {
                    paymentToken.safeTransfer(a.currentBidder, a.currentBid);
                }
                emit AuctionForceClosed(aid, a.currentBidder, a.currentBid, a.seller, externalMarketId, 0);
            }

            // Update reputation if not already resolved (e.g. by forceCloseAuction)
            if (!a.reputationResolved) {
                a.reputationResolved = true;
                int8 delta = _computeReputationDelta(a.marketMetadata.betOnYes, outcome);
                if (delta != 0) {
                    _sellers[a.seller].reputationScore += delta;
                    emit ReputationUpdated(a.seller, aid, delta, _sellers[a.seller].reputationScore);
                }
            }
        }

        emit ExternalMarketResolved(externalMarketId, outcome, count);
    }

    /// @dev Compute reputation delta from seller's bet direction and actual outcome.
    ///      Outcome values match SimpleMarket.Outcome: 1=No, 2=Yes, 3=Inconclusive.
    function _computeReputationDelta(bool betOnYes, uint8 outcome) private pure returns (int8) {
        if (outcome == 2) { // Yes
            return betOnYes ? int8(1) : int8(-1);
        } else if (outcome == 1) { // No
            return betOnYes ? int8(-1) : int8(1);
        }
        return 0; // Inconclusive or None → no impact
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

    function getSeller(address sellerAddr) external view returns (Seller memory) {
        return _sellers[sellerAddr];
    }

    function getBuyerAuctions(address buyer) external view returns (uint256[] memory) {
        return buyerAuctions[buyer];
    }

    function getSellerAuctions(address sellerAddr) external view returns (uint256[] memory) {
        return sellerAuctions[sellerAddr];
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
