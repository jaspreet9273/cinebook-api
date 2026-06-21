import { Kafka, Consumer, EachMessagePayload, logLevel } from "kafkajs";
import { logger } from "../config/logger";
import { env } from "../config/env";

// ─── Inline event types (avoids workspace package dependency) ─────────────────
export interface DomainEvent {
  eventId: string;
  correlationId: string;
  timestamp: string;
  type: string;
  payload: Record<string, any>;
}

type EventHandler = (event: DomainEvent) => Promise<void>;

const MAX_RETRIES = 3;

class KafkaConsumer {
  private consumer!: Consumer;
  private handlers = new Map<string, EventHandler>();
  private retryCounts = new Map<string, number>(); // offset → retry count

  on(topic: string, handler: EventHandler): void {
    this.handlers.set(topic, handler);
  }

  async start(): Promise<void> {
    const kafka = new Kafka({
      clientId: "booking-service-consumer",
      brokers: env.KAFKA_BROKERS,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 8 },
    });

    this.consumer = kafka.consumer({
      groupId: "booking-service-group",
      heartbeatInterval: 3_000,
      sessionTimeout: 30_000,
      maxWaitTimeInMs: 5_000, // max time broker waits before returning empty batch
    });

    // Handle unexpected disconnects
    this.consumer.on("consumer.crash", ({ payload }) => {
      logger.error("Kafka consumer crashed", { error: payload.error?.message });
    });

    this.consumer.on("consumer.disconnect", () => {
      logger.warn("Kafka consumer disconnected");
    });

    await this.consumer.connect();

    for (const topic of this.handlers.keys()) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      autoCommit: false, // manual commit — only after successful processing
      eachMessage: async (payload: EachMessagePayload) => {
        await this.processMessage(payload);
      },
    });

    logger.info("Kafka consumer started", {
      topics: [...this.handlers.keys()],
    });
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const eventId = message.headers?.["event-id"]?.toString();
    const correlationId = message.headers?.["correlation-id"]?.toString();
    const retryKey = `${topic}:${partition}:${message.offset}`;

    try {
      if (!message.value) {
        logger.warn("Empty Kafka message — skipping", { topic, partition });
        await this.commitOffset(topic, partition, message.offset);
        return;
      }

      const event = JSON.parse(message.value.toString()) as DomainEvent;
      const handler = this.handlers.get(topic);

      if (!handler) {
        logger.warn("No handler registered for topic", { topic });
        await this.commitOffset(topic, partition, message.offset);
        return;
      }

      await handler(event);

      // Commit only after successful processing (at-least-once guarantee)
      await this.commitOffset(topic, partition, message.offset);
      this.retryCounts.delete(retryKey);

      logger.debug("Kafka message processed", {
        topic,
        eventId,
        correlationId,
      });
    } catch (err) {
      const retries = (this.retryCounts.get(retryKey) ?? 0) + 1;
      this.retryCounts.set(retryKey, retries);

      logger.error("Kafka message processing failed", {
        topic,
        partition,
        offset: message.offset,
        eventId,
        correlationId,
        attempt: retries,
        maxRetries: MAX_RETRIES,
        error: (err as Error).message,
      });

      if (retries >= MAX_RETRIES) {
        // Exhausted retries — commit offset to unblock consumer
        // In production: publish to DLQ before committing
        logger.error("Max retries exceeded — skipping message", {
          topic,
          partition,
          offset: message.offset,
          eventId,
        });
        await this.commitOffset(topic, partition, message.offset);
        this.retryCounts.delete(retryKey);
      }
      // If under max retries — do NOT commit, message will be redelivered
    }
  }

  private async commitOffset(
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.consumer.commitOffsets([
      { topic, partition, offset: (Number(offset) + 1).toString() },
    ]);
  }

  async disconnect(): Promise<void> {
    try {
      await this.consumer?.disconnect();
      logger.info("Kafka consumer disconnected");
    } catch (err) {
      logger.error("Kafka consumer disconnect error", {
        error: (err as Error).message,
      });
    }
  }
}

export const kafkaConsumer = new KafkaConsumer();
