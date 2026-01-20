import type { NonceEntry } from '../types.js';

/**
 * In-memory nonce store for replay protection.
 * In production, this should be backed by Redis or PostgreSQL.
 */
export class NonceStore {
  private nonces: Map<string, NonceEntry> = new Map();
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs: number = 5 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  /**
   * Start periodic cleanup of expired nonces
   */
  startCleanup(intervalMs: number = 60 * 1000): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Check if a nonce has been seen before.
   * Returns true if the nonce is new (valid), false if it's a replay.
   */
  checkAndStore(nonce: string, predicateId: string): boolean {
    const now = Date.now();

    // Check if nonce already exists
    if (this.nonces.has(nonce)) {
      return false;
    }

    // Store the nonce
    this.nonces.set(nonce, {
      nonce,
      timestamp: now,
      predicateId,
    });

    return true;
  }

  /**
   * Remove expired nonces from the store
   */
  cleanup(): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let removed = 0;

    for (const [nonce, entry] of this.nonces.entries()) {
      if (entry.timestamp < cutoff) {
        this.nonces.delete(nonce);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get current store size
   */
  size(): number {
    return this.nonces.size;
  }

  /**
   * Clear all nonces (for testing)
   */
  clear(): void {
    this.nonces.clear();
  }
}

// Singleton instance
export const nonceStore = new NonceStore();
