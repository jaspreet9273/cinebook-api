import { Kafka, Producer, CompressionTypes, logLevel } from "kafkajs";
import { logger } from "../config/logger";
import { env } from "../config/env";

interface KafkaEvent {
  eventId: string;
  correlationId: string;
  timestamp: string;
  type: string;
  payload: Record<string, any>;
}

class KafkaProducer {
  private producer!: Producer;
  private connected = false;
  private kafka!: Kafka;

  async connect(): Promise<void> {
    this.kafka = new Kafka({
      clientId: "payment-service",
      brokers: env.KAFKA_BROKERS,
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 10 },
    });

    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    });

    this.producer.on("producer.disconnect", () => {
      logger.warn("Kafka producer disconnected unexpectedly");
      this.connected = false;
    });

    this.producer.on("producer.connect", () => {
      this.connected = true;
    });

    await this.producer.connect();
    this.connected = true;
    logger.info("Kafka producer connected", { brokers: env.KAFKA_BROKERS });
  }

  async publish(topic: string, event: KafkaEvent): Promise<void> {
    if (!this.connected) {
      logger.warn("Kafka not connected — event dropped", {
        topic,
        eventType: event.type,
        eventId: event.eventId,
      });
      return;
    }

    // Partition key: bookingId ensures all payment events for same booking
    // land on the same partition — preserving order
    const partitionKey =
      (event.payload.bookingId as string) ??
      (event.payload.paymentId as string) ??
      event.eventId;

    await this.producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key: partitionKey,
          value: JSON.stringify(event),
          headers: {
            "event-id": event.eventId,
            "event-type": event.type,
            "correlation-id": event.correlationId,
            timestamp: event.timestamp,
            source: "payment-service",
          },
        },
      ],
    });

    logger.debug("Kafka event published", {
      topic,
      eventType: event.type,
      eventId: event.eventId,
      partitionKey,
      correlationId: event.correlationId,
    });
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      logger.info("Kafka producer disconnected");
    }
  }
}

export const kafkaProducer = new KafkaProducer();
