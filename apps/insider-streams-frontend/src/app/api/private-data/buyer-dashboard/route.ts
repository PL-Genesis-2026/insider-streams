import { NextResponse } from "next/server";
import { verifyPrivateDataRequest } from "@/lib/signed-request";
import { getBuyerDashboardData } from "@/lib/buyer-dashboard/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifyPrivateDataRequest(body);
  if (!verified.ok) return verified.response;

  try {
    const data = await getBuyerDashboardData(verified.payload.userAddress);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[private-data/buyer-dashboard] error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
