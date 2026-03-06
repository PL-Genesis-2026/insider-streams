// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ExamplePredictionMarket} from "../src/ExamplePredictionMarket.sol";
import {ExamplePredictionMarketShareToken} from "../src/ExamplePredictionMarketShareToken.sol";
import {MockUSDC} from "../src/mock/MockUSDC.sol";

contract ExamplePredictionMarketTest is Test {
    ExamplePredictionMarket public sm;
    MockUSDC public usdc;

    address creator = makeAddr("creator");
    address buyer1 = makeAddr("buyer1");
    address buyer2 = makeAddr("buyer2");
    address forwarder = makeAddr("forwarder");

    uint256 constant MINT_AMOUNT = 10_000e6;
    uint256 constant INITIAL_LIQUIDITY = 10e6; // 10 USDC

    function setUp() public {
        usdc = new MockUSDC(0);
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

    function _createMarket() internal returns (uint256) {
        vm.prank(creator);
        return sm.newMarket("Will ETH hit $10k?");
    }

    function _settleMarket(uint256 marketId, ExamplePredictionMarket.Outcome outcome) internal {
        // Warp past market close
        ExamplePredictionMarket.Market memory m = sm.getMarket(marketId);
        vm.warp(m.marketClose + 1);

        // Request settlement
        sm.requestSettlement(marketId);

        // Simulate CRE report
        bytes memory report = abi.encode(marketId, uint8(outcome), uint16(9500), "evidence-123");
        vm.prank(forwarder);
        sm.onReport(hex"", report);
    }

    // ── newMarket tests ─────────────────────────────────────

    function test_newMarket_createsMarketWithTokens() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        assertEq(m.creator, creator);
        assertEq(m.question, "Will ETH hit $10k?");
        assertEq(uint8(m.status), uint8(ExamplePredictionMarket.Status.Open));
        assertTrue(address(m.yesToken) != address(0));
        assertTrue(address(m.noToken) != address(0));
        assertEq(m.yesReserve, INITIAL_LIQUIDITY);
        assertEq(m.noReserve, INITIAL_LIQUIDITY);
    }

    function test_newMarket_pullsUSDC() public {
        uint256 balBefore = usdc.balanceOf(creator);
        _createMarket();
        assertEq(usdc.balanceOf(creator), balBefore - INITIAL_LIQUIDITY);
    }

    function test_newMarket_emitsEvent() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit ExamplePredictionMarket.MarketCreated(0, creator, "Will ETH hit $10k?", 0, 0, address(0), address(0));
        sm.newMarket("Will ETH hit $10k?");
    }

    function test_newMarket_shareTokenDecimals() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);
        assertEq(m.yesToken.decimals(), 6);
        assertEq(m.noToken.decimals(), 6);
    }

    function test_newMarket_initialPrices5050() public {
        uint256 id = _createMarket();
        assertEq(sm.getYesPrice(id), 500_000); // 0.5 USDC (scaled by 1e6)
        assertEq(sm.getNoPrice(id), 500_000);
    }

    // ── buyShares tests ─────────────────────────────────────

    function test_buyShares_yes() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6); // 5 USDC

        uint256 yesBalance = m.yesToken.balanceOf(buyer1);
        assertTrue(yesBalance > 0);
        assertEq(usdc.balanceOf(buyer1), MINT_AMOUNT - 5e6);
    }

    function test_buyShares_no() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);

        uint256 noBalance = m.noToken.balanceOf(buyer1);
        assertTrue(noBalance > 0);
    }

    function test_buyShares_movesPrice() public {
        uint256 id = _createMarket();

        uint256 yesBefore = sm.getYesPrice(id);
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesAfter = sm.getYesPrice(id);

        // Buying YES should increase YES price
        assertTrue(yesAfter > yesBefore);
    }

    function test_buyShares_emitsEvent() public {
        uint256 id = _createMarket();

        vm.prank(buyer1);
        vm.expectEmit(true, true, true, false);
        emit ExamplePredictionMarket.SharesPurchased(id, buyer1, ExamplePredictionMarket.Outcome.Yes, 5e6, 0);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
    }

    function test_buyShares_revertsAfterClose() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.warp(m.marketClose + 1);
        vm.prank(buyer1);
        vm.expectRevert();
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
    }

    function test_buyShares_revertsInvalidOutcome() public {
        uint256 id = _createMarket();
        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.InvalidOutcome.selector);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.None, 5e6);
    }

    function test_buyShares_revertsZeroAmount() public {
        uint256 id = _createMarket();
        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.AmountZero.selector);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 0);
    }

    function test_buyShares_multipleBuyers() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 3e6);

        assertTrue(m.yesToken.balanceOf(buyer1) > 0);
        assertTrue(m.noToken.balanceOf(buyer2) > 0);
    }

    // ── redeemShares tests ──────────────────────────────────

    function test_redeemShares_winningYes() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesShares = m.yesToken.balanceOf(buyer1);

        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        uint256 balBefore = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, yesShares);

        assertEq(usdc.balanceOf(buyer1), balBefore + yesShares);
        assertEq(m.yesToken.balanceOf(buyer1), 0);
    }

    function test_redeemShares_winningNo() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);
        uint256 noShares = m.noToken.balanceOf(buyer1);

        _settleMarket(id, ExamplePredictionMarket.Outcome.No);

        uint256 balBefore = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        sm.redeemShares(id, noShares);

        assertEq(usdc.balanceOf(buyer1), balBefore + noShares);
    }

    function test_redeemShares_revertsIfNotSettled() public {
        uint256 id = _createMarket();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        vm.prank(buyer1);
        vm.expectRevert();
        sm.redeemShares(id, 1e6);
    }

    function test_redeemShares_revertsZeroAmount() public {
        uint256 id = _createMarket();
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.AmountZero.selector);
        sm.redeemShares(id, 0);
    }

    function test_redeemShares_losingSharesRevert() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 5e6);
        uint256 noShares = m.noToken.balanceOf(buyer1);

        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        // Trying to redeem NO shares when YES won — burn will fail (not the winning token)
        vm.prank(buyer1);
        vm.expectRevert(); // ERC20: burn amount exceeds balance (on YES token)
        sm.redeemShares(id, noShares);
    }

    function test_redeemShares_emitsEvent() public {
        uint256 id = _createMarket();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);
        uint256 yesShares = m.yesToken.balanceOf(buyer1);

        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectEmit(true, true, false, true);
        emit ExamplePredictionMarket.SharesRedeemed(id, buyer1, yesShares, yesShares);
        sm.redeemShares(id, yesShares);
    }

    // ── withdrawLiquidity tests ─────────────────────────────

    function test_withdrawLiquidity() public {
        uint256 id = _createMarket();

        // Buyer buys YES shares
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        uint256 balBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        sm.withdrawLiquidity(id);

        // Creator should get pool's remaining winning (YES) tokens as USDC
        assertTrue(usdc.balanceOf(creator) > balBefore);
    }

    function test_withdrawLiquidity_revertsNotCreator() public {
        uint256 id = _createMarket();
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(buyer1);
        vm.expectRevert(ExamplePredictionMarket.NotCreator.selector);
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_revertsIfNotSettled() public {
        uint256 id = _createMarket();

        vm.prank(creator);
        vm.expectRevert();
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_revertsDoubleWithdraw() public {
        uint256 id = _createMarket();
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(creator);
        sm.withdrawLiquidity(id);

        vm.prank(creator);
        vm.expectRevert(ExamplePredictionMarket.LiquidityAlreadyWithdrawn.selector);
        sm.withdrawLiquidity(id);
    }

    function test_withdrawLiquidity_emitsEvent() public {
        uint256 id = _createMarket();
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit ExamplePredictionMarket.LiquidityWithdrawn(id, creator, 0);
        sm.withdrawLiquidity(id);
    }

    // ── Settlement tests ────────────────────────────────────

    function test_requestSettlement() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        vm.warp(m.marketClose + 1);
        sm.requestSettlement(id);

        m = sm.getMarket(id);
        assertEq(uint8(m.status), uint8(ExamplePredictionMarket.Status.SettlementRequested));
    }

    function test_requestSettlement_revertsBeforeClose() public {
        uint256 id = _createMarket();
        vm.expectRevert();
        sm.requestSettlement(id);
    }

    function test_settleViaReport() public {
        uint256 id = _createMarket();
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

        ExamplePredictionMarket.Market memory m = sm.getMarket(id);
        assertEq(uint8(m.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(m.outcome), uint8(ExamplePredictionMarket.Outcome.Yes));
    }

    function test_settleManually() public {
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);
        vm.warp(m.marketClose + 1);
        sm.requestSettlement(id);

        // Settle as Inconclusive → NeedsManual
        bytes memory report = abi.encode(id, uint8(ExamplePredictionMarket.Outcome.Inconclusive), uint16(2000), "low-conf");
        vm.prank(forwarder);
        sm.onReport(hex"", report);

        m = sm.getMarket(id);
        assertEq(uint8(m.status), uint8(ExamplePredictionMarket.Status.NeedsManual));

        // Manual settle
        sm.settleMarketManually(id, ExamplePredictionMarket.Outcome.No);
        m = sm.getMarket(id);
        assertEq(uint8(m.status), uint8(ExamplePredictionMarket.Status.Settled));
        assertEq(uint8(m.outcome), uint8(ExamplePredictionMarket.Outcome.No));
    }

    // ── Price view tests ────────────────────────────────────

    function test_prices_sumToOne() public {
        uint256 id = _createMarket();

        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);

        uint256 yes = sm.getYesPrice(id);
        uint256 no = sm.getNoPrice(id);
        // Should sum to ~1e6 (may lose 1 due to integer division)
        assertTrue(yes + no >= 999_999 && yes + no <= 1_000_001);
    }

    // ── Full lifecycle test ─────────────────────────────────

    function test_fullLifecycle() public {
        // Create market
        uint256 id = _createMarket();
        ExamplePredictionMarket.Market memory m = sm.getMarket(id);

        // Buyer1 buys YES
        vm.prank(buyer1);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.Yes, 5e6);
        uint256 yesShares = m.yesToken.balanceOf(buyer1);

        // Buyer2 buys NO
        vm.prank(buyer2);
        sm.buyShares(id, ExamplePredictionMarket.Outcome.No, 3e6);

        // Settle as YES
        _settleMarket(id, ExamplePredictionMarket.Outcome.Yes);

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
