// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";
import {ExamplePredictionMarketShareToken} from "../src/ExamplePredictionMarketShareToken.sol";
import {ConfidentialUSDC} from "../src/ConfidentialUSDC.sol";

contract ExamplePredictionMarketTest is Test {
    ExamplePredictionMarket public sm;
    ConfidentialUSDC public usdc;

    address creator = makeAddr("creator");
    address buyer1 = makeAddr("buyer1");
    address buyer2 = makeAddr("buyer2");
    address forwarder = makeAddr("forwarder");

    uint256 constant MINT_AMOUNT = 10_000e6;
    uint256 constant INITIAL_LIQUIDITY = 10e6; // 10 USDC

    function setUp() public {
        usdc = new ConfidentialUSDC("USD Coin", "USDC", address(this));
        sm = new ExamplePredictionMarket(address(usdc), forwarder);

        usdc.mint(creator, MINT_AMOUNT);
        usdc.mint(buyer1, MINT_AMOUNT);
        usdc.mint(buyer2, MINT_AMOUNT);

        vm.prank(creator);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(buyer1);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(buyer2);
        usdc.approve(address(sm), type(uint256).max);
    }

    // ── Helpers ──────────────────────────────────────────────

    function _createEvent() internal returns (uint256) {
        vm.prank(creator);
        return sm.newEvent("Will ETH hit $10k?", 3 minutes);
    }

    function _settleEvent(uint256 eventId, ExamplePredictionMarket.Outcome outcome) internal {
        // Warp past event close
        ExamplePredictionMarket.Event memory e = sm.getEvent(eventId);
        vm.warp(e.eventClose + 1);

        // Request settlement
        sm.requestSettlement(eventId);

        // Simulate CRE report
        bytes memory report = abi.encode(eventId, uint8(outcome), uint16(9500), "evidence-123");
        vm.prank(forwarder);
        sm.onReport(hex"", report);
    }

    /// @dev Asserts that tracked reserves match actual token balances held by the contract.
    function _assertReservesMatchBalances(uint256 eventId) internal view {
        ExamplePredictionMarket.Event memory e = sm.getEvent(eventId);
        assertEq(
            e.yesToken.balanceOf(address(sm)),
            e.yesReserve,
            "yesReserve != actual YES token balance"
        );
        assertEq(
            e.noToken.balanceOf(address(sm)),
            e.noReserve,
            "noReserve != actual NO token balance"
        );
    }

    // ── newEvent tests ─────────────────────────────────────

    function test_newEvent_createsEventWithTokens() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        assertEq(e.creator, creator);
        assertEq(e.question, "Will ETH hit $10k?");
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Open));
        assertTrue(address(e.yesToken) != address(0));
        assertTrue(address(e.noToken) != address(0));
        assertEq(e.yesReserve, INITIAL_LIQUIDITY);
        assertEq(e.noReserve, INITIAL_LIQUIDITY);
    }

    function test_newEvent_pullsUSDC() public {
        uint256 balBefore = usdc.balanceOf(creator);
        _createEvent();
        assertEq(usdc.balanceOf(creator), balBefore - INITIAL_LIQUIDITY);
    }

    function test_newEvent_emitsEvent() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit ExamplePredictionMarket.EventCreated(0, creator, "Will ETH hit $10k?", 0, 0, 0, address(0), address(0));
        sm.newEvent("Will ETH hit $10k?", 3 minutes);
    }

    function test_newEvent_shareTokenDecimals() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        assertEq(e.yesToken.decimals(), 6);
        assertEq(e.noToken.decimals(), 6);
    }

    function test_newEvent_initialPrices5050() public {
        uint256 id = _createEvent();
        assertEq(sm.getYesPrice(id), 500_000); // 0.5 USDC (scaled by 1e6)
        assertEq(sm.getNoPrice(id), 500_000);
    }

    function test_newEvent_revertsDurationZero() public {
        vm.prank(creator);
        vm.expectRevert(ExamplePredictionMarket.DurationZero.selector);
        sm.newEvent("Will ETH hit $10k?", 0);
    }

    function test_newEvent_customDuration() public {
        vm.prank(creator);
        uint256 id = sm.newEvent("Custom duration", 1 hours);
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        assertEq(e.eventClose - e.eventOpen, 1 hours);
    }

    // ── buyShares tests ─────────────────────────────────────

    function test_buyShares_yes() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6); // 5 USDC

        uint256 yesBalance = e.yesToken.balanceOf(buyer1);
        assertTrue(yesBalance > 0);
        assertEq(usdc.balanceOf(buyer1), MINT_AMOUNT - 5e6);
    }

    function test_buyShares_no() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);

        uint256 noBalance = e.noToken.balanceOf(buyer1);
        assertTrue(noBalance > 0);
    }

    function test_buyShares_movesPrice() public {
        uint256 id = _createEvent();

        uint256 yesBefore = sm.getYesPrice(id);
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesAfter = sm.getYesPrice(id);

        // Buying YES should increase YES price
        assertTrue(yesAfter > yesBefore);
    }

    function test_buyShares_emitsEvent() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        vm.expectEmit(true, true, true, false);
        emit ExamplePredictionMarket.SharesPurchased(id, buyer1, ExamplePredictionMarket.Outcome.Yes, 5e6, 0);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
    }

    function test_buyShares_revertsAfterClose() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.warp(e.eventClose + 1);
        vm.prank(buyer1);
        vm.expectRevert();
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
    }

    function test_buyShares_revertsInvalidOutcome() public {
        uint256 id = _createEvent();
        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.InvalidOutcome.selector);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.None, 5e6);
    }

    function test_buyShares_revertsZeroAmount() public {
        uint256 id = _createEvent();
        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.AmountZero.selector);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 0);
    }

    function test_buyShares_multipleBuyers() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 3e6);

        assertTrue(e.yesToken.balanceOf(buyer1) > 0);
        assertTrue(e.noToken.balanceOf(buyer2) > 0);
    }

    // ── redeemShares tests ──────────────────────────────────

    function test_redeemShares_winningYes() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesShares = e.yesToken.balanceOf(buyer1);

        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        uint256 balBefore = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, yesShares);

        assertEq(usdc.balanceOf(buyer1), balBefore + yesShares);
        assertEq(e.yesToken.balanceOf(buyer1), 0);
    }

    function test_redeemShares_winningNo() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);
        uint256 noShares = e.noToken.balanceOf(buyer1);

        _settleEvent(id, ExamplePredictionMarket.Outcome.No);

        uint256 balBefore = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, noShares);

        assertEq(usdc.balanceOf(buyer1), balBefore + noShares);
    }

    function test_redeemShares_revertsIfNotSettled() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        vm.prank(buyer1);
        vm.expectRevert();
        sm.redeemShares(id, 1e6);
    }

    function test_redeemShares_revertsZeroAmount() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.AmountZero.selector);
        sm.redeemShares(id, 0);
    }

    function test_redeemShares_losingSharesRevert() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);
        uint256 noShares = e.noToken.balanceOf(buyer1);

        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        // Trying to redeem NO shares when YES won — burn will fail (not the winning token)
        vm.prank(buyer1);
        vm.expectRevert(); // ERC20: burn amount exceeds balance (on YES token)
        sm.redeemShares(id, noShares);
    }

    function test_redeemShares_emitsEvent() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        uint256 yesShares = e.yesToken.balanceOf(buyer1);

        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectEmit(true, true, false, true);
        emit ExamplePredictionMarket.SharesRedeemed(id, buyer1, yesShares, yesShares);
        sm.redeemShares(id, yesShares);
    }

    // ── withdrawLiquidity tests ─────────────────────────────

    function test_withdrawLiquidity() public {
        uint256 id = _createEvent();

        // Buyer buys YES shares
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        uint256 balBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        sm.withdrawLiquidity(id);

        // Creator should get pool's remaining winning (YES) tokens as USDC
        assertTrue(usdc.balanceOf(creator) > balBefore);
    }

    function test_withdrawLiquidity_revertsNotCreator() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.NotCreator.selector);
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_revertsIfNotSettled() public {
        uint256 id = _createEvent();

        vm.prank(creator);
        vm.expectRevert();
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_revertsDoubleWithdraw() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(creator);
        sm.withdrawLiquidity(id);

        vm.prank(creator);
        vm.expectRevert(ExamplePredictionMarket.LiquidityAlreadyWithdrawn.selector);
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_emitsEvent() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit ExamplePredictionMarket.LiquidityWithdrawn(id, creator, 0);
        sm.withdrawLiquidity(id);
    }

    // ── Settlement tests ────────────────────────────────────

    function test_requestSettlement() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.warp(e.eventClose + 1);
        sm.requestSettlement(id);

        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.SettlementRequested));
    }

    function test_requestSettlement_revertsBeforeClose() public {
        uint256 id = _createEvent();
        vm.expectRevert();
        sm.requestSettlement(id);
    }

    function test_settleViaReport() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(e.outcome), uint8(ExamplePredictionMarket.Outcome.Yes));
    }

    function test_settleManually() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        vm.warp(e.eventClose + 1);
        sm.requestSettlement(id);

        // Settle as Inconclusive → NeedsManual
        bytes memory report = abi.encode(id, uint8(ExamplePredictionMarket.Outcome.Inconclusive), uint16(2000), "low-conf");
        vm.prank(forwarder);
        sm.onReport(hex"", report);

        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.NeedsManual));

        // Manual settle
        sm.settleEventManually(id, ExamplePredictionMarket.Outcome.No);
        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(e.outcome), uint8(ExamplePredictionMarket.Outcome.No));
    }

    // ── forceSettle tests ────────────────────────────────────

    function test_forceSettle_fromOpen() public {
        uint256 id = _createEvent();

        sm.forceSettle(id, ExamplePredictionMarket.Outcome.Yes, 10000, "force-settled");

        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(e.outcome), uint8(ExamplePredictionMarket.Outcome.Yes));
        assertEq(e.confidenceBps, 10000);
    }

    function test_forceSettle_fromSettlementRequested() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        vm.warp(e.eventClose + 1);
        sm.requestSettlement(id);

        sm.forceSettle(id, ExamplePredictionMarket.Outcome.No, 9500, "forced");

        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(e.outcome), uint8(ExamplePredictionMarket.Outcome.No));
    }

    function test_forceSettle_fromNeedsManual() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);
        vm.warp(e.eventClose + 1);
        sm.requestSettlement(id);

        // Settle as Inconclusive → NeedsManual
        bytes memory report = abi.encode(id, uint8(ExamplePredictionMarket.Outcome.Inconclusive), uint16(2000), "low-conf");
        vm.prank(forwarder);
        sm.onReport(hex"", report);

        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.NeedsManual));

        // Force settle from NeedsManual
        sm.forceSettle(id, ExamplePredictionMarket.Outcome.Yes, 10000, "force-override");

        e = sm.getEvent(id);
        assertEq(uint8(e.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(e.outcome), uint8(ExamplePredictionMarket.Outcome.Yes));
    }

    function test_forceSettle_revertsAlreadySettled() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        vm.expectRevert();
        sm.forceSettle(id, ExamplePredictionMarket.Outcome.No, 10000, "double-settle");
    }

    function test_forceSettle_revertsInvalidOutcome() public {
        uint256 id = _createEvent();

        vm.expectRevert(ExamplePredictionMarket.InvalidOutcome.selector);
        sm.forceSettle(id, ExamplePredictionMarket.Outcome.None, 10000, "bad-outcome");
    }

    function test_forceSettle_allowsRedemption() public {
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesShares = e.yesToken.balanceOf(buyer1);

        // Force settle without waiting for close
        sm.forceSettle(id, ExamplePredictionMarket.Outcome.Yes, 10000, "forced");

        // Buyer can redeem
        uint256 balBefore = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, yesShares);
        assertEq(usdc.balanceOf(buyer1), balBefore + yesShares);
    }

    // ── adminCloseEvent tests ────────────────────────────────

    function test_adminCloseEvent_setsEventCloseToNow() public {
        uint256 id = _createEvent();
        uint256 closeBefore = sm.getEvent(id).eventClose;
        assertTrue(closeBefore > block.timestamp);

        sm.adminCloseEvent(id);

        assertEq(sm.getEvent(id).eventClose, block.timestamp);
    }

    function test_adminCloseEvent_emitsEvent() public {
        uint256 id = _createEvent();
        vm.expectEmit(true, false, false, false);
        emit ExamplePredictionMarket.EventAdminClosed(id);
        sm.adminCloseEvent(id);
    }

    function test_adminCloseEvent_allowsImmediateRequestSettlement() public {
        uint256 id = _createEvent();
        sm.adminCloseEvent(id);
        // requestSettlement should not revert
        sm.requestSettlement(id);
        assertEq(uint8(sm.getEvent(id).status), uint8(ExamplePredictionMarket.Status.SettlementRequested));
    }

    function test_adminCloseEvent_revert_notOwner() public {
        uint256 id = _createEvent();
        vm.prank(buyer1);
        vm.expectRevert();
        sm.adminCloseEvent(id);
    }

    function test_adminCloseEvent_revert_notOpen() public {
        uint256 id = _createEvent();
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);
        vm.expectRevert(abi.encodeWithSelector(ExamplePredictionMarket.StatusNotOpen.selector, ExamplePredictionMarket.Status.Settled));
        sm.adminCloseEvent(id);
    }

    // ── Price view tests ────────────────────────────────────

    function test_prices_sumToOne() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        uint256 yes = sm.getYesPrice(id);
        uint256 no = sm.getNoPrice(id);
        // Should sum to ~1e6 (may lose 1 due to integer division)
        assertTrue(yes + no >= 999_999 && yes + no <= 1_000_001);
    }

    // ── Reserve accounting invariant tests ──────────────────

    function test_buyShares_reservesMatchBalances_afterSingleBuyYes() public {
        uint256 id = _createEvent();
        _assertReservesMatchBalances(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        _assertReservesMatchBalances(id);
    }

    function test_buyShares_reservesMatchBalances_afterSingleBuyNo() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);
        _assertReservesMatchBalances(id);
    }

    function test_buyShares_reservesMatchBalances_afterMultipleTrades() public {
        uint256 id = _createEvent();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        _assertReservesMatchBalances(id);

        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 3e6);
        _assertReservesMatchBalances(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 2e6);
        _assertReservesMatchBalances(id);

        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 7e6);
        _assertReservesMatchBalances(id);
    }

    function test_buyShares_reservesMatchBalances_manyTrades() public {
        uint256 id = _createEvent();

        // 20 alternating trades to stress-test cumulative accounting
        for (uint256 i = 0; i < 20; i++) {
            address buyer = (i % 2 == 0) ? buyer1 : buyer2;
            ExamplePredictionMarket.Outcome side = (i % 3 == 0)
                ? ExamplePredictionMarket.Outcome.No
                : ExamplePredictionMarket.Outcome.Yes;
            uint256 amount = (1 + (i % 5)) * 1e6; // 1–5 USDC

            vm.prank(buyer);
            sm.buyShares(id, side, amount);
            _assertReservesMatchBalances(id);
        }
    }

    function test_buyShares_reservesMatchBalances_largeBuyAfterSkew() public {
        uint256 id = _createEvent();

        // Skew the pool heavily toward YES
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 100e6);
        _assertReservesMatchBalances(id);

        // Now buy the opposite side
        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 50e6);
        _assertReservesMatchBalances(id);

        // And buy YES again on the skewed pool
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 1e6);
        _assertReservesMatchBalances(id);
    }

    // ── Full lifecycle test ─────────────────────────────────

    function test_fullLifecycle() public {
        // Create event
        uint256 id = _createEvent();
        ExamplePredictionMarket.Event memory e = sm.getEvent(id);

        // Buyer1 buys YES
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesShares = e.yesToken.balanceOf(buyer1);

        // Buyer2 buys NO
        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 3e6);

        // Settle as YES
        _settleEvent(id, ExamplePredictionMarket.Outcome.Yes);

        // Buyer1 redeems YES shares
        uint256 bal1Before = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, yesShares);
        assertEq(usdc.balanceOf(buyer1), bal1Before + yesShares);

        // Creator withdraws liquidity
        uint256 balCreatorBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        sm.withdrawLiquidity(id);
        assertTrue(usdc.balanceOf(creator) > balCreatorBefore);
    }
}
