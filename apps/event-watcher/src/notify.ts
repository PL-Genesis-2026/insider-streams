/**
 * Best-effort ntfy push notifications for event watcher activity.
 * Failures are silently ignored — notifications are purely informational.
 */

const NTFY_URL = process.env.NTFY_URL ?? "http://localhost:8090";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "event-watcher";

export async function notify(
  title: string,
  message: string,
  tags?: string[],
): Promise<void> {
  try {
    await fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        ...(tags?.length ? { Tags: tags.join(",") } : {}),
      },
      body: message,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Intentionally ignored — notifications are best-effort
  }
}
