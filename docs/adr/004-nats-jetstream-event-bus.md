# ADR-004: NATS JetStream as Event Bus

## Status

Accepted

## Context

The ZK-DPP system requires an event bus for:

- Asynchronous communication between services
- Guaranteed delivery of verification events for metering
- Decoupling services for independent scaling
- Event replay for debugging and auditing

Key requirements:
- At-least-once delivery semantics
- Message persistence (survive restarts)
- Simple operational model
- Low latency for real-time updates
- Horizontal scalability

## Decision

We will use **NATS JetStream** as the event bus for inter-service communication.

### Event Patterns

```typescript
// Publishing verification events
await nc.publish('proofs.verified', JSON.stringify({
  receiptId: 'rec-001',
  predicateId: { name: 'RECYCLED_CONTENT_GTE', version: 'V1' },
  supplierId: 'supplier-1',
  brandId: 'brand-A',
  verifiedAt: new Date().toISOString(),
}));

// Consuming with JetStream (durable, at-least-once)
const js = nc.jetstream();
const consumer = await js.consumers.get('METERING', 'billing-processor');
const messages = await consumer.consume();

for await (const msg of messages) {
  await processVerification(msg.json());
  msg.ack();
}
```

### Stream Configuration

```yaml
# JetStream stream for verification events
name: PROOFS
subjects:
  - proofs.>
retention: limits
max_msgs: 1000000
max_bytes: 1GB
max_age: 30d
storage: file
replicas: 3
```

## Consequences

### Positive

- **Simple operations**: Single binary, minimal configuration
- **Persistence**: JetStream provides durable storage with configurable retention
- **At-least-once delivery**: Acknowledgment-based consumption
- **Replay capability**: Re-process events from any point
- **Low latency**: Sub-millisecond message delivery
- **Lightweight**: ~15MB binary, low memory footprint
- **Cloud-native**: First-class Kubernetes support

### Negative

- **Limited ecosystem**: Fewer integrations than Kafka
- **Smaller community**: Less Stack Overflow content
- **No exactly-once**: Consumers must handle duplicates (idempotency)
- **Limited querying**: No SQL-like stream querying (unlike ksqlDB)

### Neutral

- Uses its own protocol (not AMQP/MQTT)
- Clustering requires understanding of RAFT consensus
- Monitoring requires NATS-specific tooling

## Alternatives Considered

### Apache Kafka

- **Pros**: Industry standard, massive ecosystem, exactly-once semantics
- **Cons**: Heavy operational burden (ZooKeeper/KRaft), high resource usage, complex configuration
- **Rejected because**: Overkill for our scale, operational complexity not justified

### RabbitMQ

- **Pros**: Mature, AMQP standard, good management UI
- **Cons**: Not designed for streaming, message retention is awkward, clustering complexity
- **Rejected because**: Stream semantics (replay, consumer groups) are bolted on

### Redis Streams

- **Pros**: Familiar if using Redis, low latency
- **Cons**: Memory-first storage, persistence is secondary, limited consumer group features
- **Rejected because**: Not designed as a primary event store, durability concerns

### AWS SQS + SNS

- **Pros**: Fully managed, scales infinitely
- **Cons**: Cloud lock-in, no local development parity, higher latency
- **Rejected because**: Need to run locally for development, avoid cloud dependency

### Pulsar

- **Pros**: Tiered storage, multi-tenancy, geo-replication
- **Cons**: Heavy (requires BookKeeper), complex operations
- **Rejected because**: Overkill for our needs, operational burden similar to Kafka

## Event Schema

### proofs.verified

```json
{
  "receiptId": "string",
  "predicateId": {
    "name": "string",
    "version": "string"
  },
  "productRef": "string",
  "supplierId": "string",
  "brandId": "string",
  "result": true,
  "verifiedAt": "ISO8601 timestamp",
  "expiresAt": "ISO8601 timestamp"
}
```

### proofs.failed

```json
{
  "requestId": "string",
  "predicateId": {
    "name": "string",
    "version": "string"
  },
  "errorCode": "string",
  "errorMessage": "string",
  "failedAt": "ISO8601 timestamp"
}
```

## References

- [NATS Documentation](https://docs.nats.io/)
- [JetStream Documentation](https://docs.nats.io/nats-concepts/jetstream)
- [NATS Helm Chart](https://nats-io.github.io/k8s/helm/charts/)
