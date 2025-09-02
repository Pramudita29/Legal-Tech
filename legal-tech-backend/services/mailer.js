// services/mailer.js
import nodemailer from "nodemailer";

const {
  MAIL_TRANSPORT = "gmail",
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  MAIL_FROM = `LegalTech <${GMAIL_USER}>`,
} = process.env;

let transporter;

/** Build transporter from env */
function buildTransport() {
  if (MAIL_TRANSPORT === "gmail") {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD missing in env");
    }
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  // (Optional) add SMTP config here for firm-specific creds later
  throw new Error(`Unsupported MAIL_TRANSPORT=${MAIL_TRANSPORT}`);
}

export async function initMailer() {
  transporter = buildTransport();
  // Verify once on boot (helpful logs)
  await transporter.verify();
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) transporter = buildTransport();
  return transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

/** Simple invite template for a newly added lawyer */
export async function sendLawyerInvite({
  to,
  firmName,
  adminName,
  email,
  tempPassword,
  appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5000",
}) {
  const subject = `${firmName} – Your account details`;
  const text = [
    `Namaste,`,
    ``,
    `You have been added as a lawyer to ${firmName} by ${adminName}.`,
    `Login email: ${email}`,
    `Temporary password: ${tempPassword}`,
    ``,
    `Login here: ${appBaseUrl}`,
    ``,
    `For security, please log in and change your password immediately.`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <p>Namaste,</p>
      <p>You have been added as a lawyer to <b>${firmName}</b> by ${adminName}.</p>
      <p><b>Login email:</b> ${email}<br/>
         <b>Temporary password:</b> <code>${tempPassword}</code></p>
      <p><a href="${appBaseUrl}" target="_blank" rel="noopener">Login here</a></p>
      <p style="color:#555">For security, please log in and change your password immediately.</p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}
