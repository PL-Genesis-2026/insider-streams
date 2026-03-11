import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FHESecretMarketplace, FHEConfidentialUSDC } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

const FAKE_CID = ethers.keccak256(ethers.toUtf8Bytes("QmFakeIPFSCid123"));
const FAKE_AES_KEY = 12345678901234567890n;
const ONE_USDC = 1_000_000n;

async function deployFixture() {
  const [deployer, settler, nonOwner] = await ethers.getSigners();

  const tokenFactory = await ethers.getContractFactory("FHEConfidentialUSDC");
  const token = (await tokenFactory.deploy(deployer.address)) as FHEConfidentialUSDC;
  const tokenAddress = await token.getAddress();

  const marketFactory = await ethers.getContractFactory("FHESecretMarketplace");
  const marketplace = (await marketFactory.deploy(
    tokenAddress,
    settler.address,
  )) as FHESecretMarketplace;
  const marketplaceAddress = await marketplace.getAddress();

  // Mint USDC to deployer (admin) and set marketplace as operator
  const mintAmount = 10_000n * ONE_USDC;
  await token.mintPlaintext(deployer.address, mintAmount);
  const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  await token.connect(deployer).setOperator(marketplaceAddress, farFuture);

  return { token, tokenAddress, marketplace, marketplaceAddress, signers: { deployer, settler, nonOwner } };
}

