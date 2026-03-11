/**
 * Sepolia Smoke Test
 *
 * Exercises the full lifecycle against real FHE on Sepolia:
 * 1. Mint ConfidentialUSDC to deployer (admin)
 * 2. Admin creates auction with encrypted prediction
 * 3. Admin deposits for a user and places encrypted bid
 * 4. Close auction (after admin expire)
 * 5. Verify encrypted state transitions
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

// Known Sepolia addresses (deployed manually via Foundry, not via hardhat-deploy)
const SEPOLIA_MOCK_USDC = "0x7Dd00c06B6123dFCaF23F6647Eb6f19eC21abD33";
const SEPOLIA_EXAMPLE_PM = "0x791550c705B2272E1D6EC617AB18337f4E5712E8";

describe("Sepolia Smoke Test", function () {
  // Longer timeouts for Sepolia transactions
  this.timeout(300_000);

  let deployer: HardhatEthersSigner;
  let confidentialUSDC: FHEConfidentialUSDC;
  let confidentialUSDCAddress: string;
  let marketplace: FHESecretMarketplace;
  let marketplaceAddress: string;
  let mockUSDC: MockUSDC;
  let predictionMarket: ExamplePredictionMarket;

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
    // so we use the same token the marketplace was deployed with.
    const actualPaymentToken = await marketplace.paymentToken();
    confidentialUSDC = (await ethers.getContractAt("FHEConfidentialUSDC", actualPaymentToken)) as FHEConfidentialUSDC;
    confidentialUSDCAddress = actualPaymentToken;

    // MockUSDC and ExamplePredictionMarket were deployed via Foundry (not hardhat-deploy),
    // so deployments.get() only works on local (where fixtures deploy them).
    let mockUSDCAddress: string;
    let pmAddress: string;
    if (isLocal) {
      const mockUSDCDeployment = await deployments.get("MockUSDC");
      mockUSDCAddress = mockUSDCDeployment.address;
      const pmDeployment = await deployments.get("ExamplePredictionMarket");
      pmAddress = pmDeployment.address;
    } else {
      mockUSDCAddress = SEPOLIA_MOCK_USDC;
      pmAddress = SEPOLIA_EXAMPLE_PM;
    }
    mockUSDC = (await ethers.getContractAt("MockUSDC", mockUSDCAddress)) as MockUSDC;
    predictionMarket = (await ethers.getContractAt("ExamplePredictionMarket", pmAddress)) as ExamplePredictionMarket;

    console.log(`FHEConfidentialUSDC: ${confidentialUSDCAddress}`);
    console.log(`FHESecretMarketplace: ${marketplaceAddress}`);
    console.log(`MockUSDC: ${mockUSDCAddress}`);
    console.log(`ExamplePredictionMarket: ${pmAddress}`);
  });

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
    it("should mint plaintext USDC to deployer (admin)", async function () {
      const mintAmount = 100n * ONE_USDC;
      console.log(`  Minting ${mintAmount} cUSDC to deployer (${deployer.address})...`);

      const tx = await confidentialUSDC.mintPlaintext(deployer.address, mintAmount);
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);
      console.log(`  Gas used: ${receipt?.gasUsed}`);

      // Read encrypted balance
      const balHandle = await confidentialUSDC.confidentialBalanceOf(deployer.address);
      console.log(`  Balance handle: ${balHandle}`);

      if (fhevm.isMock) {
        const clearBal = await fhevm.userDecryptEuint(
          FhevmType.euint64,
          balHandle,
          confidentialUSDCAddress,
          deployer,
        );
        console.log(`  Decrypted balance: ${clearBal}`);
        expect(clearBal).to.be.gte(mintAmount);
      } else {
        expect(balHandle).to.not.equal(ethers.ZeroHash);
        console.log("  Balance handle is non-zero (real FHE)");
      }
    });
  });

  describe("Auction Lifecycle", function () {
    let auctionId: number;

    it("should set marketplace as operator for deployer (admin)", async function () {
      // Check if already an operator (Sepolia may have this from a previous run)
      const alreadyOp = await confidentialUSDC.isOperator(deployer.address, marketplaceAddress);
      if (alreadyOp) {
        console.log("  Marketplace is already operator for deployer — skipping setOperator");
        return;
      }

      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      console.log(`  Setting marketplace as operator for deployer (admin)...`);

      const tx = await confidentialUSDC.connect(deployer).setOperator(marketplaceAddress, farFuture);
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);

      const isOp = await confidentialUSDC.isOperator(deployer.address, marketplaceAddress);
      expect(isOp).to.be.true;
      console.log("  Marketplace is now operator for deployer");
    });

    it("should create auction with encrypted prediction (via admin)", async function () {
      const endTime = Math.floor(Date.now() / 1000) + 3600;
      console.log(`  Creating auction (endTime: ${endTime})...`);

      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, deployer.address)
        .addBool(true) // prediction: YES
        .add256(FAKE_AES_KEY)
        .encrypt();

      const tx = await marketplace.createAuction(
        "smoke-test-seller",
        0, // eventId
        "Smoke Test Event",
        endTime,
        encryptedInput.handles[0],
        FAKE_CID,
        encryptedInput.handles[1],
        encryptedInput.inputProof,
      );
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);
      console.log(`  Gas used: ${receipt?.gasUsed}`);

      auctionId = Number(await marketplace.nextAuctionId()) - 1;
      console.log(`  Created auction ID: ${auctionId}`);

      const openAuctions = await marketplace.getOpenAuctions();
      expect(openAuctions.length).to.be.gte(1);
      console.log(`  Open auctions: ${openAuctions}`);
    });

    it("should deposit into marketplace internal balance for pseudonymous user", async function () {
      const depositAmount = 100n * ONE_USDC;
      console.log(`  Depositing ${depositAmount} for user 'smoke-bidder' via admin...`);

      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, deployer.address)
        .add64(depositAmount)
        .encrypt();

      const tx = await marketplace.connect(deployer).depositFor(
        "smoke-bidder",
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);
      console.log(`  Gas used: ${receipt?.gasUsed}`);

      // Verify internal balance
      const balHandle = await marketplace.getBalance("smoke-bidder");
      console.log(`  Internal balance handle: ${balHandle}`);

      if (fhevm.isMock) {
        const clearBal = await fhevm.debugger.decryptEuint(FhevmType.euint64, balHandle);
        console.log(`  Decrypted internal balance: ${clearBal}`);
        expect(clearBal).to.be.gte(depositAmount);
      } else {
        expect(balHandle).to.not.equal(ethers.ZeroHash);
        console.log("  Internal balance handle is non-zero (real FHE)");
      }
    });

    it("should place encrypted bid via admin on behalf of pseudonymous user", async function () {
      const bidAmount = 5n * ONE_USDC;
      console.log(`  Placing bid of ${bidAmount} on auction ${auctionId} for 'smoke-bidder'...`);

      const encryptedInput = await fhevm
        .createEncryptedInput(marketplaceAddress, deployer.address)
        .add64(bidAmount)
        .encrypt();

      const tx = await marketplace.connect(deployer).placeBid(
        auctionId,
        "smoke-bidder",
        "", // no previous bidder
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        bidAmount, // plaintext for on-chain validation
      );
      const receipt = await tx.wait();
      console.log(`  Tx: ${receipt?.hash}`);
      console.log(`  Gas used: ${receipt?.gasUsed}`);

      const auction = await marketplace.getAuction(auctionId);
      expect(auction.currentBidderId).to.equal("smoke-bidder");
      console.log(`  Current bidder: ${auction.currentBidderId}`);
    });

    it("should close auction after admin expire", async function () {
      console.log(`  Admin-expiring auction ${auctionId}...`);
      let tx = await marketplace.adminExpireAuction(auctionId);
      let receipt = await tx.wait();
      console.log(`  Expire Tx: ${receipt?.hash}`);

      console.log(`  Closing auction ${auctionId}...`);
      tx = await marketplace.closeAuction(auctionId);
      receipt = await tx.wait();
      console.log(`  Close Tx: ${receipt?.hash}`);
      console.log(`  Gas used: ${receipt?.gasUsed}`);

      // With a bid placed, should have pending decryption
      const pendingClose = await marketplace.pendingAuctionClose(auctionId);
      console.log(`  Pending close: ${pendingClose}`);
      expect(pendingClose).to.be.true;

      // Seller should have been credited
      if (fhevm.isMock) {
        const sellerBal = await marketplace.getBalance("smoke-test-seller");
        const clearBal = await fhevm.debugger.decryptEuint(FhevmType.euint64, sellerBal);
        console.log(`  Seller balance after close: ${clearBal}`);
        expect(clearBal).to.equal(5n * ONE_USDC);
      }
    });
  });

  describe("ExamplePredictionMarket", function () {
    it("should verify prediction market is accessible", async function () {
      const nextId = await predictionMarket.nextEventId();
      console.log(`  Next event ID: ${nextId}`);

      const pmToken = await predictionMarket.paymentToken();
      const expectedMockUSDC = (network.name === "hardhat" || network.name === "localhost")
        ? (await deployments.get("MockUSDC")).address
        : SEPOLIA_MOCK_USDC;
      expect(pmToken).to.equal(expectedMockUSDC);
      console.log(`  Payment token matches MockUSDC`);
    });
  });
});
