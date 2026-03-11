import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { ExamplePredictionMarket, MockUSDC } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  settler: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const INITIAL_LIQUIDITY = 10_000_000n; // 10 USDC (6 decimals)
const ONE_USDC = 1_000_000n;
const DURATION = 3600; // 1 hour

const Outcome = { None: 0, No: 1, Yes: 2, Inconclusive: 3 };
const Status = { Open: 0, SettlementRequested: 1, Settled: 2, NeedsManual: 3 };

async function deployFixture() {
  const [deployer, settler, alice, bob] = await ethers.getSigners();

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
  const usdc = (await MockUSDCFactory.deploy()) as MockUSDC;

  const PMFactory = await ethers.getContractFactory("ExamplePredictionMarket");
  const pm = (await PMFactory.deploy(await usdc.getAddress(), settler.address)) as ExamplePredictionMarket;

  const mintAmount = 1_000_000_000n; // 1000 USDC
  await usdc.mint(deployer.address, mintAmount);
  await usdc.mint(alice.address, mintAmount);
  await usdc.mint(bob.address, mintAmount);

  const pmAddress = await pm.getAddress();
  await usdc.connect(deployer).approve(pmAddress, ethers.MaxUint256);
  await usdc.connect(alice).approve(pmAddress, ethers.MaxUint256);
  await usdc.connect(bob).approve(pmAddress, ethers.MaxUint256);

  return { usdc, pm, pmAddress, signers: { deployer, settler, alice, bob } };
}

