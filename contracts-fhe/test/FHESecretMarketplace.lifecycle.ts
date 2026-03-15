import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FHESecretMarketplace, FHEConfidentialUSDC } from "../types";
import { expect } from "chai";

// Fake IPFS CID as bytes32
const FAKE_CID = ethers.keccak256(ethers.toUtf8Bytes("QmFakeIPFSCid123"));
// Fake AES key (256-bit)
const FAKE_AES_KEY = 12345678901234567890n;

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

describe("FHESecretMarketplace — Auction Lifecycle", function () {
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
    endTime?: number,
  ): Promise<number> {
    const _endTime = endTime ?? futureTimestamp(3600);

    // All encrypted inputs created by deployer (admin)
    const encryptedInput = await fhevm
      .createEncryptedInput(marketplaceAddress, signers.deployer.address)
      .addBool(prediction)
      .add256(FAKE_AES_KEY)
      .encrypt();

    await marketplace
      .connect(signers.deployer)
      .createAuction(
        sellerId,
        eventId,
        `Event ${eventId} Title`,
        _endTime,
        encryptedInput.handles[0], // encrypted prediction
        FAKE_CID,
        encryptedInput.handles[1], // encrypted AES key
        encryptedInput.inputProof,
      );

    // Get auction ID from nextAuctionId - 1
    const auctionId = Number(await marketplace.nextAuctionId()) - 1;
    return auctionId;
  }

  describe("Auction Creation", function () {
    it("should create an auction with encrypted prediction", async function () {
      const auctionId = await createTestAuction("seller1", 0, true);
      expect(auctionId).to.equal(0);

      const [sellerId, endTime, , , eventId, eventTitle, status, reputationResolved, secretDataCid] =
        await marketplace.getAuction(auctionId);

      expect(sellerId).to.equal("seller1");
      expect(eventId).to.equal(0);
      expect(eventTitle).to.equal("Event 0 Title");
      expect(status).to.equal(0); // Open
      expect(reputationResolved).to.equal(false);
      expect(secretDataCid).to.equal(FAKE_CID);
      expect(endTime).to.be.gt(0);
    });

    it("should auto-register seller on first auction", async function () {
      await createTestAuction("seller1", 0, true);

      const sellerData = await marketplace.getSeller("seller1");
      expect(sellerData.registered).to.be.true;
      expect(sellerData.reputationScore).to.equal(0);
    });

    it("should track open auctions", async function () {
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller1", 1, false);

      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.length).to.equal(2);
      expect(openAuctions[0]).to.equal(0);
      expect(openAuctions[1]).to.equal(1);
    });

    it("should track event-to-auction mapping", async function () {
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller2", 0, false);

      const eventAuctions = await marketplace.getEventAuctions(0);
      expect(eventAuctions.length).to.equal(2);
    });

    it("should track seller auctions", async function () {
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller1", 1, false);

      const sellerAuctions = await marketplace.getSellerAuctions("seller1");
      expect(sellerAuctions.length).to.equal(2);
    });

    it("should revert on end time in past", async function () {
      const pastTime = Math.floor(Date.now() / 1000) - 100;
      let reverted = false;
      try {
        await createTestAuction("seller1", 0, true, pastTime);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should track unresolved events", async function () {
      await createTestAuction("seller1", 0, true);

      const unresolved = await marketplace.getUnresolvedEvents();
      expect(unresolved.length).to.equal(1);
      expect(unresolved[0]).to.equal(0);
    });

    it("should not duplicate unresolved event tracking", async function () {
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller2", 0, false);

      const unresolved = await marketplace.getUnresolvedEvents();
      expect(unresolved.length).to.equal(1);
    });

    it("should revert if non-owner calls createAuction", async function () {
      const endTime = futureTimestamp(3600);
      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, signers.nonOwner.address)
        .addBool(true)
        .add256(FAKE_AES_KEY)
        .encrypt();

      let reverted = false;
      try {
        await marketplace
          .connect(signers.nonOwner)
          .createAuction(
            "seller1", 0, "Event 0", endTime,
            encryptedInput.handles[0], FAKE_CID,
            encryptedInput.handles[1], encryptedInput.inputProof,
          );
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Auction Close", function () {
    it("should close an expired auction", async function () {
      await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(0);

      await marketplace.closeAuction(0);

      const [, , , , , , status] = await marketplace.getAuction(0);
      expect(status).to.equal(1); // Closed

      // Should be removed from open auctions
      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.length).to.equal(0);
    });

    it("should revert if auction not expired", async function () {
      await createTestAuction("seller1", 0, true);

      let reverted = false;
      try {
        await marketplace.closeAuction(0);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if already closed", async function () {
      await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(0);
      await marketplace.closeAuction(0);

      let reverted = false;
      try {
        await marketplace.closeAuction(0);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if non-owner calls closeAuction", async function () {
      await createTestAuction("seller1", 0, true);
      await marketplace.adminExpireAuction(0);

      let reverted = false;
      try {
        await marketplace.connect(signers.nonOwner).closeAuction(0);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Auction Cancel", function () {
    it("should allow owner to cancel an auction", async function () {
      await createTestAuction("seller1", 0, true);

      await marketplace.connect(signers.deployer).cancelAuction(0);

      const [, , , , , , status] = await marketplace.getAuction(0);
      expect(status).to.equal(2); // Cancelled

      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.length).to.equal(0);
    });

    it("should revert if non-owner cancels", async function () {
      await createTestAuction("seller1", 0, true);

      let reverted = false;
      try {
        await marketplace.connect(signers.nonOwner).cancelAuction(0);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Open Auction Tracking", function () {
    it("should correctly track and remove open auctions", async function () {
      // Create 3 auctions
      await createTestAuction("seller1", 0, true);
      await createTestAuction("seller1", 1, false);
      await createTestAuction("seller1", 2, true);

      expect((await marketplace.getOpenAuctions()).length).to.equal(3);

      // Close middle one
      await marketplace.adminExpireAuction(1);
      await marketplace.closeAuction(1);

      const remaining = await marketplace.getOpenAuctions();
      expect(remaining.length).to.equal(2);
      // After swap-and-pop, order is [0, 2]
      expect(remaining).to.include(0n);
      expect(remaining).to.include(2n);
    });
  });
});
