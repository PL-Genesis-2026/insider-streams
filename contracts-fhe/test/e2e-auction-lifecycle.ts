/**
 * Full Auction Lifecycle E2E Test
 *
 * Tests the complete end-to-end flow that the daemon will orchestrate in production:
 *
 * 1. Setup: Deploy contracts, mint tokens to admin, set operator, deposit for users
 * 2. Prediction Market: Create event
 * 3. Admin creates auctions on behalf of pseudonymous sellers
 * 4. Admin places encrypted bids on behalf of pseudonymous bidders
 * 5. Auction expires -> close auction -> verify pending decryption
 * 6. Finalize auction close (mock decryption proof) -> verify seller credited
 * 7. Settle prediction market event (simulating settler daemon)
 * 8. Resolve event predictions on marketplace -> verify pending reputation
 * 9. Finalize reputation -> verify reputation scores
 * 10. Verify all balances are correct throughout
 */

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import {
  FHESecretMarketplace,
  FHEConfidentialUSDC,
  ExamplePredictionMarket,
  MockUSDC,
} from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

const FAKE_CID = ethers.keccak256(ethers.toUtf8Bytes("QmE2ESecretData"));
const FAKE_AES_KEY = 42424242424242424242n;
const ONE_USDC = 1_000_000n;

describe("E2E: Full Auction Lifecycle", function () {
  let mockUSDC: MockUSDC;
  let confidentialUSDC: FHEConfidentialUSDC;
  let confidentialUSDCAddress: string;
  let predictionMarket: ExamplePredictionMarket;
  let marketplace: FHESecretMarketplace;
  let marketplaceAddress: string;
  let deployer: HardhatEthersSigner;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("This E2E test requires mock FHE environment");
      this.skip();
    }
  });

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    deployer = signers[0];

    // Deploy MockUSDC (for prediction market)
    const mockFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = (await mockFactory.deploy()) as MockUSDC;

    // Deploy ConfidentialUSDC (for marketplace)
    const cFactory = await ethers.getContractFactory("FHEConfidentialUSDC");
    confidentialUSDC = (await cFactory.deploy(deployer.address)) as FHEConfidentialUSDC;
    confidentialUSDCAddress = await confidentialUSDC.getAddress();

    // Deploy ExamplePredictionMarket (uses MockUSDC)
    const pmFactory = await ethers.getContractFactory("ExamplePredictionMarket");
    predictionMarket = (await pmFactory.deploy(
      await mockUSDC.getAddress(),
      deployer.address, // settler = deployer
    )) as ExamplePredictionMarket;

    // Deploy FHESecretMarketplace (uses ConfidentialUSDC)
    const mFactory = await ethers.getContractFactory("FHESecretMarketplace");
    marketplace = (await mFactory.deploy(
      confidentialUSDCAddress,
      deployer.address, // settler = deployer
    )) as FHESecretMarketplace;
    marketplaceAddress = await marketplace.getAddress();

    // --- Fund admin ---

    // Mint MockUSDC to deployer (for PM events)
    await mockUSDC.mint(deployer.address, 100n * ONE_USDC);
    await mockUSDC.approve(await predictionMarket.getAddress(), 100n * ONE_USDC);

    // Mint ConfidentialUSDC to deployer (admin deposits on behalf of users)
    await confidentialUSDC.mintPlaintext(deployer.address, 2000n * ONE_USDC);

    // Set marketplace as operator for deployer (admin)
    const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    await confidentialUSDC.connect(deployer).setOperator(marketplaceAddress, farFuture);

    // Deposit for both pseudonymous users
    await depositFor("bidder-alpha", 500n * ONE_USDC);
    await depositFor("bidder-beta", 500n * ONE_USDC);
  });

  // Helper: deposit for a pseudonymous user
  async function depositFor(userId: string, amount: bigint) {
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .add64(amount)
      .encrypt();
    await marketplace.connect(deployer).depositFor(userId, encrypted.handles[0], encrypted.inputProof);
  }

  // Helper: get decrypted internal balance
  async function getInternalBalance(userId: string): Promise<bigint> {
    const handle = await marketplace.getBalance(userId);
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  // Helper: create auction via admin
  async function createAuction(
    sellerId: string,
    eventId: number,
    prediction: boolean,
  ): Promise<number> {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .addBool(prediction)
      .add256(FAKE_AES_KEY)
      .encrypt();

    await marketplace.connect(deployer).createAuction(
      sellerId, eventId, `Will event ${eventId} happen?`, endTime,
      encrypted.handles[0], FAKE_CID, encrypted.handles[1], encrypted.inputProof,
    );
    return Number(await marketplace.nextAuctionId()) - 1;
  }

  // Helper: place bid via admin
  async function placeBid(auctionId: number, bidderId: string, previousBidderId: string, amount: bigint) {
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .add64(amount)
      .encrypt();
    await marketplace.connect(deployer).placeBid(
      auctionId, bidderId, previousBidderId, encrypted.handles[0], encrypted.inputProof, amount,
    );
  }

  it("should run the complete auction lifecycle with prediction market integration", async function () {
    // ========================================
    // PHASE 1: Create prediction market event
    // ========================================

    const pmEventId = await predictionMarket.newEvent.staticCall("Will BTC hit $100k?", 3600);
    await predictionMarket.newEvent("Will BTC hit $100k?", 3600);
    expect(pmEventId).to.equal(0);

    const pmEvent = await predictionMarket.getMarketEvent(0);
    expect(pmEvent.question).to.equal("Will BTC hit $100k?");
    expect(pmEvent.status).to.equal(0); // Open

    // ========================================
    // PHASE 2: Two sellers create auctions (via admin)
    //   alice predicts YES (correct)
    //   bob predicts NO (wrong)
    // ========================================

    const auction1 = await createAuction("alice", 0, true);
    const auction2 = await createAuction("bob", 0, false);
    expect(auction1).to.equal(0);
    expect(auction2).to.equal(1);

    // Verify sellers auto-registered
    expect((await marketplace.getSeller("alice")).registered).to.be.true;
    expect((await marketplace.getSeller("bob")).registered).to.be.true;
    expect((await marketplace.getSeller("alice")).reputationScore).to.equal(0);

    // Verify tracking
    expect((await marketplace.getOpenAuctions()).length).to.equal(2);
    expect((await marketplace.getUnresolvedEvents()).length).to.equal(1);
    expect((await marketplace.getEventAuctions(0)).length).to.equal(2);

    // ========================================
    // PHASE 3: Place competing bids (via admin)
    //   bidder-alpha: 15 USDC on auction1
    //   bidder-beta: 25 USDC on auction1 (outbids alpha)
    //   bidder-alpha: 10 USDC on auction2
    // ========================================

    expect(await getInternalBalance("bidder-alpha")).to.equal(500n * ONE_USDC);
    expect(await getInternalBalance("bidder-beta")).to.equal(500n * ONE_USDC);

    // bidder-alpha bids 15 on auction1
    await placeBid(auction1, "bidder-alpha", "", 15n * ONE_USDC);
    // bidder-beta outbids on auction1, refunding bidder-alpha
    await placeBid(auction1, "bidder-beta", "bidder-alpha", 25n * ONE_USDC);
    // bidder-alpha bids 10 on auction2
    await placeBid(auction2, "bidder-alpha", "", 10n * ONE_USDC);

    // Verify internal balances:
    // bidder-alpha: 500 - 15 (bid1) + 15 (refund) - 10 (bid2) = 490
    // bidder-beta: 500 - 25 = 475
    expect(await getInternalBalance("bidder-alpha")).to.equal(490n * ONE_USDC);
    expect(await getInternalBalance("bidder-beta")).to.equal(475n * ONE_USDC);

    // Verify currentBidderId on each auction
    const a1Data = await marketplace.getAuction(auction1);
    expect(a1Data.currentBidderId).to.equal("bidder-beta");
    const a2Data = await marketplace.getAuction(auction2);
    expect(a2Data.currentBidderId).to.equal("bidder-alpha");

    // ========================================
    // PHASE 4: Close auctions (simulating auction-closer daemon)
    // ========================================

    await marketplace.adminExpireAuction(auction1);
    await marketplace.adminExpireAuction(auction2);
    await marketplace.closeAuction(auction1);
    await marketplace.closeAuction(auction2);

    // Verify pending decryption flags
    expect(await marketplace.pendingAuctionClose(auction1)).to.be.true;
    expect(await marketplace.pendingAuctionClose(auction2)).to.be.true;

    // Verify removed from open auctions
    expect((await marketplace.getOpenAuctions()).length).to.equal(0);

    // Verify seller balances credited (encrypted add during close)
    // alice gets 25 USDC (from bidder-beta's winning bid)
    // bob gets 10 USDC (from bidder-alpha's winning bid)
    expect(await getInternalBalance("alice")).to.equal(25n * ONE_USDC);
    expect(await getInternalBalance("bob")).to.equal(10n * ONE_USDC);

    // ========================================
    // PHASE 5: Finalize auction close (mock decryption proof)
    // ========================================

    // Auction 1: bidder-beta wins with 25 USDC
    const [, , a1BidHandle] = await marketplace.getAuction(auction1);
    const a1Decrypt = await fhevm.publicDecrypt([a1BidHandle]);
    const a1WinningBid = a1Decrypt.clearValues[ethers.toBeHex(a1BidHandle, 32)] as bigint;
    expect(a1WinningBid).to.equal(25n * ONE_USDC);

    await marketplace.finalizeAuctionClose(auction1, a1WinningBid, a1Decrypt.decryptionProof);
    expect(await marketplace.pendingAuctionClose(auction1)).to.be.false;

    // Auction 2: bidder-alpha wins with 10 USDC
    const [, , a2BidHandle] = await marketplace.getAuction(auction2);
    const a2Decrypt = await fhevm.publicDecrypt([a2BidHandle]);
    const a2WinningBid = a2Decrypt.clearValues[ethers.toBeHex(a2BidHandle, 32)] as bigint;
    expect(a2WinningBid).to.equal(10n * ONE_USDC);

    await marketplace.finalizeAuctionClose(auction2, a2WinningBid, a2Decrypt.decryptionProof);
    expect(await marketplace.pendingAuctionClose(auction2)).to.be.false;

    // ========================================
    // PHASE 6: Final balance check after all closes
    // ========================================

    // bidder-alpha: 490 (unchanged — bid locked in winning auction2)
    // bidder-beta: 475 (unchanged — bid locked in winning auction1)
    // alice (seller): 25 (credited from auction1 close)
    // bob (seller): 10 (credited from auction2 close)
    expect(await getInternalBalance("bidder-alpha")).to.equal(490n * ONE_USDC);
    expect(await getInternalBalance("bidder-beta")).to.equal(475n * ONE_USDC);
    expect(await getInternalBalance("alice")).to.equal(25n * ONE_USDC);
    expect(await getInternalBalance("bob")).to.equal(10n * ONE_USDC);

    // Contract token balance: 2000 deposited total (1000 for marketplace via depositFor)
    // All funds accounted for: 490 + 475 + 25 + 10 = 1000
    const contractBalHandle = await confidentialUSDC.confidentialBalanceOf(marketplaceAddress);
    const contractBal = await fhevm.debugger.decryptEuint(FhevmType.euint64, contractBalHandle);
    expect(contractBal).to.equal(1000n * ONE_USDC);

    // ========================================
    // PHASE 7: Settle prediction market event
    //   Outcome: YES (BTC did hit $100k)
    // ========================================

    await predictionMarket.forceSettle(
      0,
      2, // Outcome.Yes
      9500, // confidence 95%
      "gemini-response-123",
    );

    const settledEvent = await predictionMarket.getMarketEvent(0);
    expect(settledEvent.status).to.equal(2); // Settled
    expect(settledEvent.outcome).to.equal(2); // Yes

    // ========================================
    // PHASE 8: Resolve predictions (simulating reputation-resolver daemon)
    //   Outcome was YES:
    //     alice predicted YES -> correct -> +1 rep
    //     bob predicted NO -> wrong -> -1 rep
    // ========================================

    expect((await marketplace.getUnresolvedEvents()).length).to.equal(1);

    await marketplace.connect(deployer).resolveEventPredictions(0, true);

    expect(await marketplace.eventResolved(0)).to.be.true;
    expect((await marketplace.getUnresolvedEvents()).length).to.equal(0);
    expect(await marketplace.pendingReputationDecrypt(auction1)).to.be.true;
    expect(await marketplace.pendingReputationDecrypt(auction2)).to.be.true;

    // ========================================
    // PHASE 9: Finalize reputation results
    // ========================================

    // Auction 1: alice predicted YES, outcome YES -> correct
    const isCorrect1Handle = await marketplace.pendingIsCorrectHandle(auction1);
    const rep1Decrypt = await fhevm.publicDecrypt([isCorrect1Handle]);
    const rep1Value = rep1Decrypt.clearValues[ethers.toBeHex(isCorrect1Handle, 32)] as boolean;
    expect(rep1Value).to.equal(true);
    await marketplace.finalizeReputationResult(auction1, rep1Value, rep1Decrypt.decryptionProof);

    // Auction 2: bob predicted NO, outcome YES -> wrong
    const isCorrect2Handle = await marketplace.pendingIsCorrectHandle(auction2);
    const rep2Decrypt = await fhevm.publicDecrypt([isCorrect2Handle]);
    const rep2Value = rep2Decrypt.clearValues[ethers.toBeHex(isCorrect2Handle, 32)] as boolean;
    expect(rep2Value).to.equal(false);
    await marketplace.finalizeReputationResult(auction2, rep2Value, rep2Decrypt.decryptionProof);

    // Verify reputation flags cleared
    expect(await marketplace.pendingReputationDecrypt(auction1)).to.be.false;
    expect(await marketplace.pendingReputationDecrypt(auction2)).to.be.false;

    // Verify reputation scores
    expect((await marketplace.getSeller("alice")).reputationScore).to.equal(1);
    expect((await marketplace.getSeller("bob")).reputationScore).to.equal(-1);

    // Verify auction resolved flags
    expect((await marketplace.getAuction(auction1)).reputationResolved).to.be.true;
    expect((await marketplace.getAuction(auction2)).reputationResolved).to.be.true;

    // ========================================
    // PHASE 10: Verify secret data access
    // ========================================

    // secretDataCid stored correctly
    expect((await marketplace.getAuction(auction1)).secretDataCid).to.equal(FAKE_CID);

    // No user ACL assertions — admin decrypts off-chain and relays to winner privately
  });

  it("should handle auction cancellation mid-lifecycle", async function () {
    // Create event and auction
    await predictionMarket.newEvent("Will ETH flip BTC?", 3600);
    const auctionId = await createAuction("alice", 1, false);

    // Place bid
    await placeBid(auctionId, "bidder-alpha", "", 20n * ONE_USDC);

    const balBefore = await getInternalBalance("bidder-alpha");

    // Admin cancels
    await marketplace.connect(deployer).cancelAuction(auctionId);

    // Bidder should get full refund
    const balAfter = await getInternalBalance("bidder-alpha");
    expect(balAfter - balBefore).to.equal(20n * ONE_USDC);

    // Auction status = Cancelled
    const auction = await marketplace.getAuction(auctionId);
    expect(auction.status).to.equal(2); // Cancelled

    expect((await marketplace.getOpenAuctions()).length).to.equal(0);
  });

  it("should handle event resolution that auto-cancels open auctions and refunds bidders", async function () {
    await predictionMarket.newEvent("Will SOL hit $500?", 3600);

    // Create auction but DON'T close it
    const auctionId = await createAuction("alice", 2, true);
    await placeBid(auctionId, "bidder-alpha", "", 10n * ONE_USDC);

    const balBefore = await getInternalBalance("bidder-alpha");

    // Settle the PM event
    await predictionMarket.forceSettle(2, 1, 8000, "evidence"); // Outcome: NO

    // Resolve predictions — should auto-cancel the open auction and refund bidder
    await marketplace.connect(deployer).resolveEventPredictions(2, false);

    const auction = await marketplace.getAuction(auctionId);
    expect(auction.status).to.equal(2); // Cancelled

    // Auto-cancel refunds current bidder
    const balAfter = await getInternalBalance("bidder-alpha");
    expect(balAfter - balBefore).to.equal(10n * ONE_USDC);
  });

  it("should handle multiple auctions across multiple events with cumulative reputation", async function () {
    await predictionMarket.newEvent("Event A?", 3600);
    await predictionMarket.newEvent("Event B?", 3600);

    // alice creates auctions for both events, predicting YES on both
    const a1 = await createAuction("alice", 3, true);
    const a2 = await createAuction("alice", 4, true);

    // Close both (no bids — simplifies this test)
    await marketplace.adminExpireAuction(a1);
    await marketplace.adminExpireAuction(a2);
    await marketplace.closeAuction(a1);
    await marketplace.closeAuction(a2);

    // Settle event A as YES -> prediction correct -> +1
    await predictionMarket.forceSettle(3, 2, 9000, "ev-a");
    await marketplace.connect(deployer).resolveEventPredictions(3, true);
    const isCorrectA = await marketplace.pendingIsCorrectHandle(a1);
    const repDecryptA = await fhevm.publicDecrypt([isCorrectA]);
    const repValueA = await fhevm.publicDecryptEbool(isCorrectA);
    await marketplace.finalizeReputationResult(a1, repValueA, repDecryptA.decryptionProof);

    expect((await marketplace.getSeller("alice")).reputationScore).to.equal(1);

    // Settle event B as NO -> prediction wrong -> -1
    await predictionMarket.forceSettle(4, 1, 8500, "ev-b");
    await marketplace.connect(deployer).resolveEventPredictions(4, false);
    const isCorrectB = await marketplace.pendingIsCorrectHandle(a2);
    const repDecryptB = await fhevm.publicDecrypt([isCorrectB]);
    const repValueB = await fhevm.publicDecryptEbool(isCorrectB);
    await marketplace.finalizeReputationResult(a2, repValueB, repDecryptB.decryptionProof);

    // Net reputation: +1 - 1 = 0
    expect((await marketplace.getSeller("alice")).reputationScore).to.equal(0);

    expect(await marketplace.eventResolved(3)).to.be.true;
    expect(await marketplace.eventResolved(4)).to.be.true;
    expect((await marketplace.getUnresolvedEvents()).length).to.equal(0);
  });

  it("should close auction via real time expiry (not adminExpireAuction)", async function () {
    await predictionMarket.newEvent("Time test event?", 3600);

    // Create auction with short duration (60 seconds)
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const endTime = now + 60;
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .addBool(true)
      .add256(FAKE_AES_KEY)
      .encrypt();

    await marketplace.connect(deployer).createAuction(
      "alice", 5, "Time test", endTime,
      encrypted.handles[0], FAKE_CID, encrypted.handles[1], encrypted.inputProof,
    );
    const auctionId = Number(await marketplace.nextAuctionId()) - 1;

    // Place a bid
    await placeBid(auctionId, "bidder-alpha", "", 10n * ONE_USDC);

    // Trying to close before expiry should revert
    let reverted = false;
    try {
      await marketplace.closeAuction(auctionId);
    } catch {
      reverted = true;
    }
    expect(reverted).to.be.true;

    // Advance time past endTime
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    // Now closing should succeed
    await marketplace.closeAuction(auctionId);

    const auction = await marketplace.getAuction(auctionId);
    expect(auction.status).to.equal(1); // Closed
    expect(await marketplace.pendingAuctionClose(auctionId)).to.be.true;

    // Seller credited
    expect(await getInternalBalance("alice")).to.equal(10n * ONE_USDC);

    // Finalize with proper decryption proof
    const [, , bidHandle] = await marketplace.getAuction(auctionId);
    const decryptResult = await fhevm.publicDecrypt([bidHandle]);
    const winningBid = decryptResult.clearValues[ethers.toBeHex(bidHandle, 32)] as bigint;
    expect(winningBid).to.equal(10n * ONE_USDC);

    await marketplace.finalizeAuctionClose(auctionId, winningBid, decryptResult.decryptionProof);
    expect(await marketplace.pendingAuctionClose(auctionId)).to.be.false;
  });
});
