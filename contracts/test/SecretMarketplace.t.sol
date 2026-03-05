// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {SecretMarketplace} from "../src/SecretMarketplace.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";
import {SimpleMarket} from "../src/SimpleMarket.sol";

contract SecretMarketplaceTest is Test {
    SecretMarketplace public auction;
    MockUSDC public usdc;
    SimpleMarket public market;

    address owner = address(this);
    address seller = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");
    address forwarder = makeAddr("forwarder");

    uint256 constant RESERVE_PRICE = 100e6; // 100 USDC
    uint256 constant MINT_AMOUNT = 10_000e6;

    function setUp() public {
        usdc = new MockUSDC(0);
        market = new SimpleMarket(address(usdc), forwarder);
        auction = new SecretMarketplace(address(usdc), address(market), forwarder);

        // Create markets on SimpleMarket so createAuction validation passes
        market.newMarket("Test market 0");  // marketId=0
        market.newMarket("Test market 1");  // marketId=1
        market.newMarket("Test market 2");  // marketId=2
        market.newMarket("Test market 3");  // marketId=3
        market.newMarket("Test market 4");  // marketId=4

        usdc.mint(seller, MINT_AMOUNT);
        usdc.mint(bidder1, MINT_AMOUNT);
        usdc.mint(bidder2, MINT_AMOUNT);

        vm.prank(bidder1);
        usdc.approve(address(auction), type(uint256).max);
        vm.prank(bidder2);
        usdc.approve(address(auction), type(uint256).max);
    }

    // ===========================
    // ======== CREATE ===========
    // ===========================

    function test_createAuction() public {
        vm.prank(seller);
        uint256 id = auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        assertEq(id, 0);
        SecretMarketplace.AuctionData memory a = auction.getAuction(id);
        assertEq(a.seller, seller);
        assertEq(a.reservePrice, RESERVE_PRICE);
        assertEq(a.highestBidder, address(0));
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Open));
    }

    function test_createAuction_addsToOpenList() public {
        vm.startPrank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);
        auction.createAuction(1, RESERVE_PRICE, block.timestamp + 1 hours);
        vm.stopPrank();

        uint256[] memory open = auction.getOpenAuctions();
        assertEq(open.length, 2);
        assertEq(open[0], 0);
        assertEq(open[1], 1);
    }

    function test_createAuction_revert_endTimeInPast() public {
        vm.expectRevert(SecretMarketplace.EndTimeInPast.selector);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp - 1);
    }

    function test_createAuction_revert_reservePriceZero() public {
        vm.expectRevert(SecretMarketplace.ReservePriceZero.selector);
        auction.createAuction(0, 0, block.timestamp + 1 hours);
    }

    function test_createAuction_revert_marketDoesNotExist() public {
        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.MarketDoesNotExist.selector, uint256(999)));
        auction.createAuction(999, RESERVE_PRICE, block.timestamp + 1 hours);
    }

    // ===========================
    // ======== BID ==============
    // ===========================

    function test_placeBid() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(a.highestBidder, bidder1);
        assertEq(a.highestBid, 200e6);
        assertEq(usdc.balanceOf(address(auction)), 200e6);
    }

    function test_placeBid_outbidRefundsPrevious() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        uint256 bidder1BalBefore = usdc.balanceOf(bidder1);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        auction.placeBid(0, 300e6);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(a.highestBidder, bidder2);
        assertEq(a.highestBid, 300e6);
        // bidder1 gets refunded directly
        assertEq(usdc.balanceOf(bidder1), bidder1BalBefore);
    }

    function test_placeBid_revert_sellerCannotBid() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        usdc.mint(seller, MINT_AMOUNT);
        vm.prank(seller);
        usdc.approve(address(auction), type(uint256).max);

        vm.prank(seller);
        vm.expectRevert(SecretMarketplace.SellerCannotBid.selector);
        auction.placeBid(0, 200e6);
    }

    function test_placeBid_revert_belowReserve() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        vm.expectRevert(SecretMarketplace.BidTooLow.selector);
        auction.placeBid(0, 50e6);
    }

    function test_placeBid_revert_notHigherThanCurrent() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        vm.expectRevert(SecretMarketplace.BidTooLow.selector);
        auction.placeBid(0, 200e6); // equal, not higher
    }

    function test_placeBid_revert_auctionEnded() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bidder1);
        vm.expectRevert(SecretMarketplace.AuctionNotActive.selector);
        auction.placeBid(0, 200e6);
    }

    function test_placeBid_revert_doesNotExist() public {
        vm.prank(bidder1);
        vm.expectRevert(SecretMarketplace.AuctionDoesNotExist.selector);
        auction.placeBid(99, 200e6);
    }

    // ===========================
    // ======== CLOSE ============
    // ===========================

    function test_closeAuction_transfersToSeller() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        uint256 sellerBalBefore = usdc.balanceOf(seller);
        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        // Seller receives the winning bid
        assertEq(usdc.balanceOf(seller), sellerBalBefore + 200e6);
    }

    function test_closeAuction_sellerCanClose() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(seller);
        auction.closeAuction(0);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_closeAuction_removesFromOpenList() public {
        vm.startPrank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);
        auction.createAuction(1, RESERVE_PRICE, block.timestamp + 1 hours);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        uint256[] memory open = auction.getOpenAuctions();
        assertEq(open.length, 1);
        assertEq(open[0], 1);
    }

    function test_closeAuction_noBids() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(a.highestBidder, address(0));
    }

    function test_closeAuction_revert_notEnded() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.expectRevert(SecretMarketplace.AuctionNotEnded.selector);
        auction.closeAuction(0);
    }

    function test_closeAuction_revert_alreadySettled() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        vm.expectRevert(SecretMarketplace.AuctionAlreadySettled.selector);
        auction.closeAuction(0);
    }

    function test_closeAuction_revert_notSellerOrOwner() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bidder1);
        vm.expectRevert(SecretMarketplace.NotSellerOrOwner.selector);
        auction.closeAuction(0);
    }

    // ===========================
    // ======== FORCE CLOSE ======
    // ===========================

    function test_forceCloseAuction_refundsBidder() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        uint256 bidder1BalBefore = usdc.balanceOf(bidder1);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        auction.forceCloseAuction(0, int8(1));

        // bidder1 gets refunded directly
        assertEq(usdc.balanceOf(bidder1), bidder1BalBefore);
        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    function test_forceCloseAuction_updatesReputation() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.forceCloseAuction(0, int8(1));

        assertEq(auction.reputationScores(seller), 1);
    }

    function test_forceCloseAuction_negativeReputation() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.forceCloseAuction(0, int8(-1));

        assertEq(auction.reputationScores(seller), -1);
    }

    function test_forceCloseAuction_noImpact() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.forceCloseAuction(0, int8(0));

        assertEq(auction.reputationScores(seller), 0);
    }

    function test_forceCloseAuction_noBids() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.forceCloseAuction(0, int8(0));

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
    }

    // ===========================
    // ======== REPUTATION =======
    // ===========================

    function test_updateReputationScore() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.updateReputationScore(0, int8(1));

        assertEq(auction.reputationScores(seller), 1);
    }

    function test_updateReputationScore_revert_auctionDoesNotExist() public {
        vm.expectRevert(SecretMarketplace.AuctionDoesNotExist.selector);
        auction.updateReputationScore(99, int8(1));
    }

    function test_updateReputationScore_multipleSellersOnSameMarket() public {
        // Two sellers create auctions for the same external market
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours); // auctionId=0

        vm.prank(bidder1); // bidder1 acts as second seller
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours); // auctionId=1

        // Update reputation for both — should not conflict
        auction.updateReputationScore(0, int8(1));  // seller
        auction.updateReputationScore(1, int8(-1)); // bidder1-as-seller

        assertEq(auction.reputationScores(seller), 1);
        assertEq(auction.reputationScores(bidder1), -1);
    }

    // ===========================
    // ======== CRE ==============
    // ===========================

    function test_processReport_closeAuction() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        bytes memory report = abi.encodePacked(uint8(0), abi.encode(uint256(0)));

        vm.prank(forwarder);
        auction.onReport("", report);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
    }

    function test_processReport_forceClose() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        bytes memory report = abi.encodePacked(uint8(1), abi.encode(uint256(0), int8(-1)));

        vm.prank(forwarder);
        auction.onReport("", report);

        SecretMarketplace.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.ForceClosed));
        assertEq(auction.reputationScores(seller), -1);
    }

    function test_processReport_updateReputation() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        bytes memory report = abi.encodePacked(uint8(2), abi.encode(uint256(0), int8(1)));

        vm.prank(forwarder);
        auction.onReport("", report);

        assertEq(auction.reputationScores(seller), 1);
    }

    function test_processReport_revert_notForwarder() public {
        bytes memory report = abi.encodePacked(uint8(0), abi.encode(uint256(0)));

        vm.prank(bidder1);
        vm.expectRevert();
        auction.onReport("", report);
    }

    function test_processReport_revert_unknownAction() public {
        bytes memory report = abi.encodePacked(uint8(99), abi.encode(uint256(0)));

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SecretMarketplace.UnknownAction.selector, uint8(99)));
        auction.onReport("", report);
    }

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    function test_emits_AuctionCreated() public {
        vm.prank(seller);
        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionCreated(0, seller, 3, RESERVE_PRICE, block.timestamp + 1 hours);
        auction.createAuction(3, RESERVE_PRICE, block.timestamp + 1 hours);
    }

    function test_emits_BidPlaced() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.BidPlaced(0, bidder1, 200e6, address(0), 0);
        auction.placeBid(0, 200e6);
    }

    function test_emits_BidPlaced_withPreviousBidder() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.BidPlaced(0, bidder2, 300e6, bidder1, 200e6);
        auction.placeBid(0, 300e6);
    }

    function test_emits_AuctionClosed() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionClosed(0, bidder1, 200e6, seller, 0);
        auction.closeAuction(0);
    }

    function test_emits_AuctionForceClosed() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.AuctionForceClosed(0, bidder1, 200e6, seller, 0, int8(-1));
        auction.forceCloseAuction(0, int8(-1));
    }

    function test_emits_ReputationUpdated() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.expectEmit(true, true, false, true);
        emit SecretMarketplace.ReputationUpdated(seller, 0, int8(1), int256(1));
        auction.updateReputationScore(0, int8(1));
    }

    function test_emits_TradeExecuted() public {
        vm.prank(seller);
        auction.createAuction(4, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, true, true);
        emit SecretMarketplace.TradeExecuted(0, 4, bidder1, 200e6);
        auction.closeAuction(0);
    }

    // ===========================
    // ======== FULL FLOW ========
    // ===========================

    function test_fullLifecycle() public {
        // Seller creates auction for external market 0
        vm.prank(seller);
        uint256 id = auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        // Bidder1 bids
        vm.prank(bidder1);
        auction.placeBid(id, 200e6);

        // Bidder2 outbids (bidder1 refunded automatically)
        vm.prank(bidder2);
        auction.placeBid(id, 300e6);
        assertEq(usdc.balanceOf(bidder1), MINT_AMOUNT); // got full refund back

        // Auction ends, seller closes it
        uint256 sellerBalBefore = usdc.balanceOf(seller);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(seller);
        auction.closeAuction(id);

        // Verify final state
        SecretMarketplace.AuctionData memory a = auction.getAuction(id);
        assertEq(a.highestBidder, bidder2);
        assertEq(a.highestBid, 300e6);
        assertEq(uint8(a.status), uint8(SecretMarketplace.AuctionStatus.Closed));
        assertEq(auction.getOpenAuctions().length, 0);
        // Seller received the winning bid
        assertEq(usdc.balanceOf(seller), sellerBalBefore + 300e6);

        // Later: owner updates reputation
        auction.updateReputationScore(0, int8(1));
        assertEq(auction.reputationScores(seller), 1);
    }
}
