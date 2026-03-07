import type {
  PrivateSellerRecord,
  PrivateBidRecord,
  PrivateSecretRecord,
} from "./types";

export async function fetchMySeller(
  signature: string,
  timestamp: number,
): Promise<PrivateSellerRecord | null> {
  const res = await fetch("/api/private-data/seller", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, timestamp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Seller fetch failed (${res.status})`,
    );
  }

  const json = (await res.json()) as { data: PrivateSellerRecord | null };
  return json.data;
}

export async function fetchMyBids(
  signature: string,
  timestamp: number,
  auctionIds: string[],
): Promise<Record<string, PrivateBidRecord>> {
  const res = await fetch("/api/private-data/bids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, timestamp, auctionIds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Bids fetch failed (${res.status})`,
    );
  }

  const json = (await res.json()) as { data: Record<string, PrivateBidRecord> };
  return json.data;
}

export async function fetchMySecrets(
  signature: string,
  timestamp: number,
  auctionIds: string[],
): Promise<Record<string, PrivateSecretRecord>> {
  const res = await fetch("/api/private-data/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, timestamp, auctionIds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Secrets fetch failed (${res.status})`,
    );
  }

  const json = (await res.json()) as {
    data: Record<string, PrivateSecretRecord>;
  };
  return json.data;
}
