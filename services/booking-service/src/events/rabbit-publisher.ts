import amqp, { ChannelModel, ConfirmChannel, Options } from "amqplib";
import { logger } from "../config/logger";
import { env } from "../config/env";

const EXCHANGES = {
  NOTIFICATIONS: "notifications.fanout",
  DLQ: "dead-letter.exchange",
} as const;

const QUEUES = {
  EMAIL: "email.notifications",
  SMS: "sms.notifications",
} as const;

export interface NotificationMessage {
  type: "email" | "sms";
  to: string;
  subject?: string;
  templateId: string;
  variables: Record<string, string | number>;
  correlationId: string;
  priority?: "high" | "normal" | "low";
}

class RabbitMQPublisher {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private isShuttingDown = false;

  async connect(): Promise<void> {
    this.connection = await amqp.connect(env.RABBITMQ_URL);
    this.channel = await this.connection.createConfirmChannel();

    // Declare exchanges
    await this.channel.assertExchange(EXCHANGES.NOTIFICATIONS, "fanout", {
      durable: true,
    });
    await this.channel.assertExchange(EXCHANGES.DLQ, "direct", {
      durable: true,
    });

    // Declare queues with DLQ
    const queueOpts: Options.AssertQueue = {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": EXCHANGES.DLQ,
        "x-dead-letter-routing-key": "dead-letter",
        "x-max-priority": 10, // enable priority queue
      },
    };
    await this.channel.assertQueue(QUEUES.EMAIL, queueOpts);
    await this.channel.assertQueue(QUEUES.SMS, queueOpts);

    // Bind queues to fanout exchange
    await this.channel.bindQueue(QUEUES.EMAIL, EXCHANGES.NOTIFICATIONS, "");
    await this.channel.bindQueue(QUEUES.SMS, EXCHANGES.NOTIFICATIONS, "");

    // Handle unexpected disconnects with reconnect
    this.connection.on("error", (err) => {
      logger.error("RabbitMQ connection error", { error: err.message });
    });

    this.connection.on("close", () => {
      if (!this.isShuttingDown) {
        logger.warn("RabbitMQ connection closed — reconnecting in 5s");
        this.channel = undefined;
        this.connection = undefined;
        setTimeout(
          () =>
            this.connect().catch((err) =>
              logger.error("RabbitMQ reconnect failed", { error: err.message }),
            ),
          5_000,
        );
      }
    });

    logger.info("RabbitMQ publisher connected");
  }

  async publishNotification(msg: NotificationMessage): Promise<void> {
    if (!this.channel) {
      logger.warn("RabbitMQ channel not available — notification dropped", {
        templateId: msg.templateId,
        correlationId: msg.correlationId,
      });
      return;
    }

    const content = Buffer.from(JSON.stringify(msg));
    const priority =
      msg.priority === "high" ? 9 : msg.priority === "low" ? 1 : 5;
    const channel = this.channel; // capture ref before async boundary

    return new Promise((resolve, reject) => {
      channel.publish(
        EXCHANGES.NOTIFICATIONS,
        "",
        content,
        {
          persistent: true,
          contentType: "application/json",
          correlationId: msg.correlationId,
          timestamp: Math.floor(Date.now() / 1000), // Unix timestamp
          priority,
          headers: {
            "template-id": msg.templateId,
            source: "booking-service",
          },
        },
        (err) => {
          if (err) {
            logger.error("RabbitMQ publish failed", {
              error: err.message,
              correlationId: msg.correlationId,
            });
            reject(err);
          } else {
            logger.debug("Notification published", {
              type: msg.type,
              templateId: msg.templateId,
              correlationId: msg.correlationId,
              priority,
            });
            resolve();
          }
        },
      );
    });
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    try {
      await this.channel?.close();
      await (this.connection as any)?.close();
      logger.info("RabbitMQ publisher disconnected");
    } catch (err) {
      logger.error("RabbitMQ disconnect error", {
        error: (err as Error).message,
      });
    }
  }
}

export const rabbitPublisher = new RabbitMQPublisher();
