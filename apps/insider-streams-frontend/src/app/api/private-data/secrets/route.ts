import { NextResponse } from "next/server";
import { proxyToDaemon } from "@/lib/daemon-client";
import type { PrivateSecretState, PrivateFileAttachment } from "@/lib/private-data/types";

export const maxDuration = 90;

type DaemonSecret = {
  auctionId: number;
  secretDataCid: string;
  secretDataKey: string | null;
  secretData: string | null;
  eventData: string | null;
  hasAccess: boolean;
  file: {
    encryptionKey: string | null;
    encryptionAlgorithm: string | null;
    fileName: string;
    encryptedFileName: string | null;
    contentType: string | null;
    fileMd5: string | null;
    fileSizeBytes: string | null;
    encryptedFileSizeBytes: string | null;
    pieceCid: string | null;
    retrievalUrl: string;
    copies: PrivateFileAttachment["copies"];
  } | null;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { auctionIds: requestedIds, signature, timestamp } = body as {
    auctionIds?: string[];
    signature?: string;
    timestamp?: number;
  };

  const res = await proxyToDaemon("/secrets", { signature, timestamp, auctionIds: requestedIds });
  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(json, { status: res.status });
  }

  const secrets: DaemonSecret[] = json.secrets ?? [];
  const data: Record<string, PrivateSecretState> = {};

  for (const s of secrets) {
    const key = String(s.auctionId);
    if (s.hasAccess) {
      let eventData = null;
      if (s.eventData) {
        try {
          eventData = JSON.parse(s.eventData);
        } catch {
          // malformed event_data — ignore
        }
      }

      let file: PrivateFileAttachment | null = null;
      if (s.file && s.file.retrievalUrl && s.file.fileName && s.file.encryptionKey) {
        file = {
          encryptionKey: s.file.encryptionKey,
          encryptionAlgorithm: s.file.encryptionAlgorithm,
          fileName: s.file.fileName,
          encryptedFileName: s.file.encryptedFileName,
          contentType: s.file.contentType,
          fileMd5: s.file.fileMd5,
          fileSizeBytes: s.file.fileSizeBytes,
          encryptedFileSizeBytes: s.file.encryptedFileSizeBytes,
          pieceCid: s.file.pieceCid,
          retrievalUrl: s.file.retrievalUrl,
          copies: s.file.copies ?? [],
        };
      }

      data[key] = {
        kind: "accessible",
        secret_data: s.secretData ?? s.secretDataKey ?? "",
        event_data: eventData,
        file,
      };
    } else {
      data[key] = { kind: "forbidden" };
    }
  }

  // Any requested auction IDs not returned by daemon → not_found
  if (Array.isArray(requestedIds)) {
    for (const id of requestedIds) {
      if (!(String(id) in data)) {
        data[String(id)] = { kind: "not_found" };
      }
    }
  }

  return NextResponse.json({ data }, { status: 200 });
}
