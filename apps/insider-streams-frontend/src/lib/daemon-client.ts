const DAEMON_URL = process.env.DAEMON_API_URL || "http://localhost:3001";

export async function proxyToDaemon(
  path: string,
  body: unknown,
): Promise<Response> {
  const url = `${DAEMON_URL}${path}`;
  console.log(`[daemon-client] POST ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`[daemon-client] POST ${url} → ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[daemon-client] POST ${url} failed:`, err);
    throw err;
  }
}

export async function proxyFormDataToDaemon(
  path: string,
  formData: FormData,
): Promise<Response> {
  const url = `${DAEMON_URL}${path}`;
  console.log(`[daemon-client] POST ${url} (multipart)`);
  try {
    // Let fetch set the Content-Type with boundary automatically
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    console.log(`[daemon-client] POST ${url} → ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[daemon-client] POST ${url} failed:`, err);
    throw err;
  }
}
