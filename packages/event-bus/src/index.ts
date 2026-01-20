import {
  connect,
  NatsConnection,
  JetStreamManager,
  JetStreamClient,
  StringCodec,
  ConsumerConfig,
  JsMsg,
  StreamConfig,
} from 'nats';

// Event subjects used in the system
export const SUBJECTS = {
  PROOFS_VERIFIED: 'proofs.verified',
  RECEIPTS_ISSUED: 'receipts.issued',
  COMMITMENTS_CREATED: 'commitments.created',
  COMMITMENTS_REVOKED: 'commitments.revoked',
} as const;

// Stream names
export const STREAMS = {
  VERIFICATION: 'VERIFICATION',
  COMMITMENTS: 'COMMITMENTS',
} as const;

export interface EventBusConfig {
  servers: string[];
  name?: string;
  maxReconnectAttempts?: number;
}

const sc = StringCodec();

/**
 * Event bus client for publishing and subscribing to NATS JetStream events.
 */
export class EventBus {
  private connection: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;
  private js: JetStreamClient | null = null;

  constructor(private config: EventBusConfig) {}

  /**
   * Connects to NATS and initializes JetStream.
   */
  async connect(): Promise<void> {
    this.connection = await connect({
      servers: this.config.servers,
      name: this.config.name ?? 'zkdpp-service',
      maxReconnectAttempts: this.config.maxReconnectAttempts ?? 10,
    });

    this.jsm = await this.connection.jetstreamManager();
    this.js = this.connection.jetstream();

    console.log(`Connected to NATS: ${this.config.servers.join(', ')}`);
  }

  /**
   * Ensures required streams exist with proper configuration.
   */
  async ensureStreams(): Promise<void> {
    if (!this.jsm) throw new Error('Not connected');

    // Verification stream for proof-related events
    await this.ensureStream({
      name: STREAMS.VERIFICATION,
      subjects: [SUBJECTS.PROOFS_VERIFIED, SUBJECTS.RECEIPTS_ISSUED],
      retention: 'limits',
      max_msgs: 1_000_000,
      max_bytes: 1024 * 1024 * 1024, // 1GB
      max_age: 90 * 24 * 60 * 60 * 1e9, // 90 days in nanoseconds
      storage: 'file',
      num_replicas: 1,
    } as StreamConfig);

    // Commitments stream
    await this.ensureStream({
      name: STREAMS.COMMITMENTS,
      subjects: [SUBJECTS.COMMITMENTS_CREATED, SUBJECTS.COMMITMENTS_REVOKED],
      retention: 'limits',
      max_msgs: 100_000,
      max_bytes: 512 * 1024 * 1024, // 512MB
      max_age: 365 * 24 * 60 * 60 * 1e9, // 1 year in nanoseconds
      storage: 'file',
      num_replicas: 1,
    } as StreamConfig);
  }

  private async ensureStream(config: StreamConfig): Promise<void> {
    if (!this.jsm) throw new Error('Not connected');

    try {
      await this.jsm.streams.info(config.name);
      console.log(`Stream ${config.name} already exists`);
    } catch {
      await this.jsm.streams.add(config);
      console.log(`Created stream ${config.name}`);
    }
  }

  /**
   * Publishes an event to a subject.
   */
  async publish<T>(subject: string, data: T): Promise<void> {
    if (!this.js) throw new Error('Not connected');

    const payload = JSON.stringify(data);
    await this.js.publish(subject, sc.encode(payload));
  }

  /**
   * Creates a durable consumer for a stream.
   */
  async createConsumer(
    stream: string,
    consumerName: string,
    config?: Partial<ConsumerConfig>
  ): Promise<void> {
    if (!this.jsm) throw new Error('Not connected');

    const fullConfig: ConsumerConfig = {
      durable_name: consumerName,
      ack_policy: 'explicit',
      deliver_policy: 'all',
      ...config,
    } as ConsumerConfig;

    try {
      await this.jsm.consumers.info(stream, consumerName);
      console.log(`Consumer ${consumerName} already exists on ${stream}`);
    } catch {
      await this.jsm.consumers.add(stream, fullConfig);
      console.log(`Created consumer ${consumerName} on ${stream}`);
    }
  }

  /**
   * Subscribes to messages from a consumer.
   */
  async subscribe(
    stream: string,
    consumer: string,
    handler: (msg: JsMsg, data: unknown) => Promise<void>
  ): Promise<() => void> {
    if (!this.js) throw new Error('Not connected');

    const sub = await this.js.consumers.get(stream, consumer);
    const messages = await sub.consume();

    const process = async () => {
      for await (const msg of messages) {
        try {
          const data = JSON.parse(sc.decode(msg.data));
          await handler(msg, data);
          msg.ack();
        } catch (error) {
          console.error('Error processing message:', error);
          // NAK with delay for retry
          msg.nak(5000);
        }
      }
    };

    // Start processing in background
    process().catch(console.error);

    // Return unsubscribe function
    return () => {
      messages.stop();
    };
  }

  /**
   * Closes the connection.
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.drain();
      this.connection = null;
      this.jsm = null;
      this.js = null;
    }
  }

  /**
   * Alias for close()
   */
  async disconnect(): Promise<void> {
    return this.close();
  }

  /**
   * Checks if connected.
   */
  isConnected(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }

  /**
   * Simple subscribe method that auto-creates consumer
   */
  async subscribeToSubject<T>(
    subject: string,
    handler: (data: T) => Promise<void>,
    options?: { durable?: string; deliverPolicy?: 'all' | 'new' | 'last' }
  ): Promise<() => void> {
    if (!this.js || !this.jsm) throw new Error('Not connected');

    // Determine which stream this subject belongs to
    let streamName: string = STREAMS.VERIFICATION;
    if (subject.startsWith('commitments.')) {
      streamName = STREAMS.COMMITMENTS;
    }

    // Create a durable consumer if name provided
    const consumerName = options?.durable || `consumer-${Date.now()}`;

    try {
      await this.jsm.consumers.info(streamName, consumerName);
    } catch {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: 'explicit',
        deliver_policy: options?.deliverPolicy || 'all',
        filter_subject: subject,
      } as ConsumerConfig);
    }

    const sub = await this.js.consumers.get(streamName, consumerName);
    const messages = await sub.consume();

    const process = async () => {
      for await (const msg of messages) {
        try {
          const data = JSON.parse(sc.decode(msg.data)) as T;
          await handler(data);
          msg.ack();
        } catch (error) {
          console.error('Error processing message:', error);
          msg.nak(5000);
        }
      }
    };

    process().catch(console.error);

    return () => {
      messages.stop();
    };
  }
}

/**
 * Creates and connects an event bus instance.
 */
export async function createEventBus(config: EventBusConfig): Promise<EventBus> {
  const bus = new EventBus(config);
  await bus.connect();
  await bus.ensureStreams();
  return bus;
}

// Re-export types
export type { JsMsg };

// Aliases for backward compatibility
export const EventBusClient = EventBus;
export const EVENTS = {
  VERIFICATION: {
    PROOF_VERIFIED: SUBJECTS.PROOFS_VERIFIED,
    RECEIPT_ISSUED: SUBJECTS.RECEIPTS_ISSUED,
  },
  COMMITMENTS: {
    CREATED: SUBJECTS.COMMITMENTS_CREATED,
    REVOKED: SUBJECTS.COMMITMENTS_REVOKED,
  },
} as const;
