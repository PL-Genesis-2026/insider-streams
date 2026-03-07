import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getSecretsByAuctionIds } from "@/lib/supabase/secrets";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json(
      { error: "Missing ids query parameter" },
      { status: 400 },
    );
  }

  const auctionIds = ids.split(",").filter(Boolean);

  if (auctionIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  if (auctionIds.length > 100) {
    return NextResponse.json(
      { error: "Too many IDs (max 100)" },
      { status: 400 },
    );
  }

  try {
    const client = getSupabaseServiceClient();
    const secrets = await getSecretsByAuctionIds(auctionIds, client);
    return NextResponse.json({ data: secrets });
  } catch (error) {
    console.error("Failed to fetch secrets:", error);
    return NextResponse.json(
      { error: "Failed to fetch secrets" },
      { status: 500 },
    );
  }
}
