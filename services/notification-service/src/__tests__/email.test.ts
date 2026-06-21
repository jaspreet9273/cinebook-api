import nodemailer from "nodemailer";
import { sendEmail, NotificationMessage } from "../handlers/email";

// ─── Mock nodemailer ──────────────────────────────────────────────────────────
jest.mock("nodemailer");

const mockSendMail = jest.fn().mockResolvedValue({ messageId: "test-msg-001" });
const mockVerify = jest.fn().mockResolvedValue(true);
const mockTransporter = { sendMail: mockSendMail, verify: mockVerify };

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset transporter singleton between tests
  jest.resetModules();

  mockedNodemailer.createTransport.mockReturnValue(mockTransporter as any);
  mockedNodemailer.createTestAccount.mockResolvedValue({
    user: "test@ethereal.email",
    pass: "testpass",
    smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
    imap: { host: "imap.ethereal.email", port: 993, secure: true },
    pop3: { host: "pop3.ethereal.email", port: 995, secure: true },
    web: "https://ethereal.email",
  });
  mockedNodemailer.getTestMessageUrl.mockReturnValue(
    "https://ethereal.email/message/test",
  );
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeMessage(
  overrides: Partial<NotificationMessage> = {},
): NotificationMessage {
  return {
    type: "email",
    to: "user@example.com",
    templateId: "booking_pending",
    variables: { bookingId: "BKG-001", totalAmount: 510 },
    correlationId: "corr-001",
    ...overrides,
  };
}

// ─── sendEmail ────────────────────────────────────────────────────────────────
describe("sendEmail", () => {
  it("sends email for booking_pending template", async () => {
    await sendEmail(makeMessage());
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("user@example.com");
    expect(call.subject).toContain("BKG-001");
    expect(call.html).toContain("BKG-001");
    expect(call.html).toContain("510");
  });

  it("sends email for booking_confirmed template", async () => {
    await sendEmail(
      makeMessage({
        templateId: "booking_confirmed",
        variables: {
          bookingId: "BKG-001",
          confirmationCode: "CONF-ABC",
          movieTitle: "Inception",
          showTime: "2024-07-20 18:00",
          theatreName: "PVR Cinemas",
          seats: "A1, A2",
          amount: 510,
          userName: "Jaspreet",
        },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain("Inception");
    expect(call.html).toContain("CONF-ABC");
    expect(call.html).toContain("PVR Cinemas");
  });

  it("sends email for booking_cancelled template", async () => {
    await sendEmail(
      makeMessage({
        templateId: "booking_cancelled",
        variables: { bookingId: "BKG-001", refundAmount: 500 },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain("BKG-001");
    expect(call.html).toContain("500");
  });

  it("sends email for booking_cancelled template without refund", async () => {
    await sendEmail(
      makeMessage({
        templateId: "booking_cancelled",
        variables: { bookingId: "BKG-001" },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).not.toContain("Refund");
  });

  it("sends email for booking_reminder template", async () => {
    await sendEmail(
      makeMessage({
        templateId: "booking_reminder",
        variables: {
          movieTitle: "Inception",
          showTime: "18:00",
          theatreName: "PVR Cinemas",
          seats: "A1, A2",
        },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain("Inception");
  });

  it("uses custom subject when provided", async () => {
    await sendEmail(makeMessage({ subject: "Custom Subject" }));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].subject).toBe("Custom Subject");
  });

  it("sets correlation ID in headers", async () => {
    await sendEmail(makeMessage({ correlationId: "test-corr-123" }));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.headers["X-Correlation-Id"]).toBe("test-corr-123");
  });

  it("skips sending for unknown template", async () => {
    await sendEmail(makeMessage({ templateId: "nonexistent_template" }));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sanitizes XSS in template variables", async () => {
    await sendEmail(
      makeMessage({
        variables: {
          bookingId: '<script>alert("xss")</script>',
          totalAmount: 510,
        },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("&lt;script&gt;");
  });

  it("sets from address correctly", async () => {
    await sendEmail(makeMessage());
    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toContain("noreply@cinebook.app");
    expect(call.from).toContain("CineBook");
  });
});
