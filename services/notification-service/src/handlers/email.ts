import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface NotificationMessage {
  type: "email" | "sms";
  to: string;
  subject?: string;
  templateId: string;
  variables: Record<string, string | number>;
  correlationId: string;
}

// ─── HTML sanitizer (simple — strips tags from variable values) ───────────────
function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitize(
  variables: Record<string, string | number>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variables).map(([k, v]) => [k, escapeHtml(v)]),
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
const templates: Record<
  string,
  (v: Record<string, string>) => { subject: string; html: string }
> = {
  booking_pending: (v) => ({
    subject: `🎬 Booking Received — ${v.bookingId}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#e50000">CineBook</h1>
        <h2>We received your booking!</h2>
        <p>Your booking <strong>${v.bookingId}</strong> is pending payment.</p>
        <p>Total Amount: <strong>₹${v.totalAmount}</strong></p>
        <p>Please complete payment within 10 minutes to confirm your seats.</p>
      </div>`,
  }),

  booking_confirmed: (v) => ({
    subject: `✅ Booking Confirmed — ${v.movieTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#e50000">CineBook</h1>
        <h2>Your booking is confirmed! 🎉</h2>
        <p>Hi ${v.userName},</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Booking ID</strong></td><td style="padding:8px">${v.bookingId}</td></tr>
          <tr><td style="padding:8px"><strong>Confirmation Code</strong></td><td style="padding:8px">${v.confirmationCode}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Movie</strong></td><td style="padding:8px">${v.movieTitle}</td></tr>
          <tr><td style="padding:8px"><strong>Show Time</strong></td><td style="padding:8px">${v.showTime}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Theatre</strong></td><td style="padding:8px">${v.theatreName}</td></tr>
          <tr><td style="padding:8px"><strong>Seats</strong></td><td style="padding:8px">${v.seats}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px"><strong>Amount Paid</strong></td><td style="padding:8px">₹${v.amount}</td></tr>
        </table>
        <p style="color:#888;font-size:12px">Please carry this confirmation to the theatre.</p>
      </div>`,
  }),

  booking_cancelled: (v) => ({
    subject: `Booking Cancelled — ${v.bookingId}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#e50000">CineBook</h1>
        <h2>Booking Cancelled</h2>
        <p>Your booking <strong>${v.bookingId}</strong> has been cancelled.</p>
        ${v.refundAmount ? `<p>Refund of <strong>₹${v.refundAmount}</strong> will be processed in 5-7 business days.</p>` : ""}
      </div>`,
  }),

  booking_reminder: (v) => ({
    subject: `⏰ Reminder: ${v.movieTitle} starts in 2 hours`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h1 style="color:#e50000">CineBook</h1>
        <h2>Your show starts soon!</h2>
        <p><strong>${v.movieTitle}</strong> starts at <strong>${v.showTime}</strong>.</p>
        <p>Theatre: ${v.theatreName}</p>
        <p>Seats: ${v.seats}</p>
        <p>Enjoy the movie! 🍿</p>
      </div>`,
  }),
};

// ─── Transporter singleton ────────────────────────────────────────────────────
let transporter: nodemailer.Transporter | null = null;
let transporterInit: Promise<nodemailer.Transporter> | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  // Return existing transporter
  if (transporter) return transporter;

  // If already initializing, wait for it — prevents duplicate creation
  if (transporterInit) return transporterInit;

  transporterInit = (async () => {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      // Auto-create Ethereal test account for dev
      const testAccount = await nodemailer.createTestAccount();
      logger.info("Ethereal test account created", {
        user: testAccount.user,
        previewUrl: "https://ethereal.email",
      });
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE, // use env.SMTP_SECURE not port check
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    }

    // Verify connection on startup
    try {
      await transporter.verify();
      logger.info("SMTP connection verified", { host: env.SMTP_HOST });
    } catch (err) {
      logger.warn("SMTP verify failed — emails may not send", {
        error: (err as Error).message,
      });
    }

    return transporter;
  })();

  return transporterInit;
}

// ─── Send ─────────────────────────────────────────────────────────────────────
export async function sendEmail(
  notification: NotificationMessage,
): Promise<void> {
  const template = templates[notification.templateId];
  if (!template) {
    logger.warn("Unknown email template — skipping", {
      templateId: notification.templateId,
      correlationId: notification.correlationId,
    });
    return;
  }

  // Sanitize variables before interpolating into HTML
  const safeVars = sanitize(notification.variables);
  const { subject, html } = template(safeVars);
  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: `"CineBook" <${env.EMAIL_FROM}>`,
    to: notification.to,
    subject: notification.subject ?? subject,
    html,
    headers: { "X-Correlation-Id": notification.correlationId },
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.info("Email sent", {
    to: notification.to,
    templateId: notification.templateId,
    messageId: info.messageId,
    correlationId: notification.correlationId,
    ...(previewUrl && { previewUrl }),
  });
}