function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe("FHESecretMarketplace — Async Decryption & Reputation", function () {
  let token: FHEConfidentialUSDC;
  let marketplace: FHESecretMarketplace;
  let marketplaceAddress: string;
  let signers: { deployer: HardhatEthersSigner; settler: HardhatEthersSigner; nonOwner: HardhatEthersSigner };

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite requires mock FHE environment");
      this.skip();
    }
  });

  beforeEach(async function () {
    ({ token, marketplace, marketplaceAddress, signers } = await deployFixture());
  });

  async function createTestAuction(
    sellerId: string,
    eventId: number,
    prediction: boolean,
  ): Promise<number> {
    const endTime = futureTimestamp(3600);
    const encryptedInput = await fhevm
      .createEncryptedInput(marketplaceAddress, signers.deployer.address)
      .addBool(prediction)
      .add256(FAKE_AES_KEY)
      .encrypt();

    await marketplace
      .connect(signers.deployer)
      .createAuction(
        sellerId, eventId, `Event ${eventId}`, endTime,
        encryptedInput.handles[0], FAKE_CID,
        encryptedInput.handles[1], encryptedInput.inputProof,
      );
    return Number(await marketplace.nextAuctionId()) - 1;
  }

  async function depositFor(userId: string, amount: bigint) {
    const encryptedInput = await fhevm
      .createEncryptedInput(marketplaceAddress, signers.deployer.address)
      .add64(amount)
      .encrypt();
    await marketplace.connect(signers.deployer).depositFor(
      userId,
      encryptedInput.handles[0],
      encryptedInput.inputProof,
    );
  }

  async function getInternalBalance(userId: string): Promise<bigint> {
    const handle = await marketplace.getBalance(userId);
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  async function placeBid(
    auctionId: number,
    bidderId: string,
    previousBidderId: string,
    amount: bigint,
  ) {
    const encryptedInput = await fhevm
      .createEncryptedInput(marketplaceAddress, signers.deployer.address)
      .add64(amount)
      .encrypt();
    await marketplace
      .connect(signers.deployer)
      .placeBid(auctionId, bidderId, previousBidderId, encryptedInput.handles[0], encryptedInput.inputProof, amount);
  }

  describe("Balance Decryption", function () {
    it("should allow owner to request balance decryption", async function () {
      await depositFor("user1", 50n * ONE_USDC);

      // Request public decryption of the balance handle
      await marketplace.connect(signers.deployer).requestBalanceDecrypt("user1");

      // Get the handle and decrypt it
      const handle = await marketplace.getBalance("user1");
      const decryptResult = await fhevm.publicDecrypt([handle]);
      const clearBalance = decryptResult.clearValues[ethers.toBeHex(handle, 32)] as bigint;
      expect(clearBalance).to.equal(50n * ONE_USDC);
    });

    it("should revert for non-owner", async function () {
      await depositFor("user1", 10n * ONE_USDC);

      try {
        await marketplace.connect(signers.nonOwner).requestBalanceDecrypt("user1");
        expect.fail("Should have reverted");
      } catch (err: unknown) {
        expect((err as Error).message).to.include("OwnableUnauthorizedAccount");
      }
    });

    it("should revert for user with no balance", async function () {
      try {
        await marketplace.connect(signers.deployer).requestBalanceDecrypt("nobody");
        expect.fail("Should have reverted");
      } catch (err: unknown) {
        expect((err as Error).message).to.include("No balance");
      }
    });
  });

  describe("Auction Close with Decryption", function () {
    it("should close auction and mark for decryption", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      expect(await marketplace.pendingAuctionClose(auctionId)).to.be.true;
    });

    it("should finalize auction close with decryption proof", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // Get currentBid handle from the auction
      const [, , currentBidHandle] = await marketplace.getAuction(auctionId);

      // Get decryption proof for currentBid only
      const decryptResult = await fhevm.publicDecrypt([currentBidHandle]);
      const clearBid = decryptResult.clearValues[ethers.toBeHex(currentBidHandle, 32)] as bigint;
      expect(clearBid).to.equal(10n * ONE_USDC);

      // Finalize with (auctionId, winningBid, decryptionProof)
      await marketplace.finalizeAuctionClose(auctionId, clearBid, decryptResult.decryptionProof);

      // Verify state after finalization
      expect(await marketplace.pendingAuctionClose(auctionId)).to.be.false;

      // Seller should have been credited
      const sellerBalance = await getInternalBalance("seller1");
      expect(sellerBalance).to.equal(10n * ONE_USDC);
    });

    it("should close auction with no bids", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // No bid = no pending decryption
      expect(await marketplace.pendingAuctionClose(auctionId)).to.be.false;

      const [, , , , , , status] = await marketplace.getAuction(auctionId);
      expect(status).to.equal(1); // Closed
    });

    it("should credit seller balance on close with bid", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 25n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 25n * ONE_USDC);

      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // Seller balance should be credited (encrypted add during close)
      const sellerBalance = await getInternalBalance("seller1");
      expect(sellerBalance).to.equal(25n * ONE_USDC);
    });

    it("should refund current bidder on cancel", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 10n * ONE_USDC);
      await depositFor("bidder2", 20n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder2", "bidder1", 20n * ONE_USDC);

      // bidder1 already refunded by replacement
      expect(await getInternalBalance("bidder1")).to.equal(10n * ONE_USDC);
      expect(await getInternalBalance("bidder2")).to.equal(0n);

      // Cancel — refunds current bidder (bidder2)
      await marketplace.connect(signers.deployer).cancelAuction(auctionId);

      expect(await getInternalBalance("bidder2")).to.equal(20n * ONE_USDC);
    });
  });

  describe("Reputation Resolution", function () {
    it("should resolve event predictions and mark for decryption", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      // Close auction
      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // Resolve event as YES (prediction was correct)
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      expect(await marketplace.pendingReputationDecrypt(auctionId)).to.be.true;
      expect(await marketplace.eventResolved(0)).to.be.true;

      // Should be removed from unresolved events
      const unresolved = await marketplace.getUnresolvedEvents();
      expect(unresolved.length).to.equal(0);
    });

    it("should prevent double resolution", async function () {
      await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(0);
      await marketplace.closeAuction(0);
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      let reverted = false;
      try {
        await marketplace.connect(signers.settler).resolveEventPredictions(0, true);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should only allow settler to resolve", async function () {
      await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(0);
      await marketplace.closeAuction(0);

      let reverted = false;
      try {
        await marketplace.connect(signers.nonOwner).resolveEventPredictions(0, true);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should cancel open auctions during event resolution and refund bidders", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      await depositFor("bidder1", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      expect(await getInternalBalance("bidder1")).to.equal(0n);

      // Resolve event (should auto-cancel the open auction and refund current bidder)
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      const [, , , , , , status] = await marketplace.getAuction(auctionId);
      expect(status).to.equal(2); // Cancelled

      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.length).to.equal(0);

      // Bidder should be refunded
      expect(await getInternalBalance("bidder1")).to.equal(10n * ONE_USDC);
    });

    it("should handle multiple auctions for same event", async function () {
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller2", 0, false);

      // Close both
      await marketplace.adminExpireAuction(0);
      await marketplace.adminExpireAuction(1);
      await marketplace.closeAuction(0);
      await marketplace.closeAuction(1);

      // Resolve event as YES
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      // Both should have pending reputation
      expect(await marketplace.pendingReputationDecrypt(0)).to.be.true;
      expect(await marketplace.pendingReputationDecrypt(1)).to.be.true;
    });

    it("should finalize reputation and update scores", async function () {
      // Seller predicts YES
      const auctionId = await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // Resolve as YES (correct)
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      // Get isCorrect handle and decrypt
      const isCorrectHandle = await marketplace.pendingIsCorrectHandle(auctionId);
      const repDecrypt = await fhevm.publicDecrypt([isCorrectHandle]);
      const repValue = repDecrypt.clearValues[ethers.toBeHex(isCorrectHandle, 32)] as boolean;
      expect(repValue).to.equal(true);

      await marketplace.finalizeReputationResult(auctionId, repValue, repDecrypt.decryptionProof);

      // Verify reputation updated
      expect(await marketplace.pendingReputationDecrypt(auctionId)).to.be.false;
      const seller = await marketplace.getSeller("seller1");
      expect(seller.reputationScore).to.equal(1);

      // Verify auction marked resolved
      const [, , , , , , , reputationResolved] = await marketplace.getAuction(auctionId);
      expect(reputationResolved).to.be.true;
    });

    it("should decrement reputation for wrong prediction", async function () {
      // Seller predicts NO
      const auctionId = await createTestAuction("seller1", 0, false);
      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      // Resolve as YES (prediction was wrong)
      await marketplace.connect(signers.settler).resolveEventPredictions(0, true);

      const isCorrectHandle = await marketplace.pendingIsCorrectHandle(auctionId);
      const repDecrypt = await fhevm.publicDecrypt([isCorrectHandle]);
      const repValue = repDecrypt.clearValues[ethers.toBeHex(isCorrectHandle, 32)] as boolean;
      expect(repValue).to.equal(false);

      await marketplace.finalizeReputationResult(auctionId, repValue, repDecrypt.decryptionProof);

      const seller = await marketplace.getSeller("seller1");
      expect(seller.reputationScore).to.equal(-1);
    });
  });
});
