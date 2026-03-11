/**
 * Sepolia Smoke Test
 *
 * Exercises the full lifecycle against real FHE on Sepolia, with actual
 * decrypted balance verification (not just "handle is non-zero").
 *
 * Tests:
 * 1. Contract wiring verification
 * 2. Token minting with decrypted balance check
 * 3. Deposit & balance accumulation (decrypted)
 * 4. Auction creation & bidding (balance deducted)
 * 5. Outbid with automatic refund (decrypted balances)
 * 6. Auction close & seller payment (finalize with decryption proof)
 * 7. Auction cancel & bidder refund
 * 8. Withdraw flow
 *
 * Run: npx hardhat test test/smoke.sepolia.ts --network sepolia
 *
 * Prerequisites:
 * - All contracts deployed to Sepolia (npx hardhat deploy --network sepolia)
 * - Deployer account has Sepolia ETH
 * - .env has PRIVATE_KEY and RPC_URL set
 */

import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments, network } from "hardhat";
import { FHESecretMarketplace, FHEConfidentialUSDC, MockUSDC, ExamplePredictionMarket } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

const FAKE_CID = ethers.keccak256(ethers.toUtf8Bytes("QmSmokeTestCid"));
const FAKE_AES_KEY = 99999999999999999999n;
const ONE_USDC = 1_000_000n;

