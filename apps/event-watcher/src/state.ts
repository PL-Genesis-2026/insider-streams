/**
 * Watcher state persistence — tracks last processed block to resume after restarts.
 */

import { readFileSync, writeFileSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_ = dirname(__filename_);
const STATE_FILE = resolve(__dirname_, ".watcher-state.json");
const STATE_TMP = `${STATE_FILE}.tmp`;

interface WatcherState {
  lastProcessedBlock: number;
  updatedAt: string;
}

export function loadState(): WatcherState | null {
  try {
    const raw = readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as WatcherState;
    if (typeof parsed.lastProcessedBlock !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(lastProcessedBlock: number): void {
  const state: WatcherState = {
    lastProcessedBlock,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_TMP, JSON.stringify(state, null, 2), "utf-8");
  renameSync(STATE_TMP, STATE_FILE);
}
