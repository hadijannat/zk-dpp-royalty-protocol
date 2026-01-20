import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Global metrics registry
 */
const registry = new Registry();

/**
 * Initialize default metrics collection
 */
export function initMetrics(serviceName: string): void {
  registry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: registry });
}

/**
 * Get the metrics registry
 */
export function getRegistry(): Registry {
  return registry;
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getContentType(): string {
  return registry.contentType;
}

// --- Standard Metrics ---

/**
 * HTTP request counter
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

/**
 * Verification requests counter
 */
export const verificationRequestsTotal = new Counter({
  name: 'verification_requests_total',
  help: 'Total number of verification requests',
  labelNames: ['predicate', 'status'] as const,
  registers: [registry],
});

/**
 * Verification duration histogram
 */
export const verificationDuration = new Histogram({
  name: 'verification_duration_seconds',
  help: 'Proof verification duration in seconds',
  labelNames: ['predicate'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Proof verification success counter
 */
export const proofVerificationSuccess = new Counter({
  name: 'proof_verification_success_total',
  help: 'Total number of successful proof verifications',
  labelNames: ['predicate'] as const,
  registers: [registry],
});

/**
 * Proof verification failure counter
 */
export const proofVerificationFailure = new Counter({
  name: 'proof_verification_failure_total',
  help: 'Total number of failed proof verifications',
  labelNames: ['predicate', 'reason'] as const,
  registers: [registry],
});

/**
 * Database query duration histogram
 */
export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

/**
 * Event bus messages counter
 */
export const eventBusMessagesTotal = new Counter({
  name: 'event_bus_messages_total',
  help: 'Total number of event bus messages',
  labelNames: ['subject', 'direction'] as const,
  registers: [registry],
});

/**
 * Active connections gauge
 */
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['type'] as const,
  registers: [registry],
});

/**
 * DPP views counter
 */
export const dppViewsTotal = new Counter({
  name: 'dpp_views_total',
  help: 'Total number of DPP views',
  labelNames: ['view_type', 'product_id'] as const,
  registers: [registry],
});

/**
 * Metering events counter
 */
export const meteringEventsTotal = new Counter({
  name: 'metering_events_total',
  help: 'Total number of metered events',
  labelNames: ['predicate', 'supplier_id'] as const,
  registers: [registry],
});

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
): void {
  const labels = { method, route, status_code: statusCode.toString() };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationSeconds);
}

/**
 * Record verification metrics
 */
export function recordVerification(
  predicate: string,
  success: boolean,
  durationSeconds: number,
  failureReason?: string
): void {
  verificationRequestsTotal.inc({ predicate, status: success ? 'success' : 'failure' });
  verificationDuration.observe({ predicate }, durationSeconds);

  if (success) {
    proofVerificationSuccess.inc({ predicate });
  } else {
    proofVerificationFailure.inc({ predicate, reason: failureReason || 'unknown' });
  }
}

/**
 * Record database query metrics
 */
export function recordDatabaseQuery(
  operation: string,
  table: string,
  durationSeconds: number
): void {
  databaseQueryDuration.observe({ operation, table }, durationSeconds);
}
