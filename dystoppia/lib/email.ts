import { EmailClient } from "@azure/communication-email";

const FROM_ADDRESS =
  process.env.AZURE_COMM_FROM_ADDRESS ??
  "DoNotReply@ba0edab7-f474-4ace-a484-cb8557f76020.azurecomm.net";

export function isOtpEmailConfigured() {
  return Boolean(process.env.AZURE_COMM_CONNECTION_STRING);
}

export function getDevOtp(code: string) {
  if (process.env.NODE_ENV === "production" || isOtpEmailConfigured()) {
    return undefined;
  }

  console.info(`[dev-email] Azure Email is not configured. Use OTP ${code}`);
  return code;
}

function getClient(): EmailClient {
  const connectionString = process.env.AZURE_COMM_CONNECTION_STRING;
  if (!connectionString) throw new Error("AZURE_COMM_CONNECTION_STRING is not set");
  return new EmailClient(connectionString);
}

export async function sendOtpEmail(to: string, code: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const client = getClient();

  const isReset = type === "RESET_PASSWORD";
  const subject = isReset ? "Reset your Dystoppia password" : "Verify your Dystoppia email";
  const heading = isReset ? "Password Reset" : "Email Verification";
  const body = isReset
    ? "You requested a password reset. Use the code below to set a new password."
    : "Welcome to Dystoppia. Use the code below to verify your email and activate your account.";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#09090E;margin:0;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#12121A;border:1px solid #2E2E40;border-radius:16px;padding:40px;">
    <h1 style="color:#EEEEFF;font-size:28px;font-weight:700;margin:0 0 4px;">Dystoppia</h1>
    <p style="color:#9494B8;font-size:13px;margin:0 0 32px;">Adaptive knowledge learning</p>
    <h2 style="color:#EEEEFF;font-size:18px;font-weight:600;margin:0 0 8px;">${heading}</h2>
    <p style="color:#9494B8;font-size:14px;margin:0 0 32px;">${body}</p>
    <div style="background:#09090E;border:1px solid #2E2E40;border-radius:12px;padding:24px;text-align:center;margin:0 0 32px;">
      <span style="color:#818CF8;font-size:36px;font-weight:700;letter-spacing:10px;">${code}</span>
    </div>
    <p style="color:#4B4B6B;font-size:12px;margin:0;">This code expires in <strong style="color:#9494B8;">10 minutes</strong> and can only be used once.<br>If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

  const message = {
    senderAddress: FROM_ADDRESS,
    recipients: { to: [{ address: to }] },
    content: { subject, html },
  };

  const poller = await client.beginSend(message);
  await poller.pollUntilDone();
}
