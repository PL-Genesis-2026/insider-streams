const DAEMON_URL = process.env.DAEMON_API_URL || "http://localhost:3001";

export async function proxyToDaemon(
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${DAEMON_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
