import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FHEConfidentialUSDC } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const ONE_USDC = 1_000_000n; // 6 decimals
const HUNDRED_USDC = 100n * ONE_USDC;

async function deployFixture() {
  const [deployer, alice, bob] = await ethers.getSigners();

  const factory = await ethers.getContractFactory("FHEConfidentialUSDC");
  const token = (await factory.deploy(deployer.address)) as FHEConfidentialUSDC;
  const tokenAddress = await token.getAddress();

  return { token, tokenAddress, signers: { deployer, alice, bob } };
}

describe("FHEConfidentialUSDC", function () {
  let token: FHEConfidentialUSDC;
  let tokenAddress: string;
  let signers: Signers;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite requires mock FHE environment");
      this.skip();
    }
  });

  beforeEach(async function () {
    ({ token, tokenAddress, signers } = await deployFixture());
  });

  describe("Deployment", function () {
    it("should have correct name, symbol, and decimals", async function () {
      expect(await token.name()).to.equal("Confidential USDC");
      expect(await token.symbol()).to.equal("cUSDC");
      expect(await token.decimals()).to.equal(6);
    });

    it("should set deployer as owner", async function () {
      expect(await token.owner()).to.equal(signers.deployer.address);
    });
  });

  describe("Minting (plaintext convenience)", function () {
    it("should mint tokens to an address via mintPlaintext", async function () {
      await token.mintPlaintext(signers.alice.address, HUNDRED_USDC);

      const encBalance = await token.confidentialBalanceOf(signers.alice.address);
      // Decrypt alice's balance
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encBalance,
        tokenAddress,
        signers.alice,
      );
      expect(clearBalance).to.equal(HUNDRED_USDC);
    });

    it("should revert if non-owner tries to mint", async function () {
      let reverted = false;
      try {
        await token.connect(signers.alice).mintPlaintext(signers.alice.address, HUNDRED_USDC);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });

  describe("Minting (encrypted)", function () {
    it("should mint tokens via encrypted input", async function () {
      const amount = 50n * ONE_USDC;

      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.deployer.address)
        .add64(amount)
        .encrypt();

      await token.mint(
        signers.alice.address,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      const encBalance = await token.confidentialBalanceOf(signers.alice.address);
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        encBalance,
        tokenAddress,
        signers.alice,
      );
      expect(clearBalance).to.equal(amount);
    });
  });

  describe("Encrypted Transfers", function () {
    beforeEach(async function () {
      // Mint 100 USDC to alice
      await token.mintPlaintext(signers.alice.address, HUNDRED_USDC);
    });

    it("should transfer encrypted amount from alice to bob", async function () {
      const transferAmount = 30n * ONE_USDC;

      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.alice.address)
        .add64(transferAmount)
        .encrypt();

      await token
        .connect(signers.alice)
        ["confidentialTransfer(address,bytes32,bytes)"](
          signers.bob.address,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

      // Verify alice's balance decreased
      const aliceEnc = await token.confidentialBalanceOf(signers.alice.address);
      const aliceBal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceEnc,
        tokenAddress,
        signers.alice,
      );
      expect(aliceBal).to.equal(HUNDRED_USDC - transferAmount);

      // Verify bob's balance increased
      const bobEnc = await token.confidentialBalanceOf(signers.bob.address);
      const bobBal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        bobEnc,
        tokenAddress,
        signers.bob,
      );
      expect(bobBal).to.equal(transferAmount);
    });

    it("should handle transfer exceeding balance (silent no-op via FHE)", async function () {
      const overAmount = 200n * ONE_USDC; // more than alice has

      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.alice.address)
        .add64(overAmount)
        .encrypt();

      // This should NOT revert — FHE transfers silently transfer 0 on insufficient balance
      await token
        .connect(signers.alice)
        ["confidentialTransfer(address,bytes32,bytes)"](
          signers.bob.address,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

      // Alice's balance unchanged
      const aliceEnc = await token.confidentialBalanceOf(signers.alice.address);
      const aliceBal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceEnc,
        tokenAddress,
        signers.alice,
      );
      expect(aliceBal).to.equal(HUNDRED_USDC);

      // Bob gets 0
      const bobEnc = await token.confidentialBalanceOf(signers.bob.address);
      const bobBal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        bobEnc,
        tokenAddress,
        signers.bob,
      );
      expect(bobBal).to.equal(0n);
    });
  });

  describe("Operator (transferFrom) Pattern", function () {
    beforeEach(async function () {
      await token.mintPlaintext(signers.alice.address, HUNDRED_USDC);
    });

    it("should allow operator to transferFrom", async function () {
      // Alice sets bob as operator (until far future)
      const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      await token.connect(signers.alice).setOperator(signers.bob.address, farFuture);

      expect(await token.isOperator(signers.alice.address, signers.bob.address)).to.be.true;

      // Bob transfers from alice to deployer
      const transferAmount = 25n * ONE_USDC;
      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.bob.address)
        .add64(transferAmount)
        .encrypt();

      await token
        .connect(signers.bob)
        ["confidentialTransferFrom(address,address,bytes32,bytes)"](
          signers.alice.address,
          signers.deployer.address,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

      // Alice's balance should be 75 USDC
      const aliceEnc = await token.confidentialBalanceOf(signers.alice.address);
      const aliceBal = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        aliceEnc,
        tokenAddress,
        signers.alice,
      );
      expect(aliceBal).to.equal(75n * ONE_USDC);
    });

    it("should reject transferFrom from non-operator", async function () {
      const transferAmount = 10n * ONE_USDC;
      const encryptedInput = await fhevm
        .createEncryptedInput(tokenAddress, signers.bob.address)
        .add64(transferAmount)
        .encrypt();

      let reverted = false;
      try {
        await token
          .connect(signers.bob)
          ["confidentialTransferFrom(address,address,bytes32,bytes)"](
            signers.alice.address,
            signers.deployer.address,
            encryptedInput.handles[0],
            encryptedInput.inputProof,
          );
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });
  });
});
