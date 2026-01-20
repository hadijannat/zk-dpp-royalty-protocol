import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  correlationId: string;
  userId?: string;
  service: string;
  operation?: string;
  startTime: number;
}

/**
 * AsyncLocalStorage instance for request context propagation
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with a request context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Run an async function with a request context
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return getContext()?.correlationId;
}

/**
 * Get the current user ID
 */
export function getUserId(): string | undefined {
  return getContext()?.userId;
}

/**
 * Update the current context with additional data
 */
export function updateContext(updates: Partial<RequestContext>): void {
  const current = getContext();
  if (current) {
    Object.assign(current, updates);
  }
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Calculate request duration from context start time
 */
export function getDurationMs(): number {
  const ctx = getContext();
  if (!ctx) return 0;
  return Date.now() - ctx.startTime;
}
