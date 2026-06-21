import "dotenv/config";
import amqp, { ChannelModel, Channel, ConsumeMessage } from "amqplib";
import { logger } from "./config/logger";
import { env } from "./config/env";
import { sendEmail, NotificationMessage } from "./handlers/email";
import { sendSms } from "./handlers/sms";

const QUEUES = {
  EMAIL: "email.notifications",
  SMS: "sms.notifications",
} as const;

const EXCHANGES = {
  NOTIFICATIONS: "notifications.fanout",
  DLQ: "dead-letter.exchange",
} as const;

const MAX_RETRIES = 3;
const RECONNECT_DELAY = 5_000;

class NotificationConsumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isShuttingDown = false;

  async start(): Promise<void> {
    try {
      this.connection = await amqp.connect(env.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      // One message at a time per consumer
      await this.channel.prefetch(1);

      // Declare exchanges
      await this.channel.assertExchange(EXCHANGES.NOTIFICATIONS, "fanout", {
        durable: true,
      });
      await this.channel.assertExchange(EXCHANGES.DLQ, "direct", {
        durable: true,
      });

      // Declare queues with DLQ
      const queueOpts = {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": EXCHANGES.DLQ,
          "x-dead-letter-routing-key": "dead-letter",
          "x-max-priority": 10,
        },
      };
      await this.channel.assertQueue(QUEUES.EMAIL, queueOpts);
      await this.channel.assertQueue(QUEUES.SMS, queueOpts);

      // Bind to fanout
      await this.channel.bindQueue(QUEUES.EMAIL, EXCHANGES.NOTIFICATIONS, "");
      await this.channel.bindQueue(QUEUES.SMS, EXCHANGES.NOTIFICATIONS, "");

      // Consume — wrap in arrow to preserve this context
      await this.channel.consume(QUEUES.EMAIL, (msg) =>
        this.handleMessage(msg, QUEUES.EMAIL),
      );
      await this.channel.consume(QUEUES.SMS, (msg) =>
        this.handleMessage(msg, QUEUES.SMS),
      );

      logger.info("📨 Notification service consuming from RabbitMQ", {
        queues: [QUEUES.EMAIL, QUEUES.SMS],
      });

      // Arrow functions preserve `this` context
      this.connection.on("close", () => {
        if (!this.isShuttingDown) {
          logger.warn("RabbitMQ connection closed — reconnecting in 5s");
          this.channel = null;
          this.connection = null;
          setTimeout(() => this.start(), RECONNECT_DELAY);
        }
      });

      this.connection.on("error", (err: Error) => {
        logger.error("RabbitMQ connection error", { error: err.message });
      });
    } catch (err) {
      if (!this.isShuttingDown) {
        logger.error("RabbitMQ connect failed — retrying in 5s", {
          error: (err as Error).message,
        });
        setTimeout(() => this.start(), RECONNECT_DELAY);
      }
    }
  }

  private async handleMessage(
    msg: ConsumeMessage | null,
    queue: string,
  ): Promise<void> {
    if (!msg || !this.channel) return;

    const correlationId = msg.properties.correlationId ?? "unknown";
    const retryCount = parseInt(
      (msg.properties.headers?.["x-death"]?.[0]?.count ?? 0).toString(),
    );

    try {
      const notification = JSON.parse(
        msg.content.toString(),
      ) as NotificationMessage;

      logger.debug("Processing notification", {
        type: notification.type,
        templateId: notification.templateId,
        queue,
        correlationId,
        retryCount,
      });

      if (notification.type === "email") {
        await sendEmail(notification);
      } else if (notification.type === "sms") {
        await sendSms(notification);
      } else {
        logger.warn("Unknown notification type — discarding", {
          type: (notification as any).type,
          correlationId,
        });
        this.channel.ack(msg); // discard unknown types
        return;
      }

      this.channel.ack(msg);
      logger.info("Notification sent", {
        type: notification.type,
        templateId: notification.templateId,
        queue,
        correlationId,
      });
    } catch (err) {
      logger.error("Notification processing failed", {
        correlationId,
        queue,
        retryCount,
        error: (err as Error).message,
      });

      if (retryCount < MAX_RETRIES) {
        // NACK + requeue — RabbitMQ will redeliver
        this.channel.nack(msg, false, true);
        logger.warn("Notification requeued for retry", {
          correlationId,
          attempt: retryCount + 1,
          maxRetries: MAX_RETRIES,
        });
      } else {
        // Exhausted retries — send to DLQ
        this.channel.nack(msg, false, false);
        logger.error("Notification moved to DLQ after max retries", {
          correlationId,
          queue,
        });
      }
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    try {
      await this.channel?.close();
      await (this.connection as any)?.close();
      logger.info("Notification service stopped");
    } catch (err) {
      logger.error("Error during stop", { error: (err as Error).message });
    }
  }
}

async function main(): Promise<void> {
  const consumer = new NotificationConsumer();
  await consumer.start();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} — shutting down`);
    await consumer.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
  });
}

main().catch((err) => {
  logger.error("Failed to start notification service", {
    error: (err as Error).message,
  });
  process.exit(1);
});
