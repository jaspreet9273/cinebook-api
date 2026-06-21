import { logger } from "../config/logger";
import { NotificationMessage } from "./email"; // single source of truth

const SMS_MAX_LENGTH = 160;

// ─── Sanitize SMS content ─────────────────────────────────────────────────────
// Prevent SMS injection — strip newlines and control characters
function sanitizeSms(value: string | number): string {
  return String(value)
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

function sanitize(
  variables: Record<string, string | number>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variables).map(([k, v]) => [k, sanitizeSms(v)]),
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
const templates: Record<string, (v: Record<string, string>) => string> = {
  booking_pending: (v) =>
    `CineBook: Booking ${v.bookingId} received. Pay Rs.${v.totalAmount} within 10 mins to confirm seats.`,
  booking_confirmed: (v) =>
    `CineBook: Confirmed! ${v.movieTitle} at ${v.showTime}. Seats: ${v.seats}. Code: ${v.confirmationCode}`,
  booking_cancelled: (v) =>
    `CineBook: Booking ${v.bookingId} cancelled.${v.refundAmount ? ` Refund Rs.${v.refundAmount} in 5-7 days.` : ""}`,
  booking_reminder: (v) =>
    `CineBook: Reminder! ${v.movieTitle} starts at ${v.showTime}. Theatre: ${v.theatreName}. Enjoy!`,
};

// ─── Send ─────────────────────────────────────────────────────────────────────
export async function sendSms(
  notification: NotificationMessage,
): Promise<void> {
  const template = templates[notification.templateId];
  if (!template) {
    logger.warn("Unknown SMS template — skipping", {
      templateId: notification.templateId,
      correlationId: notification.correlationId,
    });
    return;
  }

  const safeVars = sanitize(notification.variables);
  const message = template(safeVars);

  if (message.length > SMS_MAX_LENGTH) {
    logger.warn("SMS message exceeds 160 chars — will use multiple segments", {
      length: message.length,
      templateId: notification.templateId,
      correlationId: notification.correlationId,
    });
  }

  // ── Uncomment your provider ───────────────────────────────────────────────

  // Twilio (free trial — twilio.com):
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  // await twilio.messages.create({ from: process.env.TWILIO_FROM, to: notification.to, body: message });

  // Fast2SMS (free 50 SMS for Indian numbers — fast2sms.com):
  // await fetch('https://www.fast2sms.com/dev/bulkV2', {
  //   method: 'POST',
  //   headers: { authorization: process.env.FAST2SMS_API_KEY! },
  //   body: JSON.stringify({ route: 'q', message, numbers: notification.to.replace('+91', '') }),
  // });

  // Dev: log only
  logger.info("SMS dispatched", {
    to: notification.to,
    length: message.length,
    templateId: notification.templateId,
    correlationId: notification.correlationId,
  });
}
