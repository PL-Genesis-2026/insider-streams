/**
 * Best-effort ntfy push notifications for event watcher activity.
 * Failures are silently ignored — notifications are purely informational.
 *
 * NTFY_USER identifies which instance sent the notification (e.g. ad0ll, vps).
 * NTFY_HOST is the ntfy server base URL.
 */

const NTFY_HOST = process.env.NTFY_HOST ?? "http://localhost:8090";
const NTFY_TOPIC = "event-watcher";
const NTFY_USER = process.env.NTFY_USER ?? "UNKNOWN";

export async function notify(
  title: string,
  message: string,
  tags?: string[],
  clickUrl?: string,
): Promise<void> {
  try {
    await fetch(`${NTFY_HOST}/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        ...(tags?.length ? { Tags: tags.join(",") } : {}),
        ...(clickUrl ? { Click: clickUrl } : {}),
      },
      body: `[${NTFY_USER}] ${message}`,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[ntfy] Failed to send notification: ${err}`);
  }
}
