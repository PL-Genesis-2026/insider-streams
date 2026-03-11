// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, euint256, externalEbool, externalEuint64, externalEuint256} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {FHESafeMath} from "@openzeppelin/confidential-contracts/utils/FHESafeMath.sol";

/// @title FHESecretMarketplace
/// @notice Secrets marketplace with FHE-encrypted bids, predictions, and secret data keys.
/// @dev Admin-proxy model: only the owner (admin EOA) interacts on-chain.
///      Users are identified by pseudonymous string IDs. No user addresses appear on-chain.
///      Balances are encrypted via FHE, keyed by pseudonymous ID.
///      Highest-bid-only model: one encrypted currentBid per auction.
contract FHESecretMarketplace is ZamaEthereumConfig, Ownable, ReentrancyGuard {

    // ===========================
    // ======== ENUMS ============
    // ===========================

    enum AuctionStatus { Open, Closed, Cancelled }
    enum PredictionOutcome { NoPrediction, PredictionCorrect, PredictionWrong }

    // ===========================
    // ======== STRUCTS ==========
    // ===========================

    struct Auction {
        string sellerId;             // pseudonymous seller ID
        uint256 endTime;             // plaintext — when auction expires
        euint64 currentBid;          // ENCRYPTED — highest bid amount (single bid)
        string currentBidderId;      // pseudonymous ID of current highest bidder
        ebool sellerPrediction;      // ENCRYPTED — seller's yes/no prediction
        uint256 eventId;             // plaintext — which prediction market event
        string eventTitle;           // plaintext
        AuctionStatus status;        // plaintext
        bool reputationResolved;     // plaintext
        bytes32 secretDataCid;       // IPFS CID hash for encrypted secret_data
        euint256 secretDataKey;      // ENCRYPTED — AES-256 key for decrypting secret_data
        uint64 currentBidPlaintext;  // plaintext mirror of currentBid for events + validation
    }

    struct Seller {
        int256 reputationScore;
        bool registered;
    }

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    event SellerRegistered(string sellerId);

    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed eventId,
        string sellerId,
        string eventTitle,
        uint256 endTime,
        bytes32 secretDataCid
    );

    event BidPlaced(uint256 indexed auctionId, uint64 bidAmount, uint64 previousBid);

    event AuctionClosePending(
        uint256 indexed auctionId,
        string sellerId,
        uint256 eventId
    );

    event AuctionClosed(
        uint256 indexed auctionId,
        uint64 winningBid,
        string sellerId,
        uint256 eventId
    );

    event AuctionCancelled(
        uint256 indexed auctionId,
        string sellerId,
        uint256 eventId
    );

    event ExternalEventResolved(
        uint256 indexed externalEventId,
        uint256 auctionsAffected
    );

    event SellerReputationScoreUpdated(
        string sellerId,
        uint256 indexed auctionId,
        PredictionOutcome predictionOutcome,
        int8 scoreChange,
        int256 newScore
    );

    event AuctionAdminExpired(uint256 indexed auctionId);

    event SettlerUpdated(address indexed previousSettler, address indexed newSettler);

    event DepositedFor(string userId);
    event WithdrawnFor(string userId);

    // ===========================
    // ======== ERRORS ===========
    // ===========================

    error EndTimeInPast();
    error AuctionDoesNotExist();
    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error EventAlreadyResolved(uint256 eventId);
    error NotSettler();
    error NotPendingDecryption();

    // ===========================
    // ======= STATE VARS ========
    // ===========================

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) internal _auctions;

    // Internal encrypted balances keyed by pseudonymous user ID
    mapping(string => euint64) internal _balances;

    // Open auction tracking (for polling by closer daemon)
    uint256[] public openAuctionIds;
    mapping(uint256 => uint256) private _openAuctionIndex; // auctionId => index+1

    // Unresolved event tracking (for reputation resolution)
    uint256[] public unresolvedEventIds;
    mapping(uint256 => uint256) private _unresolvedEventIndex; // eventId => index+1
    mapping(uint256 => bool) public eventResolved;

    // Event -> auctions mapping
    mapping(uint256 => uint256[]) public eventAuctions;

    // Seller registry
    mapping(string => Seller) internal _sellers;
    mapping(string => uint256[]) public sellerAuctions;

    // Payment token (ConfidentialERC20 / ERC-7984)
    IERC7984 public immutable paymentToken;

    // Settler address (for reputation resolution)
    address public settler;

    // Pending auction close decryptions
    mapping(uint256 => bool) public pendingAuctionClose;

    // Pending reputation decryptions
    mapping(uint256 => bool) public pendingReputationDecrypt;
    mapping(uint256 => bool) private _expectedOutcomes;
    mapping(uint256 => ebool) public pendingIsCorrectHandle;

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

    constructor(
        address token,
        address settlerAddress
    ) Ownable(msg.sender) {
        paymentToken = IERC7984(token);
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

    /// @notice Debug only: immediately expire an open auction.
    function adminExpireAuction(uint256 auctionId) external onlyOwner {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();
        a.endTime = block.timestamp;
        emit AuctionAdminExpired(auctionId);
    }

    // ===========================
    // ====== DEPOSIT/WITHDRAW ===
    // ===========================

    /// @notice Deposit encrypted tokens into a user's internal balance.
    /// @dev Admin-only. The admin EOA must have set this contract as operator on the payment token.
    ///      Admin creates the encrypted input with their own address as sender.
    /// @param userId Pseudonymous user identifier (never an address)
    function depositFor(
        string calldata userId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner nonReentrant {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Transfer from admin to contract (balance-diff pattern)
        euint64 balanceBefore = paymentToken.confidentialBalanceOf(address(this));
        FHE.allowTransient(amount, address(paymentToken));
        paymentToken.confidentialTransferFrom(msg.sender, address(this), amount);
        euint64 balanceAfter = paymentToken.confidentialBalanceOf(address(this));
        euint64 actualTransferred = FHE.sub(balanceAfter, balanceBefore);

        // Credit user's internal balance
        _creditBalance(userId, actualTransferred);

        emit DepositedFor(userId);
    }

    /// @notice Withdraw encrypted tokens from a user's internal balance to admin.
    /// @dev Admin-only. Deducts from user's balance, transfers tokens to admin EOA.
    ///      Admin then sends to user via Private Token API.
    /// @param userId Pseudonymous user identifier
    function withdrawFor(
        string calldata userId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner nonReentrant {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Deduct from user's balance
        (ebool hasEnough, euint64 newBalance) = FHESafeMath.tryDecrease(_balances[userId], amount);
        euint64 effectiveAmount = FHE.select(hasEnough, amount, FHE.asEuint64(0));
        _balances[userId] = FHE.select(hasEnough, newBalance, _balances[userId]);
        FHE.allowThis(_balances[userId]);

        // Transfer tokens from contract to admin
        FHE.allowTransient(effectiveAmount, address(paymentToken));
        paymentToken.confidentialTransfer(msg.sender, effectiveAmount);

        emit WithdrawnFor(userId);
    }

    /// @notice Get the encrypted internal balance for a user.
    function getBalance(string calldata userId) external view returns (euint64) {
        return _balances[userId];
    }

    /// @notice Mark a user's balance handle for public decryption.
    /// @dev Only owner (daemon) can request this. After calling, the balance handle
    ///      can be decrypted off-chain via the Zama relayer's publicDecrypt().
    function requestBalanceDecrypt(string calldata userId) external onlyOwner {
        require(FHE.isInitialized(_balances[userId]), "No balance");
        FHE.makePubliclyDecryptable(_balances[userId]);
    }

    // ===========================
    // ======== SELLER ===========
    // ===========================

    function _ensureSellerRegistered(string calldata sellerId) internal {
        Seller storage s = _sellers[sellerId];
        if (!s.registered) {
            s.registered = true;
            s.reputationScore = 0;
            emit SellerRegistered(sellerId);
        }
    }

    // ===========================
    // ======== AUCTIONS =========
    // ===========================

    /// @notice Create a new auction with an encrypted prediction and secret data.
    /// @dev Admin-only. Admin creates encrypted inputs with their own address.
    /// @param sellerId Pseudonymous seller identifier
    /// @param eventId The prediction market event this auction is for
    /// @param eventTitle Human-readable event title
    /// @param endTime Unix timestamp when auction expires
    /// @param encryptedPrediction Encrypted boolean prediction (true=yes, false=no)
    /// @param secretDataCid IPFS CID of the encrypted secret data blob
    /// @param encryptedSecretKey Encrypted AES-256 key for decrypting the secret data
    /// @param inputProof ZKPoK proof for the encrypted inputs
    function createAuction(
        string calldata sellerId,
        uint256 eventId,
        string calldata eventTitle,
        uint256 endTime,
        externalEbool encryptedPrediction,
        bytes32 secretDataCid,
        externalEuint256 encryptedSecretKey,
        bytes calldata inputProof
    ) external onlyOwner returns (uint256) {
        if (endTime <= block.timestamp) revert EndTimeInPast();

        _ensureSellerRegistered(sellerId);

        uint256 auctionId = nextAuctionId++;
        Auction storage a = _auctions[auctionId];
        a.sellerId = sellerId;
        a.endTime = endTime;
        a.eventId = eventId;
        a.eventTitle = eventTitle;
        a.status = AuctionStatus.Open;
        a.secretDataCid = secretDataCid;

        // Store encrypted prediction — only contract can access
        a.sellerPrediction = FHE.fromExternal(encryptedPrediction, inputProof);
        FHE.allowThis(a.sellerPrediction);

        // Store encrypted secret key — only contract can access
        // Admin decrypts off-chain and delivers to winner after close
        a.secretDataKey = FHE.fromExternal(encryptedSecretKey, inputProof);
        FHE.allowThis(a.secretDataKey);

        // Track open auction
        openAuctionIds.push(auctionId);
        _openAuctionIndex[auctionId] = openAuctionIds.length;

        // Track event for reputation resolution
        if (_unresolvedEventIndex[eventId] == 0 && !eventResolved[eventId]) {
            unresolvedEventIds.push(eventId);
            _unresolvedEventIndex[eventId] = unresolvedEventIds.length;
        }
        eventAuctions[eventId].push(auctionId);

        // Track seller's auctions
        sellerAuctions[sellerId].push(auctionId);

        emit AuctionCreated(auctionId, eventId, sellerId, eventTitle, endTime, secretDataCid);
        return auctionId;
    }

    /// @notice Place a bid on an open auction (highest-bid-only model).
    /// @dev Admin-only. On-chain validation ensures new bid exceeds current bid.
    ///      If there is a previous bid, it is refunded to the previous bidder's balance.
    ///      The new bid is deducted from the new bidder's balance.
    /// @param auctionId The auction to bid on
    /// @param bidderId Pseudonymous ID of the new bidder
    /// @param previousBidderId Pseudonymous ID of the previous highest bidder (empty if first bid)
    /// @param encryptedAmount Encrypted bid amount
    /// @param inputProof ZKPoK proof for the encrypted input
    /// @param bidAmountPlaintext Plaintext bid amount for on-chain validation and event emission
    function placeBid(
        uint256 auctionId,
        string calldata bidderId,
        string calldata previousBidderId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        uint64 bidAmountPlaintext
    ) external onlyOwner nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp >= a.endTime) revert AuctionNotActive();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        // On-chain bid validation
        require(bidAmountPlaintext > a.currentBidPlaintext, "Bid must exceed current bid");

        uint64 previousBidPlaintext = a.currentBidPlaintext;

        euint64 newBid = FHE.fromExternal(encryptedAmount, inputProof);

        // Deduct new bid from bidder's balance
        (ebool hasEnough, euint64 newBalance) = FHESafeMath.tryDecrease(_balances[bidderId], newBid);
        euint64 effectiveBid = FHE.select(hasEnough, newBid, FHE.asEuint64(0));
        _balances[bidderId] = FHE.select(hasEnough, newBalance, _balances[bidderId]);
        FHE.allowThis(_balances[bidderId]);

        // Refund previous bidder (if any)
        if (FHE.isInitialized(a.currentBid) && bytes(previousBidderId).length > 0) {
            _creditBalance(previousBidderId, a.currentBid);
        }

        // Replace bid
        a.currentBid = effectiveBid;
        a.currentBidderId = bidderId;
        a.currentBidPlaintext = bidAmountPlaintext;
        FHE.allowThis(a.currentBid);

        emit BidPlaced(auctionId, bidAmountPlaintext, previousBidPlaintext);
    }

    /// @notice Close an expired auction. Admin-only.
    /// @dev Step 1 of 2-step close. Credits seller's balance with the winning bid.
    ///      Makes currentBid publicly decryptable for the finalize step.
    function closeAuction(uint256 auctionId) external onlyOwner {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (block.timestamp < a.endTime) revert AuctionNotEnded();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.Closed;
        _removeOpenAuction(auctionId);

        // If there's a bid, credit seller and mark for decryption
        if (FHE.isInitialized(a.currentBid)) {
            // Credit seller's balance with winning bid amount (encrypted add)
            _creditBalance(a.sellerId, a.currentBid);

            // Mark bid for public decryption (for the AuctionClosed event)
            FHE.makePubliclyDecryptable(a.currentBid);
            pendingAuctionClose[auctionId] = true;
        }

        emit AuctionClosePending(auctionId, a.sellerId, a.eventId);
    }

    /// @notice Finalize auction close with decrypted bid amount.
    /// @dev Step 2 of 2-step close. Verifies decryption proof for currentBid.
    /// @param auctionId The auction to finalize
    /// @param winningBid The decrypted winning bid amount
    /// @param decryptionProof Proof from the Zama Relayer
    function finalizeAuctionClose(
        uint256 auctionId,
        uint64 winningBid,
        bytes calldata decryptionProof
    ) external {
        if (!pendingAuctionClose[auctionId]) revert NotPendingDecryption();
        Auction storage a = _auctions[auctionId];

        // Verify decryption of currentBid
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(a.currentBid);
        FHE.checkSignatures(cts, abi.encode(winningBid), decryptionProof);

        pendingAuctionClose[auctionId] = false;

        emit AuctionClosed(auctionId, winningBid, a.sellerId, a.eventId);
    }

    /// @notice Cancel an open auction. Admin-only.
    /// @dev Refunds currentBid to the current bidder's balance.
    function cancelAuction(uint256 auctionId) external onlyOwner nonReentrant {
        Auction storage a = _auctions[auctionId];
        if (a.endTime == 0) revert AuctionDoesNotExist();
        if (a.status != AuctionStatus.Open) revert AuctionAlreadySettled();

        a.status = AuctionStatus.Cancelled;
        _removeOpenAuction(auctionId);

        // Refund current bidder
        if (FHE.isInitialized(a.currentBid)) {
            _creditBalance(a.currentBidderId, a.currentBid);
        }

        emit AuctionCancelled(auctionId, a.sellerId, a.eventId);
    }

    // ===========================
    // ======== REPUTATION =======
    // ===========================

    /// @notice Resolve predictions for all auctions tied to an event.
    /// @dev Auto-cancels any still-open auctions and refunds their bids.
    /// @param eventId The prediction market event that was settled
    /// @param actualOutcomeIsYes Whether the event outcome was YES
    function resolveEventPredictions(uint256 eventId, bool actualOutcomeIsYes) external onlySettler {
        if (eventResolved[eventId]) revert EventAlreadyResolved(eventId);

        uint256[] storage auctionIds = eventAuctions[eventId];

        for (uint256 i = 0; i < auctionIds.length; i++) {
            uint256 aid = auctionIds[i];
            Auction storage a = _auctions[aid];

            // Cancel if still open — refund current bidder
            if (a.status == AuctionStatus.Open) {
                a.status = AuctionStatus.Cancelled;
                _removeOpenAuction(aid);
                if (FHE.isInitialized(a.currentBid)) {
                    _creditBalance(a.currentBidderId, a.currentBid);
                }
                emit AuctionCancelled(aid, a.sellerId, a.eventId);
            }

            if (!a.reputationResolved && FHE.isInitialized(a.sellerPrediction)) {
                // Compare encrypted prediction to actual outcome
                ebool expectedPrediction = FHE.asEbool(actualOutcomeIsYes);
                ebool isCorrect = FHE.eq(a.sellerPrediction, expectedPrediction);

                // Mark for public decryption
                FHE.makePubliclyDecryptable(isCorrect);
                pendingReputationDecrypt[aid] = true;
                pendingIsCorrectHandle[aid] = isCorrect;
                _expectedOutcomes[aid] = actualOutcomeIsYes;
            }
        }

        eventResolved[eventId] = true;
        _removeUnresolvedEvent(eventId);

        emit ExternalEventResolved(eventId, auctionIds.length);
    }

    /// @notice Finalize reputation result after decryption.
    /// @param auctionId The auction to finalize reputation for
    /// @param predictionWasCorrect The decrypted comparison result
    /// @param decryptionProof Proof from the Zama Relayer
    function finalizeReputationResult(
        uint256 auctionId,
        bool predictionWasCorrect,
        bytes calldata decryptionProof
    ) external {
        if (!pendingReputationDecrypt[auctionId]) revert NotPendingDecryption();
        Auction storage a = _auctions[auctionId];

        // Reconstruct the comparison to verify
        ebool expectedPrediction = FHE.asEbool(_expectedOutcomes[auctionId]);
        ebool isCorrect = FHE.eq(a.sellerPrediction, expectedPrediction);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isCorrect);
        FHE.checkSignatures(cts, abi.encode(predictionWasCorrect), decryptionProof);

        a.reputationResolved = true;
        pendingReputationDecrypt[auctionId] = false;

        int8 scoreChange = predictionWasCorrect ? int8(1) : int8(-1);
        _sellers[a.sellerId].reputationScore += scoreChange;

        emit SellerReputationScoreUpdated(
            a.sellerId,
            auctionId,
            predictionWasCorrect ? PredictionOutcome.PredictionCorrect : PredictionOutcome.PredictionWrong,
            scoreChange,
            _sellers[a.sellerId].reputationScore
        );
    }

    // ===========================
    // ======= BALANCE HELPER ====
    // ===========================

    /// @dev Credit a user's internal balance by an encrypted amount.
    function _creditBalance(string memory userId, euint64 amount) internal {
        if (bytes(userId).length == 0 || !FHE.isInitialized(amount)) return;
        if (FHE.isInitialized(_balances[userId])) {
            _balances[userId] = FHE.add(_balances[userId], amount);
        } else {
            _balances[userId] = amount;
        }
        FHE.allowThis(_balances[userId]);
    }

    // ===========================
    // ======== VIEWS ============
    // ===========================

    function getAuction(uint256 auctionId) external view returns (
        string memory sellerId,
        uint256 endTime,
        euint64 currentBid,
        string memory currentBidderId,
        uint256 eventId,
        string memory eventTitle,
        AuctionStatus status,
        bool reputationResolved,
        bytes32 secretDataCid,
        uint64 currentBidPlaintext
    ) {
        Auction storage a = _auctions[auctionId];
        return (
            a.sellerId,
            a.endTime,
            a.currentBid,
            a.currentBidderId,
            a.eventId,
            a.eventTitle,
            a.status,
            a.reputationResolved,
            a.secretDataCid,
            a.currentBidPlaintext
        );
    }

    function getOpenAuctions() external view returns (uint256[] memory) {
        return openAuctionIds;
    }

    function getUnresolvedEvents() external view returns (uint256[] memory) {
        return unresolvedEventIds;
    }

    function getEventAuctions(uint256 eventId) external view returns (uint256[] memory) {
        return eventAuctions[eventId];
    }

    function getSeller(string calldata sellerId) external view returns (Seller memory) {
        return _sellers[sellerId];
    }

    function getSellerAuctions(string calldata sellerId) external view returns (uint256[] memory) {
        return sellerAuctions[sellerId];
    }

    /// @notice Get the encrypted secret data key (only accessible by ACL-authorized accounts).
    function getSecretDataKey(uint256 auctionId) external view returns (euint256) {
        return _auctions[auctionId].secretDataKey;
    }

    /// @notice Get the encrypted seller prediction (only accessible by ACL-authorized accounts).
    function getSellerPrediction(uint256 auctionId) external view returns (ebool) {
        return _auctions[auctionId].sellerPrediction;
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
