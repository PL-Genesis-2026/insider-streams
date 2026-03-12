"use client";

/**
 * Hook to read and decrypt the user's FHEConfidentialUSDC wallet balance.
 *
 * Flow:
 * 1. Call confidentialBalanceOf(address) via wagmi → returns encrypted euint64 handle
 * 2. Generate ephemeral keypair
 * 3. Create EIP-712 message, sign with user's wallet
 * 4. Call userDecrypt via Zama relayer → returns plaintext balance
 *
 * The user must have ACL permission on the ciphertext handle (ERC-7984's _update
 * calls FHE.allow(balance, holder) automatically).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { CONFIDENTIAL_USDC_ADDRESS } from "@private-streams/common";
import { zeroHash } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useFhevm } from "./use-fhevm";
import { useWagmiEthers } from "./use-wagmi-ethers";

// Minimal ABI for the one function we need — avoids importing the full ABI
const confidentialBalanceOfAbi = [
  {
    type: "function",
    name: "confidentialBalanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "euint64" }],
    stateMutability: "view",
  },
] as const;

type DecryptState = "idle" | "decrypting" | "done" | "error";

export function useConfidentialBalance() {
  const { address } = useAccount();
  const { instance, status: fhevmStatus } = useFhevm();
  const { ethersSigner } = useWagmiEthers();

  const [decryptState, setDecryptState] = useState<DecryptState>("idle");
  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDecryptingRef = useRef(false);

  // Step 1: Read the encrypted balance handle from the contract
  const balanceQuery = useReadContract({
    address: CONFIDENTIAL_USDC_ADDRESS as `0x${string}`,
    abi: confidentialBalanceOfAbi,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchOnWindowFocus: false,
    },
  });

  const balanceHandle = useMemo(() => {
    const raw = balanceQuery.data as string | undefined;
    if (!raw || raw === zeroHash) return null;
    return raw;
  }, [balanceQuery.data]);

  const canDecrypt =
    !!instance &&
    !!ethersSigner &&
    !!balanceHandle &&
    !!address &&
    fhevmStatus === "ready" &&
    !isDecryptingRef.current;

  // Step 2-4: Generate keypair, sign EIP-712, call userDecrypt
  const decrypt = useCallback(async () => {
    if (isDecryptingRef.current) return;
    if (!instance || !ethersSigner || !balanceHandle || !address) return;

    isDecryptingRef.current = true;
    setDecryptState("decrypting");
    setError(null);

    try {
      const contractAddress = CONFIDENTIAL_USDC_ADDRESS;

      // Generate ephemeral keypair for re-encryption
      const keypair = (instance as any).generateKeypair() as {
        publicKey: string;
        privateKey: string;
      };

      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 1;

      // Create EIP-712 typed data for the user to sign
      const eip712 = (instance as any).createEIP712(
        keypair.publicKey,
        [contractAddress],
        startTimestamp,
        durationDays,
      );

      // Sign with the user's wallet (via ethers signer bridged from wagmi)
      const signature = await ethersSigner.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification:
            eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      // Call the relayer to decrypt
      const result = await (instance as any).userDecrypt(
        [{ handle: balanceHandle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        [contractAddress],
        address,
        startTimestamp,
        durationDays,
      );

      const value = result[balanceHandle];
      const asBigInt =
        typeof value === "bigint"
          ? value
          : typeof value === "number"
            ? BigInt(value)
            : typeof value === "string"
              ? BigInt(value)
              : null;

      setDecryptedBalance(asBigInt);
      setDecryptState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useConfidentialBalance] Decrypt failed:", msg);
      setError(msg);
      setDecryptState("error");
    } finally {
      isDecryptingRef.current = false;
    }
  }, [instance, ethersSigner, balanceHandle, address]);

  const refresh = useCallback(async () => {
    setDecryptedBalance(null);
    setDecryptState("idle");
    setError(null);
    await balanceQuery.refetch();
  }, [balanceQuery]);

  return {
    /** The raw encrypted handle (null if zero/unset) */
    handle: balanceHandle,
    /** Whether the handle is loading from chain */
    isLoadingHandle: balanceQuery.isFetching,
    /** Whether the SDK is ready and a non-zero handle exists */
    canDecrypt,
    /** Trigger decryption (prompts wallet signature) */
    decrypt,
    /** Current decrypt state */
    decryptState,
    /** Plaintext balance (null until decrypted) */
    balance: decryptedBalance,
    /** Error message if decryption failed */
    error,
    /** Re-read the handle from chain and clear cached decryption */
    refresh,
    /** Whether the FhevmInstance is still loading */
    isFhevmLoading: fhevmStatus === "loading",
  } as const;
}
