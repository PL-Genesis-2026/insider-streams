import { NextResponse } from "next/server";
import { verifyPrivateDataRequest } from "@/lib/signed-request";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = await verifyPrivateDataRequest(body);
  if (!verified.ok) return verified.response;

  const { userAddress } = verified.payload;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("id, address")
    .eq("address", userAddress)
    .maybeSingle();

  if (error) {
    console.error("[private-data/seller] Supabase error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data });
}
