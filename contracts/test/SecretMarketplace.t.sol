// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {SecretMarketplace} from "../src/SecretMarketplace.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract SecretMarketplaceTest is Test {
    SecretMarketplace public sm;
    MockUSDC public usdc;
    ExamplePredictionMarket public market;

    address owner = address(this);
    address creAddress = makeAddr("cre");
    address forwarder = makeAddr("forwarder");
    address nobody = makeAddr("nobody");

    uint256 constant MINT_AMOUNT = 10_000e6;
    uint256 constant BID_AMOUNT = 200e6;
    uint256 constant HIGHER_BID = 300e6;

    function setUp() public {
        usdc = new MockUSDC(0);
        market = new ExamplePredictionMarket(address(usdc), forwarder);
        sm = new SecretMarketplace(address(usdc), address(market), forwarder);

        // Grant CRE role
        sm.grantRole(sm.CRE_ROLE(), creAddress);

        // newEvent requires 10 USDC initial liquidity
        usdc.mint(address(this), MINT_AMOUNT);
        usdc.approve(address(market), type(uint256).max);
        usdc.approve(address(sm), type(uint256).max);

        // Create events on ExamplePredictionMarket so createAuction validation passes
        market.newEvent("Test event 0", 3 minutes);  // eventId=0
        market.newEvent("Test event 1", 3 minutes);  // eventId=1
        market.newEvent("Test event 2", 3 minutes);  // eventId=2
        market.newEvent("Test event 3", 3 minutes);  // eventId=3
        market.newEvent("Test event 4", 3 minutes);  // eventId=4
    }

    // ===========================
    // ======= HELPERS ===========
    // ===========================

    function _createDefaultAuction() internal returns (uint256) {
        return sm.createAuction("Alice", 0, "Test Event", block.timestamp + 1 hours);
    }

    function _createAuction(
        string memory seller, uint256 eventId, string memory eventTitle, uint256 endTime
    ) internal returns (uint256) {
        return sm.createAuction(seller, eventId, eventTitle, endTime);
    }

    function _placeBid(uint256 auctionId, uint256 amount) internal {
        sm.placeBid(auctionId, amount);
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
        sm.registerSeller("Alice");

        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
        assertTrue(s.registered);
        assertEq(s.reputationScore, 0);
    }

    function test_registerSeller_revert_notAdmin() public {
        vm.expectRevert();
        vm.prank(nobody);
        sm.registerSeller("Alice");
    }

    function test_createAuction_autoRegistersSeller() public {
        uint256 id = _createDefaultAuction();
        assertEq(id, 0);

        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
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
        assertEq(a.seller, "Alice");
        assertEq(a.eventId, 0);
        assertEq(a.eventTitle, "Test Event");
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Open));
    }

    function test_createAuction_revert_notAdmin() public {
        vm.expectRevert();
        vm.prank(nobody);
        sm.createAuction("Alice", 0, "Test Event", block.timestamp + 1 hours);
    }

    function test_createAuction_tracksEventForResolution() public {
        _createDefaultAuction(); // eventId 0

        uint256[] memory unresolved = sm.getUnresolvedEvents();
        assertEq(unresolved.length, 1);
        assertEq(unresolved[0], 0);

        uint256[] memory linked = sm.getEventAuctions(0);
        assertEq(linked.length, 1);
        assertEq(linked[0], 0);
    }

    function test_createAuction_multipleAuctionsSameEvent() public {
        _createAuction("Alice", 0, "Event A", block.timestamp + 1 hours);
        _createAuction("Bob", 0, "Event A", block.timestamp + 1 hours);

        // Event tracked only once
        uint256[] memory unresolved = sm.getUnresolvedEvents();
        assertEq(unresolved.length, 1);

        // Both auctions linked
        uint256[] memory linked = sm.getEventAuctions(0);
        assertEq(linked.length, 2);
    }

    function test_createAuction_tracksSellerAuctions() public {
        _createAuction("Alice", 0, "Event 0", block.timestamp + 1 hours);
        _createAuction("Alice", 1, "Event 1", block.timestamp + 1 hours);

        uint256[] memory auctions = sm.getSellerAuctions("Alice");
        assertEq(auctions.length, 2);
        assertEq(auctions[0], 0);
        assertEq(auctions[1], 1);
    }

    function test_createAuction_addsToOpenList() public {
        _createAuction("Alice", 0, "Event 0", block.timestamp + 1 hours);
        _createAuction("Bob", 1, "Event 1", block.timestamp + 1 hours);

        uint256[] memory open = sm.getOpenAuctions();
        assertEq(open.length, 2);
    }

    function test_createAuction_revert_endTimeInPast() public {
        vm.expectRevert(SecretMarketplace.EndTimeInPast.selector);
        sm.createAuction("Alice", 0, "Event", block.timestamp - 1);
    }

    function test_createAuction_revert_eventDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.EventDoesNotExist.selector, 99));
        sm.createAuction("Alice", 99, "Event", block.timestamp + 1 hours);
    }

    // ===========================
    // ======== PLACE BID ========
    // ===========================

    function test_placeBid() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(a.currentBid, BID_AMOUNT);
    }

    function test_placeBid_outbidRefundsPrevious() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        uint256 balBefore = usdc.balanceOf(owner);
        _placeBid(id, HIGHER_BID);
        uint256 balAfter = usdc.balanceOf(owner);

        // Admin gets refunded BID_AMOUNT, pays HIGHER_BID. Net: -(HIGHER_BID - BID_AMOUNT)
        assertEq(balBefore - balAfter, HIGHER_BID - BID_AMOUNT);
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(a.currentBid, HIGHER_BID);
    }

    function test_placeBid_revert_notAdmin() public {
        uint256 id = _createDefaultAuction();
        vm.expectRevert();
        vm.prank(nobody);
        sm.placeBid(id, BID_AMOUNT);
    }

    function test_placeBid_revert_doesNotExist() public {
        vm.expectRevert(SecretMarketplace.AuctionDoesNotExist.selector);
        sm.placeBid(999, BID_AMOUNT);
    }

    function test_placeBid_revert_bidTooLow() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        vm.expectRevert(SecretMarketplace.BidTooLow.selector);
        sm.placeBid(id, BID_AMOUNT); // equal to current, not higher
    }

    function test_placeBid_revert_auctionEnded() public {
        uint256 id = _createDefaultAuction();
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(SecretMarketplace.AuctionNotActive.selector);
        sm.placeBid(id, BID_AMOUNT);
    }

    // ===========================
    // ======== CLOSE ============
    // ===========================

    function test_closeAuction_fundsStayInContract() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        uint256 contractBefore = usdc.balanceOf(address(sm));
        sm.closeAuction(id);
        uint256 contractAfter = usdc.balanceOf(address(sm));

        // Funds stay in contract
        assertEq(contractAfter, contractBefore);
        assertEq(contractAfter, BID_AMOUNT);
    }

    function test_closeAuction_creCanClose() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(creAddress);
        sm.closeAuction(id);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_closeAuction_revert_notAdminOrCRE() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert();
        vm.prank(nobody);
        sm.closeAuction(id);
    }

    function test_closeAuction_revert_notEnded() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        vm.expectRevert(SecretMarketplace.AuctionNotEnded.selector);
        sm.closeAuction(id);
    }

    function test_closeAuction_noBids() public {
        uint256 id = _createDefaultAuction();
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(id);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(a.currentBid, 0);
    }

    function test_closeAuction_removesFromOpenList() public {
        _createAuction("Alice", 0, "E0", block.timestamp + 1 hours);
        _createAuction("Bob", 1, "E1", block.timestamp + 1 hours);
        _createAuction("Carol", 2, "E2", block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);

        sm.closeAuction(1); // close middle one
        uint256[] memory open = sm.getOpenAuctions();
        assertEq(open.length, 2);
    }

    // ===========================
    // ======= WITHDRAW ==========
    // ===========================

    function test_withdrawFunds() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(id);

        address recipient = makeAddr("recipient");
        uint256 balBefore = usdc.balanceOf(recipient);
        sm.withdrawFunds(recipient, BID_AMOUNT);
        uint256 balAfter = usdc.balanceOf(recipient);

        assertEq(balAfter - balBefore, BID_AMOUNT);
    }

    function test_withdrawFunds_revert_notAdmin() public {
        vm.expectRevert();
        vm.prank(nobody);
        sm.withdrawFunds(nobody, 1e6);
    }

    // ===========================
    // ====== FORCE CLOSE ========
    // ===========================

    function test_forceCloseAuction_fundsStayInContract() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        sm.forceCloseAuction(id, int8(1));

        assertEq(usdc.balanceOf(address(sm)), BID_AMOUNT);
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    function test_forceCloseAuction_updatesReputation_positive() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);

        sm.forceCloseAuction(0, int8(1));

        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
        assertEq(s.reputationScore, 1);
    }

    function test_forceCloseAuction_updatesReputation_negative() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);

        sm.forceCloseAuction(0, int8(-1));

        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
        assertEq(s.reputationScore, -1);
    }

    function test_forceCloseAuction_zeroDelta_noReputationChange() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);

        sm.forceCloseAuction(0, int8(0));

        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
        assertEq(s.reputationScore, 0);
    }

    function test_forceCloseAuction_revert_notAdminOrCRE() public {
        _createDefaultAuction();

        vm.expectRevert();
        vm.prank(nobody);
        sm.forceCloseAuction(0, int8(1));
    }

    function test_forceCloseAuction_creCanCall() public {
        _createDefaultAuction();
        _placeBid(0, BID_AMOUNT);

        vm.prank(creAddress);
        sm.forceCloseAuction(0, int8(1));

        SecretMarketplace.Auction memory a = sm.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    // ===========================
    // === RESOLVE EVENT =========
    // ===========================

    function test_resolveExternalEvent_updatesReputationForAllAuctions() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _createAuction("Bob", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);
        _placeBid(1, BID_AMOUNT);

        // Close both auctions
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.closeAuction(1);

        // Resolve event with +1 delta for all
        sm.resolveExternalEvent(0, int8(1));

        SecretMarketplace.Seller memory s1 = sm.getSeller("Alice");
        SecretMarketplace.Seller memory s2 = sm.getSeller("Bob");
        assertEq(s1.reputationScore, 1);
        assertEq(s2.reputationScore, 1);
    }

    function test_resolveExternalEvent_forceClosesOpenAuctions() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);

        sm.resolveExternalEvent(0, int8(1));

        // Auction force-closed
        SecretMarketplace.Auction memory a = sm.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));

        // Funds stay in contract
        assertEq(usdc.balanceOf(address(sm)), BID_AMOUNT);

        // Reputation updated
        SecretMarketplace.Seller memory s = sm.getSeller("Alice");
        assertEq(s.reputationScore, 1);
    }

    function test_resolveExternalEvent_skipsAlreadyResolvedReputation() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        _placeBid(0, BID_AMOUNT);

        // Force-close first (resolves reputation for this auction)
        sm.forceCloseAuction(0, int8(1));
        assertEq(sm.getSeller("Alice").reputationScore, 1);

        // Now resolve the event — should NOT double-count
        sm.resolveExternalEvent(0, int8(1));
        assertEq(sm.getSeller("Alice").reputationScore, 1); // still 1, not 2
    }

    function test_resolveExternalEvent_removesFromUnresolvedList() public {
        _createAuction("Alice", 0, "E0", block.timestamp + 1 hours);
        _createAuction("Bob", 1, "E1", block.timestamp + 1 hours);

        assertEq(sm.getUnresolvedEvents().length, 2);

        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.resolveExternalEvent(0, int8(1));

        assertEq(sm.getUnresolvedEvents().length, 1);
        assertEq(sm.getUnresolvedEvents()[0], 1);
    }

    function test_resolveExternalEvent_revert_alreadyResolved() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);
        sm.resolveExternalEvent(0, int8(1));

        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.EventAlreadyResolved.selector, 0));
        sm.resolveExternalEvent(0, int8(-1));
    }

    function test_resolveExternalEvent_revert_notAdminOrCRE() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);

        vm.expectRevert();
        vm.prank(nobody);
        sm.resolveExternalEvent(0, int8(1));
    }

    function test_resolveExternalEvent_zeroDelta_noReputationChange() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        sm.resolveExternalEvent(0, int8(0));
        assertEq(sm.getSeller("Alice").reputationScore, 0);
    }

    // ===========================
    // ====== CRE REPORTS ========
    // ===========================

    function test_processReport_closeAuction() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        bytes memory report = abi.encodePacked(uint8(0), abi.encode(id));
        vm.prank(forwarder);
        sm.onReport("", report);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_processReport_forceClose() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        bytes memory report = abi.encodePacked(uint8(1), abi.encode(id, int8(1)));
        vm.prank(forwarder);
        sm.onReport("", report);

        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    function test_processReport_resolveEvent() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        bytes memory report = abi.encodePacked(uint8(2), abi.encode(uint256(0), int8(1)));
        vm.prank(forwarder);
        sm.onReport("", report);

        assertTrue(sm.eventResolved(0));
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
        vm.expectEmit(false, false, false, true);
        emit SecretMarketplace.SellerRegistered("Alice");
        sm.registerSeller("Alice");
    }

    function test_emits_AuctionCreated() public {
        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionCreated(0, 0, "Alice", "Test Event", block.timestamp + 1 hours);
        _createDefaultAuction();
    }

    function test_emits_BidPlaced() public {
        uint256 id = _createDefaultAuction();
        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.BidPlaced(id, BID_AMOUNT, 0);
        _placeBid(id, BID_AMOUNT);
    }

    function test_emits_AuctionClosed() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);
        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.AuctionClosed(id, BID_AMOUNT, "Alice", 0);
        sm.closeAuction(id);
    }

    function test_emits_AuctionForceClosed() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.AuctionForceClosed(id, BID_AMOUNT, "Alice", 0, int8(1));
        sm.forceCloseAuction(id, int8(1));
    }

    function test_emits_ReputationUpdated() public {
        uint256 id = _createDefaultAuction();
        _placeBid(id, BID_AMOUNT);

        vm.expectEmit(false, true, false, true);
        emit SecretMarketplace.ReputationUpdated("Alice", id, int8(1), int256(1));
        sm.forceCloseAuction(id, int8(1));
    }

    function test_emits_ExternalEventResolved() public {
        _createAuction("Alice", 0, "Event", block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(0);

        vm.expectEmit(true, false, false, true);
        emit SecretMarketplace.ExternalEventResolved(0, int8(1), 1);
        sm.resolveExternalEvent(0, int8(1));
    }

    // ===========================
    // ====== SET MARKETPLACE ====
    // ===========================

    function test_setMarketplace() public {
        address newMarket = makeAddr("newMarket");
        sm.setMarketplace(newMarket);
        assertEq(address(sm.marketplace()), newMarket);
    }

    function test_setMarketplace_revert_notAdmin() public {
        vm.expectRevert();
        vm.prank(nobody);
        sm.setMarketplace(makeAddr("newMarket"));
    }

    // ===========================
    // ====== FULL LIFECYCLE =====
    // ===========================

    function test_fullLifecycle() public {
        // 1. Register seller
        sm.registerSeller("Insider Alice");

        // 2. Create auction
        uint256 id = _createAuction("Insider Alice", 0, "Will BTC hit 100k?", block.timestamp + 1 hours);

        // 3. Admin places bid
        _placeBid(id, BID_AMOUNT);

        // 4. Wait and close
        vm.warp(block.timestamp + 2 hours);
        sm.closeAuction(id);

        // 5. Verify status
        SecretMarketplace.Auction memory a = sm.getAuction(id);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(a.currentBid, BID_AMOUNT);

        // 6. Funds stay in contract
        assertEq(usdc.balanceOf(address(sm)), BID_AMOUNT);

        // 7. Admin withdraws
        address recipient = makeAddr("recipient");
        sm.withdrawFunds(recipient, BID_AMOUNT);
        assertEq(usdc.balanceOf(recipient), BID_AMOUNT);

        // 8. Resolve event → reputation +1
        sm.resolveExternalEvent(0, int8(1));
        SecretMarketplace.Seller memory s = sm.getSeller("Insider Alice");
        assertEq(s.reputationScore, 1);
    }

    // ===========================
    // ==== supportsInterface ====
    // ===========================

    function test_supportsInterface_IReceiver() public view {
        assertTrue(sm.supportsInterface(type(IAccessControl).interfaceId));
    }
}
