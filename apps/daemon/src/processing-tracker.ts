/**
 * Tracks processing state for idempotent event handling.
 * - Prevents concurrent processing of the same key
 * - Keeps successfully processed keys permanently (no re-processing)
 * - Removes failed keys to allow retry
 */
export class ProcessingTracker {
  private readonly keys = new Set<string>();

  /** Returns true if the key was acquired (caller should proceed). */
  acquire(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  /** Mark as permanently done (success). Key stays in set. */
  markDone(_key: string): void {
    // Key already in set from acquire() — nothing to do.
  }

  /** Mark as failed. Removes key so it can be retried. */
  markFailed(key: string): void {
    this.keys.delete(key);
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  get size(): number {
    return this.keys.size;
  }
}
