import type { BuyerDashboardResponse } from "./types";

export async function fetchBuyerDashboard(
  signature: string,
  timestamp: number,
): Promise<BuyerDashboardResponse> {
  const res = await fetch("/api/private-data/buyer-dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, timestamp }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ??
        `Buyer dashboard fetch failed (${res.status})`,
    );
  }

  return (await res.json()) as BuyerDashboardResponse;
}
