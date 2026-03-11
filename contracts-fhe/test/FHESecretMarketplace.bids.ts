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

  // Deploy ConfidentialUSDC
  const tokenFactory = await ethers.getContractFactory("FHEConfidentialUSDC");
  const token = (await tokenFactory.deploy(deployer.address)) as FHEConfidentialUSDC;
  const tokenAddress = await token.getAddress();

  // Deploy FHESecretMarketplace
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

  return {
    token,
    tokenAddress,
    marketplace,
    marketplaceAddress,
    signers: { deployer, settler, nonOwner },
  };
}

function futureTimestamp(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

describe("FHESecretMarketplace — Encrypted Bids", function () {
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

  // All helpers use deployer (admin) as the on-chain actor

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
    // Use debug decryptor since balances are allowThis only (no user ACL)
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
      .placeBid(
        auctionId,
        bidderId,
        previousBidderId,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        amount,
      );
  }

  describe("Deposit & Withdraw", function () {
    it("should deposit and increase internal balance", async function () {
      await depositFor("user1", 100n * ONE_USDC);
      const balance = await getInternalBalance("user1");
      expect(balance).to.equal(100n * ONE_USDC);
    });

    it("should accumulate multiple deposits", async function () {
      await depositFor("user1", 50n * ONE_USDC);
      await depositFor("user1", 30n * ONE_USDC);
      const balance = await getInternalBalance("user1");
      expect(balance).to.equal(80n * ONE_USDC);
    });

    it("should withdraw tokens to admin", async function () {
      await depositFor("user1", 100n * ONE_USDC);

      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.deployer.address)
        .add64(100n * ONE_USDC)
        .encrypt();

      await marketplace.connect(signers.deployer).withdrawFor(
        "user1",
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      const balance = await getInternalBalance("user1");
      expect(balance).to.equal(0n);
    });

    it("should handle withdraw more than balance gracefully (tryDecrease)", async function () {
      await depositFor("user1", 50n * ONE_USDC);

      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.deployer.address)
        .add64(100n * ONE_USDC)
        .encrypt();

      // Should not revert — tryDecrease handles underflow gracefully
      await marketplace.connect(signers.deployer).withdrawFor(
        "user1",
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      // Balance unchanged (withdraw failed silently due to insufficient funds)
      const balance = await getInternalBalance("user1");
      expect(balance).to.equal(50n * ONE_USDC);
    });

    it("should isolate balances between users", async function () {
      await depositFor("user1", 100n * ONE_USDC);
      await depositFor("user2", 200n * ONE_USDC);

      expect(await getInternalBalance("user1")).to.equal(100n * ONE_USDC);
      expect(await getInternalBalance("user2")).to.equal(200n * ONE_USDC);
    });

    it("should revert if non-owner calls depositFor", async function () {
      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.nonOwner.address)
        .add64(100n * ONE_USDC)
        .encrypt();

      let reverted = false;
      try {
        await marketplace.connect(signers.nonOwner).depositFor(
          "user1",
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if non-owner calls withdrawFor", async function () {
      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.nonOwner.address)
        .add64(100n * ONE_USDC)
        .encrypt();

      let reverted = false;
      try {
        await marketplace.connect(signers.nonOwner).withdrawFor(
          "user1",
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Placing Bids", function () {
    let auctionId: number;

    beforeEach(async function () {
      auctionId = await createTestAuction("seller1", 0, true);
    });

    it("should accept a first bid", async function () {
      const bidAmount = 10n * ONE_USDC;
      await depositFor("bidder1", bidAmount);
      await placeBid(auctionId, "bidder1", "", bidAmount);

      // Verify bid stored on auction
      const [, , currentBid, currentBidderId] = await marketplace.getAuction(auctionId);
      const clearBid = await fhevm.debugger.decryptEuint(FhevmType.euint64, currentBid);
      expect(clearBid).to.equal(bidAmount);
      expect(currentBidderId).to.equal("bidder1");

      // Bidder balance should be 0
      expect(await getInternalBalance("bidder1")).to.equal(0n);
    });

    it("should replace bid from a different bidder (highest-bid-only)", async function () {
      await depositFor("bidder1", 10n * ONE_USDC);
      await depositFor("bidder2", 20n * ONE_USDC);

      // bidder1 bids first
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      // bidder2 outbids — bidder1 gets refunded
      await placeBid(auctionId, "bidder2", "bidder1", 20n * ONE_USDC);

      // currentBid should be 20 USDC, currentBidderId should be bidder2
      const [, , currentBid, currentBidderId] = await marketplace.getAuction(auctionId);
      const clearBid = await fhevm.debugger.decryptEuint(FhevmType.euint64, currentBid);
      expect(clearBid).to.equal(20n * ONE_USDC);
      expect(currentBidderId).to.equal("bidder2");

      // bidder1 should be refunded
      expect(await getInternalBalance("bidder1")).to.equal(10n * ONE_USDC);
      // bidder2 balance should be 0
      expect(await getInternalBalance("bidder2")).to.equal(0n);
    });

    it("should handle same bidder re-bidding with higher amount (refund old bid, deduct new)", async function () {
      await depositFor("bidder1", 80n * ONE_USDC);

      // Bid 30
      await placeBid(auctionId, "bidder1", "", 30n * ONE_USDC);
      expect(await getInternalBalance("bidder1")).to.equal(50n * ONE_USDC);

      // Re-bid 40 (bidder1 is also previousBidderId — must exceed current 30)
      await placeBid(auctionId, "bidder1", "bidder1", 40n * ONE_USDC);

      // Balance: 50 (remaining) + 30 (refund) - 40 (new bid) = 40
      expect(await getInternalBalance("bidder1")).to.equal(40n * ONE_USDC);

      // Current bid should be 40
      const [, , currentBid] = await marketplace.getAuction(auctionId);
      const clearBid = await fhevm.debugger.decryptEuint(FhevmType.euint64, currentBid);
      expect(clearBid).to.equal(40n * ONE_USDC);
    });

    it("should deduct from internal balance on bid", async function () {
      const bidAmount = 50n * ONE_USDC;
      await depositFor("bidder1", bidAmount);

      await placeBid(auctionId, "bidder1", "", bidAmount);

      expect(await getInternalBalance("bidder1")).to.equal(0n);
    });

    it("should prevent bidding on expired auction", async function () {
      await depositFor("bidder1", 10n * ONE_USDC);
      await marketplace.adminExpireAuction(auctionId);

      let reverted = false;
      try {
        await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should prevent bidding on closed auction", async function () {
      await depositFor("bidder1", 10n * ONE_USDC);
      await marketplace.adminExpireAuction(auctionId);
      await marketplace.closeAuction(auctionId);

      let reverted = false;
      try {
        await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if non-owner calls placeBid", async function () {
      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.nonOwner.address)
        .add64(10n * ONE_USDC)
        .encrypt();

      let reverted = false;
      try {
        await marketplace
          .connect(signers.nonOwner)
          .placeBid(auctionId, "bidder1", "", encryptedInput.handles[0], encryptedInput.inputProof, 10n * ONE_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if bid does not exceed current bid", async function () {
      await depositFor("bidder1", 20n * ONE_USDC);
      await depositFor("bidder2", 20n * ONE_USDC);

      // bidder1 bids 10
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      // bidder2 tries to bid equal amount — should revert
      let reverted = false;
      try {
        await placeBid(auctionId, "bidder2", "bidder1", 10n * ONE_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;

      // bidder2 tries to bid lower — should revert
      reverted = false;
      try {
        await placeBid(auctionId, "bidder2", "bidder1", 5n * ONE_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should emit BidPlaced with bidAmount and previousBid", async function () {
      await depositFor("bidder1", 10n * ONE_USDC);
      await depositFor("bidder2", 20n * ONE_USDC);

      // First bid — previousBid should be 0
      const encryptedInput1 = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.deployer.address)
        .add64(10n * ONE_USDC)
        .encrypt();

      await expect(
        marketplace.connect(signers.deployer).placeBid(
          auctionId, "bidder1", "",
          encryptedInput1.handles[0], encryptedInput1.inputProof,
          10n * ONE_USDC,
        ),
      ).to.emit(marketplace, "BidPlaced").withArgs(auctionId, 10n * ONE_USDC, 0);

      // Second bid — previousBid should be 10 USDC
      const encryptedInput2 = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.deployer.address)
        .add64(20n * ONE_USDC)
        .encrypt();

      await expect(
        marketplace.connect(signers.deployer).placeBid(
          auctionId, "bidder2", "bidder1",
          encryptedInput2.handles[0], encryptedInput2.inputProof,
          20n * ONE_USDC,
        ),
      ).to.emit(marketplace, "BidPlaced").withArgs(auctionId, 20n * ONE_USDC, 10n * ONE_USDC);
    });

    it("should return currentBidPlaintext from getAuction", async function () {
      await depositFor("bidder1", 10n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);

      const auction = await marketplace.getAuction(auctionId);
      expect(auction.currentBidPlaintext).to.equal(10n * ONE_USDC);
    });
  });

  describe("Bid Refunds on Cancel", function () {
    it("should refund current bidder to internal balance when auction is cancelled", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);

      // Deposit and bid (highest-bid-only: only one bid stored at a time)
      await depositFor("bidder1", 10n * ONE_USDC);
      await depositFor("bidder2", 20n * ONE_USDC);
      await placeBid(auctionId, "bidder1", "", 10n * ONE_USDC);
      // bidder2 outbids, refunding bidder1
      await placeBid(auctionId, "bidder2", "bidder1", 20n * ONE_USDC);

      // bidder1 already refunded by replacement, bidder2 balance = 0
      expect(await getInternalBalance("bidder1")).to.equal(10n * ONE_USDC);
      expect(await getInternalBalance("bidder2")).to.equal(0n);

      // Cancel auction — refunds current bidder (bidder2)
      await marketplace.connect(signers.deployer).cancelAuction(auctionId);

      // bidder2 should get 20 USDC back
      expect(await getInternalBalance("bidder2")).to.equal(20n * ONE_USDC);
      // bidder1 unchanged (already refunded by replacement)
      expect(await getInternalBalance("bidder1")).to.equal(10n * ONE_USDC);
    });

    it("should cancel auction with no bids without error", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);

      await marketplace.connect(signers.deployer).cancelAuction(auctionId);

      const [, , , , , , status] = await marketplace.getAuction(auctionId);
      expect(status).to.equal(2); // Cancelled
    });
  });
});