describe("ExamplePredictionMarket", function () {
  let usdc: MockUSDC;
  let pm: ExamplePredictionMarket;
  let pmAddress: string;
  let signers: Signers;

  beforeEach(async function () {
    ({ usdc, pm, pmAddress, signers } = await deployFixture());
  });

  describe("Event Creation", function () {
    it("should create an event and deploy share tokens", async function () {
      await pm.newEvent("Will ETH hit $10k?", DURATION);

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.question).to.equal("Will ETH hit $10k?");
      expect(eventData.creator).to.equal(signers.deployer.address);
      expect(eventData.yesReserve).to.equal(INITIAL_LIQUIDITY);
      expect(eventData.noReserve).to.equal(INITIAL_LIQUIDITY);
      expect(eventData.status).to.equal(Status.Open);
      expect(eventData.yesToken).to.not.equal(ethers.ZeroAddress);
      expect(eventData.noToken).to.not.equal(ethers.ZeroAddress);
      expect(await pm.nextEventId()).to.equal(1);
    });

    it("should revert on zero duration", async function () {
      await expect(pm.newEvent("Test", 0)).to.be.revertedWithCustomError(pm, "DurationZero");
    });

    it("should pull INITIAL_LIQUIDITY from creator", async function () {
      const balBefore = await usdc.balanceOf(signers.deployer.address);
      await pm.newEvent("Test", DURATION);
      const balAfter = await usdc.balanceOf(signers.deployer.address);
      expect(balBefore - balAfter).to.equal(INITIAL_LIQUIDITY);
    });
  });

  describe("Buying Shares", function () {
    beforeEach(async function () {
      await pm.newEvent("Will ETH hit $10k?", DURATION);
    });

    it("should buy YES shares and move price", async function () {
      const buyAmount = 5n * ONE_USDC;
      await pm.connect(signers.alice).buyShares(0, Outcome.Yes, buyAmount);

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.noReserve).to.be.gt(INITIAL_LIQUIDITY);
      expect(eventData.yesReserve).to.be.lt(INITIAL_LIQUIDITY);

      const yesToken = await ethers.getContractAt("ExamplePredictionMarketShareToken", eventData.yesToken);
      const aliceYes = await yesToken.balanceOf(signers.alice.address);
      expect(aliceYes).to.be.gt(0);
    });

    it("should buy NO shares and move price", async function () {
      const buyAmount = 5n * ONE_USDC;
      await pm.connect(signers.bob).buyShares(0, Outcome.No, buyAmount);

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.yesReserve).to.be.gt(INITIAL_LIQUIDITY);
      expect(eventData.noReserve).to.be.lt(INITIAL_LIQUIDITY);

      const noToken = await ethers.getContractAt("ExamplePredictionMarketShareToken", eventData.noToken);
      const bobNo = await noToken.balanceOf(signers.bob.address);
      expect(bobNo).to.be.gt(0);
    });

    it("should revert on invalid outcome", async function () {
      await expect(
        pm.connect(signers.alice).buyShares(0, Outcome.None, ONE_USDC)
      ).to.be.revertedWithCustomError(pm, "InvalidOutcome");
    });

    it("should revert on zero amount", async function () {
      await expect(
        pm.connect(signers.alice).buyShares(0, Outcome.Yes, 0)
      ).to.be.revertedWithCustomError(pm, "AmountZero");
    });
  });

  describe("Settlement via Settler", function () {
    beforeEach(async function () {
      await pm.newEvent("Will ETH hit $10k?", DURATION);
      await pm.connect(signers.alice).buyShares(0, Outcome.Yes, 5n * ONE_USDC);
    });

    it("should allow settler to settle after request", async function () {
      await pm.adminCloseEvent(0);
      await pm.requestSettlement(0);
      await pm.connect(signers.settler).settleEvent(0, Outcome.Yes, 9500, "evidence-123");

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.status).to.equal(Status.Settled);
      expect(eventData.outcome).to.equal(Outcome.Yes);
      expect(eventData.confidenceBps).to.equal(9500);
      expect(eventData.evidenceURI).to.equal("evidence-123");
    });

    it("should revert if non-settler tries to settle", async function () {
      await pm.adminCloseEvent(0);
      await pm.requestSettlement(0);

      // The fhevm plugin wraps reverts in HardhatFhevmError, so we catch it generically
      let reverted = false;
      try {
        await pm.connect(signers.alice).settleEvent(0, Outcome.Yes, 9500, "evidence");
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should revert if settlement not requested", async function () {
      let reverted = false;
      try {
        await pm.connect(signers.settler).settleEvent(0, Outcome.Yes, 9500, "evidence");
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should set NeedsManual for inconclusive outcome", async function () {
      await pm.adminCloseEvent(0);
      await pm.requestSettlement(0);
      await pm.connect(signers.settler).settleEvent(0, Outcome.Inconclusive, 3000, "inconclusive");

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.status).to.equal(Status.NeedsManual);
    });
  });

  describe("Share Redemption", function () {
    beforeEach(async function () {
      await pm.newEvent("Will ETH hit $10k?", DURATION);
      await pm.connect(signers.alice).buyShares(0, Outcome.Yes, 5n * ONE_USDC);
      await pm.adminCloseEvent(0);
      await pm.requestSettlement(0);
      await pm.connect(signers.settler).settleEvent(0, Outcome.Yes, 9500, "evidence");
    });

    it("should allow redemption of winning shares", async function () {
      const eventData = await pm.getMarketEvent(0);
      const yesToken = await ethers.getContractAt("ExamplePredictionMarketShareToken", eventData.yesToken);
      const aliceShares = await yesToken.balanceOf(signers.alice.address);

      const usdcBefore = await usdc.balanceOf(signers.alice.address);
      await pm.connect(signers.alice).redeemShares(0, aliceShares);
      const usdcAfter = await usdc.balanceOf(signers.alice.address);

      expect(usdcAfter - usdcBefore).to.equal(aliceShares);
      expect(await yesToken.balanceOf(signers.alice.address)).to.equal(0);
    });

    it("should revert if not settled", async function () {
      await pm.newEvent("Another?", DURATION);
      await expect(
        pm.connect(signers.alice).redeemShares(1, ONE_USDC)
      ).to.be.revertedWithCustomError(pm, "NotSettledYet");
    });
  });

  describe("Force Settle (Owner Only)", function () {
    it("should allow owner to force-settle", async function () {
      await pm.newEvent("Test?", DURATION);
      await pm.forceSettle(0, Outcome.No, 10000, "forced");

      const eventData = await pm.getMarketEvent(0);
      expect(eventData.status).to.equal(Status.Settled);
      expect(eventData.outcome).to.equal(Outcome.No);
    });

    it("should revert if non-owner force-settles", async function () {
      await pm.newEvent("Test?", DURATION);
      let reverted = false;
      try {
        await pm.connect(signers.alice).forceSettle(0, Outcome.Yes, 10000, "forced");
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Settler Management", function () {
    it("should allow owner to update settler", async function () {
      await pm.setSettler(signers.alice.address);
      expect(await pm.settler()).to.equal(signers.alice.address);
    });

    it("should revert if non-owner updates settler", async function () {
      let reverted = false;
      try {
        await pm.connect(signers.alice).setSettler(signers.bob.address);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });
});
