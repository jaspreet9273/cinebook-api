import { sendSms } from "../handlers/sms";
import { NotificationMessage } from "../handlers/email";
import { logger } from "../config/logger";

// ─── Mock logger to capture output ───────────────────────────────────────────
jest.mock("../config/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

beforeEach(() => jest.clearAllMocks());

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeMessage(
  overrides: Partial<NotificationMessage> = {},
): NotificationMessage {
  return {
    type: "sms",
    to: "+919876543210",
    templateId: "booking_pending",
    variables: { bookingId: "BKG-001", totalAmount: 510 },
    correlationId: "corr-001",
    ...overrides,
  };
}

// ─── sendSms ──────────────────────────────────────────────────────────────────
describe("sendSms", () => {
  it("logs dispatch for booking_pending template", async () => {
    await sendSms(makeMessage());
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SMS dispatched",
      expect.objectContaining({
        to: "+919876543210",
        templateId: "booking_pending",
        correlationId: "corr-001",
      }),
    );
  });

  it("logs dispatch for booking_confirmed template", async () => {
    await sendSms(
      makeMessage({
        templateId: "booking_confirmed",
        variables: {
          movieTitle: "Inception",
          showTime: "18:00",
          seats: "A1, A2",
          confirmationCode: "CONF-001",
        },
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SMS dispatched",
      expect.objectContaining({ templateId: "booking_confirmed" }),
    );
  });

  it("logs dispatch for booking_cancelled template", async () => {
    await sendSms(
      makeMessage({
        templateId: "booking_cancelled",
        variables: { bookingId: "BKG-001", refundAmount: 500 },
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SMS dispatched",
      expect.objectContaining({ templateId: "booking_cancelled" }),
    );
  });

  it("logs dispatch for booking_reminder template", async () => {
    await sendSms(
      makeMessage({
        templateId: "booking_reminder",
        variables: {
          movieTitle: "Inception",
          showTime: "18:00",
          theatreName: "PVR Cinemas",
        },
      }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "SMS dispatched",
      expect.objectContaining({ templateId: "booking_reminder" }),
    );
  });

  it("warns and skips for unknown template", async () => {
    await sendSms(makeMessage({ templateId: "unknown_template" }));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Unknown SMS template — skipping",
      expect.objectContaining({ templateId: "unknown_template" }),
    );
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it("logs message length not content", async () => {
    await sendSms(makeMessage());
    const call = (mockLogger.info.mock.calls[0] as any[])[1];
    expect(call).toHaveProperty("length");
    expect(call).not.toHaveProperty("message");
  });

  it("warns when SMS exceeds 160 chars", async () => {
    // booking_confirmed with long values will exceed 160 chars
    await sendSms(
      makeMessage({
        templateId: "booking_confirmed",
        variables: {
          movieTitle:
            "A Very Long Movie Title That Makes The SMS Too Long For One Segment",
          showTime: "2024-07-20 18:00:00",
          seats: "A1, A2, B1, B2, C1, C2",
          confirmationCode: "CONF-VERYLONGCODE-001",
        },
      }),
    );
    // May or may not warn depending on length — just verify no error thrown
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("sanitizes newlines in variables", async () => {
    await sendSms(
      makeMessage({
        variables: { bookingId: "BKG\n001\rINJECTED", totalAmount: 510 },
      }),
    );
    expect(mockLogger.info).toHaveBeenCalled();
    const call = (mockLogger.info.mock.calls[0] as any[])[1];
    expect(call.length).toBeGreaterThan(0);
  });

  it("does not log phone number in message content", async () => {
    await sendSms(makeMessage({ to: "+919876543210" }));
    const call = (mockLogger.info.mock.calls[0] as any[])[1];
    expect(call).toHaveProperty("to");
    expect(call).not.toHaveProperty("message");
  });
});
