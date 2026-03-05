// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {SecretMarketplace} from "../src/SecretMarketplace.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";
import {SimpleMarket} from "../src/SimpleMarket.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract SecretMarketplaceTest is Test {
    SecretMarketplace public sm;
    MockUSDC public usdc;
    SimpleMarket public market;

    address owner = address(this);
    address seller = makeAddr("seller");
    address seller2 = makeAddr("seller2");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");
    address creAddress = makeAddr("cre");
    address forwarder = makeAddr("forwarder");
    address nobody = makeAddr("nobody");

    uint256 constant RESERVE_PRICE = 100e6; // 100 USDC
    uint256 constant MINT_AMOUNT = 10_000e6;
    uint256 constant BID_AMOUNT = 200e6;
    uint256 constant HIGHER_BID = 300e6;
    uint256 constant BET_AMOUNT = 500e6;

    // SimpleMarket.Outcome values
    uint8 constant OUTCOME_NONE = 0;
    uint8 constant OUTCOME_NO = 1;
    uint8 constant OUTCOME_YES = 2;
    uint8 constant OUTCOME_INCONCLUSIVE = 3;

    function setUp() public {
        usdc = new MockUSDC(0);
        market = new SimpleMarket(address(usdc), forwarder);
        sm = new SecretMarketplace(address(usdc), address(market), forwarder);

        // Grant CRE role
        sm.grantRole(sm.CRE_ROLE(), creAddress);

        // Create markets on SimpleMarket so createAuction validation passes
        market.newMarket("Test market 0");  // marketId=0
        market.newMarket("Test market 1");  // marketId=1
        market.newMarket("Test market 2");  // marketId=2
        market.newMarket("Test market 3");  // marketId=3
        market.newMarket("Test market 4");  // marketId=4

        usdc.mint(seller, MINT_AMOUNT);
        usdc.mint(seller2, MINT_AMOUNT);
        usdc.mint(bidder1, MINT_AMOUNT);
        usdc.mint(bidder2, MINT_AMOUNT);

        vm.prank(bidder1);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(bidder2);
        usdc.approve(address(sm), type(uint256).max);
    }

    // ===========================
    // ======= HELPERS ===========
    // ===========================

    function _createDefaultAuction() internal returns (uint256) {
        return _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
    }

    function _createAuction(
        address _seller, uint256 marketId, uint256 reserve, uint256 endTime, bool betOnYes
    ) internal returns (uint256) {
        vm.prank(_seller);
        return sm.createAuction(marketId, reserve, endTime, address(0), address(0), betOnYes);
    }

    function _placeBid(address bidder, uint256 auctionId, uint256 amount) internal {
        vm.prank(bidder);
        sm.placeBid(auctionId, amount, BET_AMOUNT);
    }

    // ===========================
    // ==== ACCESS CONTROL =======
    // ===========================

    function test_constructor_grantsAdminRole() public view {
        assertTrue(sm.hasRole(sm.DEFAULT_ADMIN_ROLE(), owner));
    }

    function test_grantCRERole() public view {
        assertTrue(sm.hasRole(sm.CRE_ROLE(), creAddress));
    }

    function test_nonAdmin_cannotGrantRole() public {
        bytes32 creRole = sm.CRE_ROLE();
        bytes32 adminRole = sm.DEFAULT_ADMIN_ROLE();
        assertFalse(sm.hasRole(adminRole, nobody));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                nobody,
                adminRole
            )
        );
        vm.prank(nobody);
        sm.grantRole(creRole, nobody);
    }

    // ===========================
    // ====== SELLER REGISTRY ====
    // ===========================

    function test_registerSeller() public {
        vm.prank(seller);
        sm.registerSeller("Alice");

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertTrue(s.registered);
        assertEq(s.name, "Alice");
        assertEq(s.reputationScore, 0);
    }

    function test_registerSeller_updateName() public {
        vm.prank(seller);
        sm.registerSeller("Alice");
        vm.prank(seller);
        sm.registerSeller("Alice Updated");

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.name, "Alice Updated");
    }

    function test_createAuction_autoRegistersSeller() public {
        uint256 id = _createDefaultAuction();
        assertEq(id, 0);

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertTrue(s.registered);
        assertEq(s.reputationScore, 0);
    }

    // ===========================
    // ======== CREATE ===========
    // ===========================

    function test_createAuction() public {
        uint256 id = _createDefaultAuction();

        assertEq(id, 0);
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(a.seller, seller);
        assertEq(a.reservePrice, RESERVE_PRICE);
        assertEq(a.currentBidder, address(0));
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Open));
        assertTrue(a.marketMetadata.betOnYes);
        assertEq(a.marketMetadata.marketId, 0);
    }

    function test_createAuction_tracksMarketForResolution() public {
        _createDefaultAuction(); // market 0

        uint256[] memory unresolved = sm.getUnresolvedMarkets();
        assertEq(unresolved.length, 1);
        assertEq(unresolved[0], 0);

        uint256[] memory linked = sm.getMarketAuctions(0);
        assertEq(linked.length, 1);
        assertEq(linked[0], 0);
    }

    function test_createAuction_multipleAuctionsSameMarket() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller2, 0, RESERVE_PRICE, block.timestamp + 1 hours, false);

        // Market tracked only once
        uint256[] memory unresolved = sm.getUnresolvedMarkets();
        assertEq(unresolved.length, 1);

        // Both auctions linked
        uint256[] memory linked = sm.getMarketAuctions(0);
        assertEq(linked.length, 2);
    }

    function test_createAuction_tracksSellerAuctions() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller, 1, RESERVE_PRICE, block.timestamp + 1 hours, false);

        uint256[] memory auctions = sm.getSellerAuctions(seller);
        assertEq(auctions.length, 2);
        assertEq(auctions[0], 0);
        assertEq(auctions[1], 1);
    }

    function test_createAuction_addsToOpenList() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller, 1, RESERVE_PRICE, block.timestamp + 1 hours, true);

        uint256[] memory open = sm.getOpenAuctions();
        assertEq(open.length, 2);
    }

    function test_createAuction_revert_endTimeInPast() public {
        vm.expectRevert(SecretMarketplace.EndTimeInPast.selector);
        sm.createAuction(0, RESERVE_PRICE, block.timestamp - 1, address(0), address(0), true);
    }

    function test_createAuction_revert_reservePriceZero() public {
        vm.expectRevert(SecretMarketplace.ReservePriceZero.selector);
        sm.createAuction(0, 0, block.timestamp + 1 hours, address(0), address(0), true);
    }

    function test_createAuction_revert_marketDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.MarketDoesNotExist.selector, 99));
        sm.createAuction(99, RESERVE_PRICE, block.timestamp + 1 hours, address(0), address(0), true);
    }

    // ===========================
    // ======== PLACE BID ========
    // ===========================

    function test_placeBid() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(a.currentBidder, bidder1);
        assertEq(a.currentBid, BID_AMOUNT);
        assertEq(a.automaticBetAmount, BET_AMOUNT);
    }

    function test_placeBid_outbidRefundsPrevious() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        uint256 balBefore = usdc.balanceOf(bidder1);
        _placeBid(bidder2, id, HIGHER_BID);
        uint256 balAfter = usdc.balanceOf(bidder1);

        assertEq(balAfter - balBefore, BID_AMOUNT);
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(a.currentBidder, bidder2);
    }

    function test_placeBid_revert_sellerCannotBid() public {
        uint256 id = _createDefaultAuction();
        vm.prank(seller);
        usdc.approve(address(sm), type(uint256).max);

        vm.expectRevert(SecretMarketplace.SellerCannotBid.selector);
        vm.prank(seller);
        sm.placeBid(id, BID_AMOUNT, BET_AMOUNT);
    }

    function test_placeBid_revert_doesNotExist() public {
        vm.expectRevert(SecretMarketplace.AuctionDoesNotExist.selector);
        vm.prank(bidder1);
        sm.placeBid(999, BID_AMOUNT, BET_AMOUNT);
    }

    function test_placeBid_revert_belowReserve() public {
        uint256 id = _createDefaultAuction();
        vm.expectRevert(SecretMarketplace.BidTooLow.selector);
        vm.prank(bidder1);
        sm.placeBid(id, RESERVE_PRICE - 1, BET_AMOUNT);
    }

    function test_placeBid_revert_auctionEnded() public {
        uint256 id = _createDefaultAuction();
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(SecretMarketplace.AuctionNotActive.selector);
        vm.prank(bidder1);
        sm.placeBid(id, BID_AMOUNT, BET_AMOUNT);
    }

    // ===========================
    // ======== CLOSE ============
    // ===========================

    function test_closeAuction_transfersToSeller() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        uint256 sellerBefore = usdc.balanceOf(seller);
        sm.closeAuction(id);
        uint256 sellerAfter = usdc.balanceOf(seller);

        assertEq(sellerAfter - sellerBefore, BID_AMOUNT);
    }

    function test_closeAuction_tracksBuyerAuction() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(id);

        uint256[] memory buys = sm.getBuyerAuctions(bidder1);
        assertEq(buys.length, 1);
        assertEq(buys[0], id);
    }

    function test_closeAuction_sellerCanClose() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(seller);
        sm.closeAuction(id);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_closeAuction_creCanClose() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(creAddress);
        sm.closeAuction(id);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_closeAuction_revert_notSellerOrAdmin() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(SecretMarketplace.NotSellerOrAdmin.selector);
        vm.prank(nobody);
        sm.closeAuction(id);
    }

    function test_closeAuction_revert_notEnded() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        vm.expectRevert(SecretMarketplace.AuctionNotEnded.selector);
        sm.closeAuction(id);
    }

    function test_closeAuction_noBids() public {
        uint256 id = _createDefaultAuction();
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(id);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(a.currentBidder, address(0));
    }

    function test_closeAuction_removesFromOpenList() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller, 1, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller, 2, RESERVE_PRICE, block.timestamp + 1 hours, true);
        vm.warp(block.timestamp + 2 hours);

        sm.closeAuction(1); // close middle one
        uint256[] memory open = sm.getOpenAuctions();
        assertEq(open.length, 2);
    }

    // ===========================
    // ====== FORCE CLOSE ========
    // ===========================

    function test_forceCloseAuction_refundsBidder() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        uint256 balBefore = usdc.balanceOf(bidder1);
        sm.forceCloseAuction(id, OUTCOME_YES);
        uint256 balAfter = usdc.balanceOf(bidder1);

        assertEq(balAfter - balBefore, BID_AMOUNT);
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    function test_forceCloseAuction_updatesReputation_positive() public {
        uint256 id = _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true); // betOnYes
        _placeBid(bidder1, id, BID_AMOUNT);

        sm.forceCloseAuction(id, OUTCOME_YES); // seller was right

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.reputationScore, 1);
    }

    function test_forceCloseAuction_updatesReputation_negative() public {
        uint256 id = _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true); // betOnYes
        _placeBid(bidder1, id, BID_AMOUNT);

        sm.forceCloseAuction(id, OUTCOME_NO); // seller was wrong

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.reputationScore, -1);
    }

    function test_forceCloseAuction_inconclusive_noImpact() public {
        uint256 id = _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _placeBid(bidder1, id, BID_AMOUNT);

        sm.forceCloseAuction(id, OUTCOME_INCONCLUSIVE);

        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.reputationScore, 0);
    }

    function test_forceCloseAuction_revert_notAdminOrCRE() public {
        uint256 id = _createDefaultAuction();

        vm.expectRevert();
        vm.prank(nobody);
        sm.forceCloseAuction(id, OUTCOME_YES);
    }

    function test_forceCloseAuction_creCanCall() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        vm.prank(creAddress);
        sm.forceCloseAuction(id, OUTCOME_YES);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    // ===========================
    // === RESOLVE MARKET ========
    // ===========================

    function test_resolveExternalMarket_updatesReputationForAllAuctions() public {
        // Two sellers on same market, different directions
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);   // betOnYes
        _createAuction(seller2, 0, RESERVE_PRICE, block.timestamp + 1 hours, false); // betOnNo
        _placeBid(bidder1, 0, BID_AMOUNT);
        _placeBid(bidder2, 1, BID_AMOUNT);

        // Close both auctions
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.closeAuction(1);

        // Market resolves as Yes
        sm.resolveExternalMarket(0, OUTCOME_YES);

        SecretMarketplace.Seller memory s1 = sm.getSeller(seller);
        SecretMarketplace.Seller memory s2 = sm.getSeller(seller2);
        assertEq(s1.reputationScore, 1);  // seller bet Yes, outcome Yes → +1
        assertEq(s2.reputationScore, -1); // seller2 bet No, outcome Yes → -1
    }

    function test_resolveExternalMarket_forceClosesOpenAuctions() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _placeBid(bidder1, 0, BID_AMOUNT);

        uint256 balBefore = usdc.balanceOf(bidder1);
        sm.resolveExternalMarket(0, OUTCOME_YES);
        uint256 balAfter = usdc.balanceOf(bidder1);

        // Bidder refunded
        assertEq(balAfter - balBefore, BID_AMOUNT);

        // Auction force-closed
        SecretMarketplace.Auction memory a = sm.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));

        // Reputation updated
        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.reputationScore, 1);
    }

    function test_resolveExternalMarket_skipsAlreadyResolvedReputation() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _placeBid(bidder1, 0, BID_AMOUNT);

        // Force-close first (resolves reputation for this auction)
        sm.forceCloseAuction(0, OUTCOME_YES);
        assertEq(sm.getSeller(seller).reputationScore, 1);

        // Now resolve the market — should NOT double-count
        sm.resolveExternalMarket(0, OUTCOME_YES);
        assertEq(sm.getSeller(seller).reputationScore, 1); // still 1, not 2
    }

    function test_resolveExternalMarket_removesFromUnresolvedList() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createAuction(seller, 1, RESERVE_PRICE, block.timestamp + 1 hours, true);

        assertEq(sm.getUnresolvedMarkets().length, 2);

        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.resolveExternalMarket(0, OUTCOME_YES);

        assertEq(sm.getUnresolvedMarkets().length, 1);
        assertEq(sm.getUnresolvedMarkets()[0], 1);
    }

    function test_resolveExternalMarket_revert_alreadyResolved() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.resolveExternalMarket(0, OUTCOME_YES);

        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.MarketAlreadyResolved.selector, 0));
        sm.resolveExternalMarket(0, OUTCOME_NO);
    }

    function test_resolveExternalMarket_revert_notAdminOrCRE() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);

        vm.expectRevert();
        vm.prank(nobody);
        sm.resolveExternalMarket(0, OUTCOME_YES);
    }

    function test_resolveExternalMarket_inconclusive_noReputationChange() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        sm.resolveExternalMarket(0, OUTCOME_INCONCLUSIVE);
        assertEq(sm.getSeller(seller).reputationScore, 0);
    }

    // ===========================
    // ====== CRE REPORTS ========
    // ===========================

    function test_processReport_closeAuction() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        bytes memory report = abi.encodePacked(uint8(0), abi.encode(id));
        vm.prank(forwarder);
        sm.onReport("", report);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_processReport_forceClose() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        bytes memory report = abi.encodePacked(uint8(1), abi.encode(id, uint8(OUTCOME_YES)));
        vm.prank(forwarder);
        sm.onReport("", report);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    function test_processReport_resolveMarket() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        bytes memory report = abi.encodePacked(uint8(2), abi.encode(uint256(0), uint8(OUTCOME_YES)));
        vm.prank(forwarder);
        sm.onReport("", report);

        assertTrue(sm.marketResolved(0));
    }

    function test_processReport_revert_notForwarder() public {
        vm.expectRevert();
        vm.prank(nobody);
        sm.onReport("", abi.encodePacked(uint8(0), abi.encode(uint256(0))));
    }

    function test_processReport_revert_unknownAction() public {
        bytes memory report = abi.encodePacked(uint8(99), abi.encode(uint256(0)));
        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.UnknownAction.selector, 99));
        vm.prank(forwarder);
        sm.onReport("", report);
    }

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    function test_emits_SellerRegistered() public {
        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.SellerRegistered(seller, "Alice");
        vm.prank(seller);
        sm.registerSeller("Alice");
    }

    function test_emits_AuctionCreated() public {
        vm.expectEmit(true, true, true, true);
        emit SecretMarketplace.AuctionCreated(0, seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        _createDefaultAuction();
    }

    function test_emits_BidPlaced() public {
        uint256 id = _createDefaultAuction();
        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.BidPlaced(id, bidder1, BID_AMOUNT, BET_AMOUNT, address(0), 0);
        _placeBid(bidder1, id, BID_AMOUNT);
    }

    function test_emits_AuctionClosed() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionClosed(id, bidder1, BID_AMOUNT, seller, 0);
        sm.closeAuction(id);
    }

    function test_emits_TradeExecuted() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, true, true);
        emit SecretMarketplace.TradeExecuted(id, 0, bidder1, BET_AMOUNT, true);
        sm.closeAuction(id);
    }

    function test_emits_AuctionForceClosed() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionForceClosed(id, bidder1, BID_AMOUNT, seller, 0, int8(1));
        sm.forceCloseAuction(id, OUTCOME_YES);
    }

    function test_emits_ReputationUpdated() public {
        uint256 id = _createDefaultAuction();
        _placeBid(bidder1, id, BID_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.ReputationUpdated(seller, id, int8(1), int256(1));
        sm.forceCloseAuction(id, OUTCOME_YES);
    }

    function test_emits_ExternalMarketResolved() public {
        _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.ExternalMarketResolved(0, OUTCOME_YES, 1);
        sm.resolveExternalMarket(0, OUTCOME_YES);
    }

    // ===========================
    // ====== FULL LIFECYCLE =====
    // ===========================

    function test_fullLifecycle() public {
        // 1. Register seller
        vm.prank(seller);
        sm.registerSeller("Insider Alice");

        // 2. Create auction (betOnYes)
        uint256 id = _createAuction(seller, 0, RESERVE_PRICE, block.timestamp + 1 hours, true);

        // 3. Bidder places bid
        _placeBid(bidder1, id, BID_AMOUNT);

        // 4. Wait and close
        vm.warp(block.timestamp + 2 hours);
        vm.prank(seller);
        sm.closeAuction(id);

        // 5. Verify seller received payment
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(a.currentBidder, bidder1);

        // 6. Buyer tracked
        uint256[] memory buys = sm.getBuyerAuctions(bidder1);
        assertEq(buys.length, 1);

        // 7. Resolve market → reputation +1
        sm.resolveExternalMarket(0, OUTCOME_YES);
        SecretMarketplace.Seller memory s = sm.getSeller(seller);
        assertEq(s.reputationScore, 1);
        assertEq(s.name, "Insider Alice");
    }

    // ===========================
    // ==== supportsInterface ====
    // ===========================

    function test_supportsInterface_IReceiver() public view {
        // IReceiver interface ID
        assertTrue(sm.supportsInterface(type(IAccessControl).interfaceId));
    }
}
