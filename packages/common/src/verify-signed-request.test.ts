/**
 * Unit tests for verifySignedRequest — proving that EIP-712 signatures
 * are NOT compatible with the personal_sign (EIP-191) verification used
 * by the daemon, and that personal_sign works correctly.
 *
 * Bug context: The create-auction frontend form used signTypedData (EIP-712)
 * while verifySignedRequest uses recoverMessageAddress (EIP-191). An EIP-712
 * signature fed to recoverMessageAddress recovers a valid but wrong address,
 * silently creating auctions under phantom seller identities.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import stringify from "fast-json-stable-stringify";
import { verifySignedRequest } from "./verify-signed-request.js";

const TEST_PK = "0xe38e78bfd13899c54453206eeb5e173fa917b5e5f42000bf0523e5763424f5a8" as const;
const account = privateKeyToAccount(TEST_PK);

describe("verifySignedRequest", () => {
  it("recovers the correct address from a personal_sign signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = { eventId: "42", eventTitle: "Test Event", timestamp };
    const message = stringify(payload);
    const signature = await account.signMessage({ message });

    const result = await verifySignedRequest({ ...payload, signature });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.payload.userAddress,
        account.address.toLowerCase(),
        "personal_sign should recover the signer's actual address",
      );
    }
  });

  it("recovers a WRONG address from an EIP-712 signTypedData signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    // This is how the create-auction form currently signs — EIP-712
    const signature = await account.signTypedData({
      domain: {
        name: "InsiderStreams",
        version: "1",
        chainId: 11155111,
      },
      types: {
        CreateAuction: [
          { name: "eventId", type: "string" },
          { name: "privateLeg", type: "string" },
          { name: "duration", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
      },
      primaryType: "CreateAuction",
      message: {
        eventId: "42",
        privateLeg: "yes",
        duration: "24h",
        timestamp: BigInt(timestamp),
      },
    });

    // The daemon receives a body like this (after frontend proxy transforms it)
    const daemonBody = {
      eventId: "42",
      eventTitle: "Test Event",
      endTime: "1999999999",
      prediction: "true",
      secretPayload: "",
      timestamp,
      signature,
    };

    const result = await verifySignedRequest(daemonBody);

    // verifySignedRequest does NOT fail — it recovers a valid-looking address
    assert.equal(result.ok, true, "EIP-712 sig does not cause an error");

    if (result.ok) {
      // But the recovered address is NOT the signer's address
      assert.notEqual(
        result.payload.userAddress,
        account.address.toLowerCase(),
        "EIP-712 signature should recover a DIFFERENT (wrong) address when " +
        "verified with recoverMessageAddress (EIP-191). This is the bug.",
      );
    }
  });
});
