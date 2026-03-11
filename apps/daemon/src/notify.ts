import { config } from "./config.js";

export async function sendNotification(
  title: string,
  message: string,
  clickUrl?: string,
): Promise<void> {
  if (!config.ntfyEnabled) return;

  try {
    const url = `${config.ntfyHost}/${config.ntfyTopic}`;
    const body = `[${config.ntfyUser}] ${message}`;

    const headers: Record<string, string> = { Title: title };
    if (clickUrl) headers.Click = clickUrl;

    const resp = await fetch(url, {
      method: "POST",
      body,
      headers,
    });

    if (!resp.ok) {
      console.warn(`[ntfy] POST failed (${resp.status}): ${await resp.text()}`);
    } else {
      console.log(`[ntfy] sent: ${title}`);
    }
  } catch (err) {
    console.warn(`[ntfy] failed (non-fatal):`, err instanceof Error ? err.message : err);
  }
}
