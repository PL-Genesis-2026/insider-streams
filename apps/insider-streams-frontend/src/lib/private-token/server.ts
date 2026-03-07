import "server-only";

import { PRIVATE_TOKEN_API_BASE_URL } from "./domain";

type ProxyPrivateTokenResult = {
  body: string;
  contentType: string;
  status: number;
};

export async function proxyPrivateTokenRequest(
  endpoint: string,
  body: string,
): Promise<ProxyPrivateTokenResult> {
  const response = await fetch(`${PRIVATE_TOKEN_API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  });

  return {
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "application/json",
    status: response.status,
  };
}

