// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {Auction} from "../src/Auction.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";
import {SimpleMarket} from "../src/SimpleMarket.sol";

contract AuctionTest is Test {
    Auction public auction;
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
        auction = new Auction(address(usdc), address(market), forwarder);

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
        Auction.AuctionData memory a = auction.getAuction(id);
        assertEq(a.seller, seller);
        assertEq(a.reservePrice, RESERVE_PRICE);
        assertEq(a.highestBidder, address(0));
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.Open));
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

    function test_createAuction_tracksMarket() public {
        vm.prank(seller);
        auction.createAuction(42, RESERVE_PRICE, block.timestamp + 1 hours);

        uint256[] memory tracked = auction.getTrackedMarkets();
        assertEq(tracked.length, 1);
        assertEq(tracked[0], 42);
        assertEq(auction.trackedMarkets(42), seller);
    }

    function test_createAuction_revert_endTimeInPast() public {
        vm.expectRevert(Auction.EndTimeInPast.selector);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp - 1);
    }

    function test_createAuction_revert_reservePriceZero() public {
        vm.expectRevert(Auction.ReservePriceZero.selector);
        auction.createAuction(0, 0, block.timestamp + 1 hours);
    }

    // ===========================
    // ======== BID ==============
    // ===========================

    function test_placeBid() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(a.highestBidder, bidder1);
        assertEq(a.highestBid, 200e6);
        assertEq(usdc.balanceOf(address(auction)), 200e6);
    }

    function test_placeBid_outbidRefundsPrevious() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        auction.placeBid(0, 300e6);

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(a.highestBidder, bidder2);
        assertEq(a.highestBid, 300e6);
        assertEq(auction.pendingReturns(bidder1), 200e6);
    }

    function test_placeBid_revert_belowReserve() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        vm.expectRevert(Auction.BidTooLow.selector);
        auction.placeBid(0, 50e6);
    }

    function test_placeBid_revert_notHigherThanCurrent() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        vm.expectRevert(Auction.BidTooLow.selector);
        auction.placeBid(0, 200e6); // equal, not higher
    }

    function test_placeBid_revert_auctionEnded() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bidder1);
        vm.expectRevert(Auction.AuctionNotActive.selector);
        auction.placeBid(0, 200e6);
    }

    function test_placeBid_revert_doesNotExist() public {
        vm.prank(bidder1);
        vm.expectRevert(Auction.AuctionDoesNotExist.selector);
        auction.placeBid(99, 200e6);
    }

    // ===========================
    // ======== CLOSE ============
    // ===========================

    function test_closeAuction() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.Closed));

        // Seller receives the winning bid
        // Day one: TradeExecuted event emitted, no actual transfer to seller
        // So funds stay in contract
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

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.Closed));
        assertEq(a.highestBidder, address(0));
    }

    function test_closeAuction_revert_notEnded() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.expectRevert(Auction.AuctionNotEnded.selector);
        auction.closeAuction(0);
    }

    function test_closeAuction_revert_alreadySettled() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(0);

        vm.expectRevert(Auction.AuctionAlreadySettled.selector);
        auction.closeAuction(0);
    }

    function test_closeAuction_revert_notOwner() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bidder1);
        vm.expectRevert();
        auction.closeAuction(0);
    }

    // ===========================
    // ======== FORCE CLOSE ======
    // ===========================

    function test_forceCloseAuction_refundsBidder() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        auction.forceCloseAuction(0, int8(1));

        assertEq(auction.pendingReturns(bidder1), 200e6);
        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.ForceClosed));
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
        // Market should still be removed from tracking
        uint256[] memory tracked = auction.getTrackedMarkets();
        assertEq(tracked.length, 0);
    }

    function test_forceCloseAuction_noBids() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.forceCloseAuction(0, int8(0));

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.ForceClosed));
    }

    // ===========================
    // ======== WITHDRAW =========
    // ===========================

    function test_withdrawRefund() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.prank(bidder2);
        auction.placeBid(0, 300e6);

        uint256 balBefore = usdc.balanceOf(bidder1);

        vm.prank(bidder1);
        auction.withdrawRefund();

        assertEq(usdc.balanceOf(bidder1), balBefore + 200e6);
        assertEq(auction.pendingReturns(bidder1), 0);
    }

    function test_withdrawRefund_revert_nothing() public {
        vm.prank(bidder1);
        vm.expectRevert(Auction.NothingToWithdraw.selector);
        auction.withdrawRefund();
    }

    // ===========================
    // ======== REPUTATION =======
    // ===========================

    function test_updateReputationScore() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        auction.updateReputationScore(0, int8(1));

        assertEq(auction.reputationScores(seller), 1);
        uint256[] memory tracked = auction.getTrackedMarkets();
        assertEq(tracked.length, 0);
    }

    function test_updateReputationScore_revert_notTracked() public {
        vm.expectRevert(abi.encodeWithSelector(Auction.MarketNotTracked.selector, uint256(99)));
        auction.updateReputationScore(99, int8(1));
    }

    // ===========================
    // ======== CRE ==============
    // ===========================

    function test_processReport_closeAuction() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 2 hours);

        // action=0 (close), payload=abi.encode(auctionId)
        bytes memory report = abi.encodePacked(uint8(0), abi.encode(uint256(0)));

        vm.prank(forwarder);
        auction.onReport("", report);

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.Closed));
    }

    function test_processReport_forceClose() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        bytes memory report = abi.encodePacked(uint8(1), abi.encode(uint256(0), int8(-1)));

        vm.prank(forwarder);
        auction.onReport("", report);

        Auction.AuctionData memory a = auction.getAuction(0);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.ForceClosed));
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

    // ===========================
    // ======== EVENTS ===========
    // ===========================

    function test_emits_AuctionCreated() public {
        vm.prank(seller);
        vm.expectEmit(true, true, false, true);
        emit Auction.AuctionCreated(0, seller, 5, RESERVE_PRICE, block.timestamp + 1 hours);
        auction.createAuction(5, RESERVE_PRICE, block.timestamp + 1 hours);
    }

    function test_emits_BidPlaced() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        vm.expectEmit(true, true, false, true);
        emit Auction.BidPlaced(0, bidder1, 200e6);
        auction.placeBid(0, 200e6);
    }

    function test_emits_AuctionClosed() public {
        vm.prank(seller);
        auction.createAuction(0, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, false, true);
        emit Auction.AuctionClosed(0, bidder1, 200e6);
        auction.closeAuction(0);
    }

    function test_emits_TradeExecuted() public {
        vm.prank(seller);
        auction.createAuction(7, RESERVE_PRICE, block.timestamp + 1 hours);

        vm.prank(bidder1);
        auction.placeBid(0, 200e6);

        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, true, true);
        emit Auction.TradeExecuted(0, 7, bidder1, 200e6);
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

        // Bidder2 outbids
        vm.prank(bidder2);
        auction.placeBid(id, 300e6);

        // Bidder1 withdraws refund
        vm.prank(bidder1);
        auction.withdrawRefund();
        assertEq(usdc.balanceOf(bidder1), MINT_AMOUNT); // got full refund back

        // Auction ends, owner closes it
        vm.warp(block.timestamp + 2 hours);
        auction.closeAuction(id);

        // Verify final state
        Auction.AuctionData memory a = auction.getAuction(id);
        assertEq(a.highestBidder, bidder2);
        assertEq(a.highestBid, 300e6);
        assertEq(uint8(a.status), uint8(Auction.AuctionStatus.Closed));
        assertEq(auction.getOpenAuctions().length, 0);

        // Later: CRE updates reputation
        auction.updateReputationScore(0, int8(1));
        assertEq(auction.reputationScores(seller), 1);
    }
}