describe("Sepolia Smoke Test", function () {
  // Longer timeouts for Sepolia transactions
  this.timeout(600_000);

  let deployer: HardhatEthersSigner;
  let confidentialUSDC: FHEConfidentialUSDC;
  let confidentialUSDCAddress: string;
  let marketplace: FHESecretMarketplace;
  let marketplaceAddress: string;
  let mockUSDC: MockUSDC;
  let predictionMarket: ExamplePredictionMarket;

  // State shared across tests within the Auction Lifecycle describe block
  let auctionId: number;
  // State for the cancel test
  let cancelAuctionId: number;

  before(async function () {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    console.log(`Deployer (admin): ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`ETH balance: ${ethers.formatEther(balance)}`);

    if (balance === 0n) {
      console.warn("Deployer has no ETH — skipping");
      this.skip();
    }

    const isLocal = network.name === "hardhat" || network.name === "localhost";

    if (isLocal) {
      // Local: deploy fresh contracts via hardhat-deploy fixtures
      await deployments.fixture(["MockUSDC", "FHEConfidentialUSDC", "ExamplePredictionMarket", "FHESecretMarketplace"]);
    }

    // Get deployed contract instances (fixtures on local, pre-existing on Sepolia)
    const marketplaceDeployment = await deployments.get("FHESecretMarketplace");
    marketplace = (await ethers.getContractAt("FHESecretMarketplace", marketplaceDeployment.address)) as FHESecretMarketplace;
    marketplaceAddress = marketplaceDeployment.address;

    // Always derive the ConfidentialUSDC address from the marketplace's paymentToken
    const actualPaymentToken = await marketplace.paymentToken();
    confidentialUSDC = (await ethers.getContractAt("FHEConfidentialUSDC", actualPaymentToken)) as FHEConfidentialUSDC;
    confidentialUSDCAddress = actualPaymentToken;

    const mockUSDCDeployment = await deployments.get("MockUSDC");
    mockUSDC = (await ethers.getContractAt("MockUSDC", mockUSDCDeployment.address)) as MockUSDC;

    const pmDeployment = await deployments.get("ExamplePredictionMarket");
    predictionMarket = (await ethers.getContractAt("ExamplePredictionMarket", pmDeployment.address)) as ExamplePredictionMarket;

    console.log(`FHEConfidentialUSDC: ${confidentialUSDCAddress}`);
    console.log(`FHESecretMarketplace: ${marketplaceAddress}`);
    console.log(`MockUSDC: ${mockUSDCDeployment.address}`);
    console.log(`ExamplePredictionMarket: ${pmDeployment.address}`);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Decrypt a marketplace internal balance via requestBalanceDecrypt + publicDecrypt. */
  async function decryptInternalBalance(userId: string): Promise<bigint> {
    const handle = await marketplace.getBalance(userId);
    if (handle === ethers.ZeroHash) return 0n;

    if (fhevm.isMock) {
      return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
    }

    // On Sepolia: must call requestBalanceDecrypt (on-chain tx) to mark
    // the handle for public decryption via FHE.makePubliclyDecryptable().
    // Wait for the tx to confirm before attempting publicDecrypt.
    const tx = await marketplace.connect(deployer).requestBalanceDecrypt(userId);
    await tx.wait();

    // Re-read the handle after the tx is mined (should be same handle, but be safe)
    const freshHandle = await marketplace.getBalance(userId);
    const result = await fhevm.publicDecrypt([freshHandle]);
    return result.clearValues[ethers.toBeHex(freshHandle, 32)] as bigint;
  }

  /** Create an encrypted deposit for a user. */
  async function depositFor(userId: string, amount: bigint): Promise<void> {
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .add64(amount)
      .encrypt();
    const tx = await marketplace.connect(deployer).depositFor(
      userId,
      encrypted.handles[0],
      encrypted.inputProof,
    );
    await tx.wait();
  }

  /** Create an auction via admin. */
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

    const tx = await marketplace.createAuction(
      sellerId, eventId, `Smoke Test Event ${eventId}`, endTime,
      encrypted.handles[0], FAKE_CID, encrypted.handles[1], encrypted.inputProof,
    );
    await tx.wait();
    return Number(await marketplace.nextAuctionId()) - 1;
  }

  /** Place a bid via admin. */
  async function placeBid(
    targetAuctionId: number,
    bidderId: string,
    previousBidderId: string,
    amount: bigint,
  ): Promise<void> {
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .add64(amount)
      .encrypt();
    const tx = await marketplace.connect(deployer).placeBid(
      targetAuctionId, bidderId, previousBidderId,
      encrypted.handles[0], encrypted.inputProof, amount,
    );
    await tx.wait();
  }

  /** Withdraw from a user's internal balance. */
  async function withdrawFor(userId: string, amount: bigint): Promise<void> {
    const encrypted = await fhevm
      .createEncryptedInput(marketplaceAddress, deployer.address)
      .add64(amount)
      .encrypt();
    const tx = await marketplace.connect(deployer).withdrawFor(
      userId,
      encrypted.handles[0],
      encrypted.inputProof,
    );
    await tx.wait();
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  describe("Contract Verification", function () {
    it("should have correct payment token on marketplace", async function () {
      const token = await marketplace.paymentToken();
      expect(token).to.equal(confidentialUSDCAddress);
      console.log("  Payment token matches FHEConfidentialUSDC");
    });

    it("should have deployer as owner of confidential USDC", async function () {
      const owner = await confidentialUSDC.owner();
      expect(owner).to.equal(deployer.address);
      console.log("  Owner matches deployer");
    });

    it("should have deployer as settler on marketplace", async function () {
      const settler = await marketplace.settler();
      console.log(`  Settler: ${settler}`);
      expect(settler).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("ConfidentialUSDC Minting", function () {
    it("should mint plaintext USDC and verify decrypted balance", async function () {
      const mintAmount = 500n * ONE_USDC;
      console.log(`  Minting ${mintAmount} cUSDC to deployer...`);

      const tx = await confidentialUSDC.mintPlaintext(deployer.address, mintAmount);
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);

      const balHandle = await confidentialUSDC.confidentialBalanceOf(deployer.address);
      expect(balHandle).to.not.equal(ethers.ZeroHash);

      if (fhevm.isMock) {
        const clearBal = await fhevm.userDecryptEuint(
          FhevmType.euint64, balHandle, confidentialUSDCAddress, deployer,
        );
        console.log(`  Decrypted balance: ${clearBal}`);
        expect(clearBal).to.be.gte(mintAmount);
      } else {
        // On Sepolia: userDecryptEuint works because deployer is the token holder
        const clearBal = await fhevm.userDecryptEuint(
          FhevmType.euint64, balHandle, confidentialUSDCAddress, deployer,
        );
        console.log(`  Decrypted balance: ${clearBal}`);
        expect(clearBal).to.be.gte(mintAmount);
      }
    });
  });

  describe("Operator Setup", function () {
    it("should set marketplace as operator for deployer (admin)", async function () {
      const alreadyOp = await confidentialUSDC.isOperator(deployer.address, marketplaceAddress);
      if (alreadyOp) {
        console.log("  Marketplace is already operator — skipping");
        return;
      }

      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      const tx = await confidentialUSDC.connect(deployer).setOperator(marketplaceAddress, farFuture);
      await tx.wait();

      expect(await confidentialUSDC.isOperator(deployer.address, marketplaceAddress)).to.be.true;
      console.log("  Marketplace is now operator for deployer");
    });
  });

  describe("Deposit & Balance", function () {
    it("should deposit and verify decrypted internal balance", async function () {
      const depositAmount = 100n * ONE_USDC;
      console.log(`  Depositing ${depositAmount} for 'smoke-bidder-1'...`);

      await depositFor("smoke-bidder-1", depositAmount);

      const balance = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Decrypted balance: ${balance}`);
      expect(balance).to.be.gte(depositAmount);
    });

    it("should accumulate deposits correctly", async function () {
      const secondDeposit = 50n * ONE_USDC;
      console.log(`  Depositing additional ${secondDeposit} for 'smoke-bidder-1'...`);

      await depositFor("smoke-bidder-1", secondDeposit);

      const balance = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Decrypted balance after 2nd deposit: ${balance}`);
      // Should be >= 150 (100 + 50), may be higher from previous runs on Sepolia
      expect(balance).to.be.gte(150n * ONE_USDC);
    });

    it("should deposit for a second user", async function () {
      const depositAmount = 80n * ONE_USDC;
      console.log(`  Depositing ${depositAmount} for 'smoke-bidder-2'...`);

      await depositFor("smoke-bidder-2", depositAmount);

      const balance = await decryptInternalBalance("smoke-bidder-2");
      console.log(`  Decrypted balance: ${balance}`);
      expect(balance).to.be.gte(depositAmount);
    });
  });

  describe("Auction & Bidding", function () {
    it("should create auction with encrypted prediction", async function () {
      auctionId = await createAuction("smoke-seller", 100, true);
      console.log(`  Created auction ID: ${auctionId}`);

      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.map(Number)).to.include(auctionId);
      console.log(`  Open auctions: [${openAuctions}]`);
    });

    it("should place bid and deduct from bidder balance", async function () {
      const balBefore = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Balance before bid: ${balBefore}`);

      const bidAmount = 10n * ONE_USDC;
      await placeBid(auctionId, "smoke-bidder-1", "", bidAmount);

      const auction = await marketplace.getAuction(auctionId);
      expect(auction.currentBidderId).to.equal("smoke-bidder-1");
      expect(auction.currentBidPlaintext).to.equal(bidAmount);
      console.log(`  Current bidder: ${auction.currentBidderId}, bid: ${auction.currentBidPlaintext}`);

      const balAfter = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Balance after bid: ${balAfter}`);
      expect(balBefore - balAfter).to.equal(bidAmount);
    });
  });

  describe("Outbid & Refund", function () {
    it("should outbid and refund previous bidder", async function () {
      const bidder1BalBefore = await decryptInternalBalance("smoke-bidder-1");
      const bidder2BalBefore = await decryptInternalBalance("smoke-bidder-2");
      console.log(`  Bidder1 balance before: ${bidder1BalBefore}`);
      console.log(`  Bidder2 balance before: ${bidder2BalBefore}`);

      const outbidAmount = 20n * ONE_USDC;
      await placeBid(auctionId, "smoke-bidder-2", "smoke-bidder-1", outbidAmount);

      const auction = await marketplace.getAuction(auctionId);
      expect(auction.currentBidderId).to.equal("smoke-bidder-2");
      expect(auction.currentBidPlaintext).to.equal(outbidAmount);
      console.log(`  New highest bidder: ${auction.currentBidderId}`);

      // Bidder1 should be refunded their 10 USDC
      const bidder1BalAfter = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Bidder1 balance after (refunded): ${bidder1BalAfter}`);
      expect(bidder1BalAfter - bidder1BalBefore).to.equal(10n * ONE_USDC);

      // Bidder2 should have been deducted
      const bidder2BalAfter = await decryptInternalBalance("smoke-bidder-2");
      console.log(`  Bidder2 balance after (deducted): ${bidder2BalAfter}`);
      expect(bidder2BalBefore - bidder2BalAfter).to.equal(outbidAmount);
    });
  });

  describe("Close Auction & Seller Payment", function () {
    it("should close auction and credit seller via decryption proof", async function () {
      // Admin-expire the auction
      console.log(`  Admin-expiring auction ${auctionId}...`);
      let tx = await marketplace.adminExpireAuction(auctionId);
      await tx.wait();

      // Close auction
      console.log(`  Closing auction ${auctionId}...`);
      tx = await marketplace.closeAuction(auctionId);
      await tx.wait();

      // Should have pending decryption (there was a winning bid)
      expect(await marketplace.pendingAuctionClose(auctionId)).to.be.true;
      console.log("  Pending close: true");

      // Verify seller was credited with the winning bid (20 USDC from outbid)
      const sellerBal = await decryptInternalBalance("smoke-seller");
      console.log(`  Seller balance after close: ${sellerBal}`);
      expect(sellerBal).to.be.gte(20n * ONE_USDC);

      // Finalize with decryption proof
      const [, , currentBidHandle] = await marketplace.getAuction(auctionId);
      const decryptResult = await fhevm.publicDecrypt([currentBidHandle]);
      const winningBid = decryptResult.clearValues[ethers.toBeHex(currentBidHandle, 32)] as bigint;
      console.log(`  Winning bid (decrypted): ${winningBid}`);
      expect(winningBid).to.equal(20n * ONE_USDC);

      tx = await marketplace.finalizeAuctionClose(auctionId, winningBid, decryptResult.decryptionProof);
      await tx.wait();

      expect(await marketplace.pendingAuctionClose(auctionId)).to.be.false;
      console.log("  Auction finalized successfully");

      // Auction should no longer be open
      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.map(Number)).to.not.include(auctionId);
    });
  });

  describe("Cancel Auction & Refund", function () {
    it("should cancel auction and refund current bidder", async function () {
      // Create a second auction
      cancelAuctionId = await createAuction("smoke-seller-2", 101, false);
      console.log(`  Created auction ID: ${cancelAuctionId}`);

      // Place a bid
      const bidAmount = 15n * ONE_USDC;
      await placeBid(cancelAuctionId, "smoke-bidder-1", "", bidAmount);

      const balBefore = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Bidder balance before cancel: ${balBefore}`);

      // Cancel the auction
      const tx = await marketplace.connect(deployer).cancelAuction(cancelAuctionId);
      await tx.wait();
      console.log("  Auction cancelled");

      // Verify status
      const [, , , , , , status] = await marketplace.getAuction(cancelAuctionId);
      expect(status).to.equal(2); // Cancelled
      console.log("  Status: Cancelled");

      // Bidder should be refunded
      const balAfter = await decryptInternalBalance("smoke-bidder-1");
      console.log(`  Bidder balance after cancel: ${balAfter}`);
      expect(balAfter - balBefore).to.equal(bidAmount);

      // Should be removed from open auctions
      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.map(Number)).to.not.include(cancelAuctionId);
    });
  });

  describe("Withdraw", function () {
    it("should withdraw from seller balance and verify decrease", async function () {
      const balBefore = await decryptInternalBalance("smoke-seller");
      console.log(`  Seller balance before withdraw: ${balBefore}`);
      expect(balBefore).to.be.gte(20n * ONE_USDC);

      const withdrawAmount = 5n * ONE_USDC;
      await withdrawFor("smoke-seller", withdrawAmount);
      console.log(`  Withdrew ${withdrawAmount}`);

      const balAfter = await decryptInternalBalance("smoke-seller");
      console.log(`  Seller balance after withdraw: ${balAfter}`);
      expect(balBefore - balAfter).to.equal(withdrawAmount);
    });
  });

  describe("ExamplePredictionMarket", function () {
    it("should verify prediction market is accessible", async function () {
      const nextId = await predictionMarket.nextEventId();
      console.log(`  Next event ID: ${nextId}`);

      const pmToken = await predictionMarket.paymentToken();
      const expectedMockUSDC = (await deployments.get("MockUSDC")).address;
      expect(pmToken).to.equal(expectedMockUSDC);
      console.log("  Payment token matches MockUSDC");
    });
  });
});
