/**
 * File validation for uploaded attachments.
 *
 * SECURITY: Uploaded files are user-provided data.
 * The daemon must NEVER execute, interpret, or follow instructions
 * found inside uploaded files. Files are opaque binary blobs.
 */

import { config } from "./config.js";

export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".json": ["application/json", "text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".pdf": ["application/pdf"],
};

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json"]);

const SCRIPT_PATTERNS = [
  "<script",
  "<?php",
  "#!/",
  "<%",
];

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) return "";
  return fileName.slice(lastDot).toLowerCase();
}

export function validateUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): { ok: true } | { ok: false; error: string } {
  const ext = getExtension(originalName);

  // 1. Extension in ALLOWED_EXTENSIONS
  if (!ALLOWED_EXTENSIONS[ext]) {
    return {
      ok: false,
      error: `Unsupported file type "${ext}". Allowed: ${Object.keys(ALLOWED_EXTENSIONS).join(", ")}`,
    };
  }

  // 2. MIME type matches
  const allowedMimes = ALLOWED_EXTENSIONS[ext]!;
  const normalizedMime = mimeType.split(";")[0]!.trim().toLowerCase();
  if (!allowedMimes.includes(normalizedMime) && normalizedMime !== "application/octet-stream") {
    return {
      ok: false,
      error: `MIME type "${normalizedMime}" not allowed for ${ext} files`,
    };
  }

  // 3. Not empty
  if (buffer.length === 0) {
    return { ok: false, error: "File is empty" };
  }

  // 4. Size within limit
  if (buffer.length > config.maxUploadBytes) {
    return {
      ok: false,
      error: `File too large (${buffer.length} bytes). Max: ${config.maxUploadBytes} bytes`,
    };
  }

  // Text-specific checks
  if (TEXT_EXTENSIONS.has(ext)) {
    // 5. No null bytes
    if (buffer.includes(0)) {
      return { ok: false, error: "File contains null bytes (binary content in text file)" };
    }

    // 6. No script injection patterns
    const textContent = buffer.toString("utf8").toLowerCase();
    for (const pattern of SCRIPT_PATTERNS) {
      if (textContent.includes(pattern)) {
        return { ok: false, error: `File contains disallowed content pattern: "${pattern}"` };
      }
    }
  }

  return { ok: true };
}
