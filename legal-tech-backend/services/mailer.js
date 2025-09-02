// services/mailer.js
import nodemailer from "nodemailer";

let transporter;

/** Build transporter from env */
function buildTransport() {
    const transport = process.env.MAIL_TRANSPORT || "gmail";
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    const from = process.env.MAIL_FROM || `LegalTech <${user}>`;

    if (transport === "gmail") {
        if (!user || !pass) {
            throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD missing in env");
        }
        return nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass },
        });
    }

    throw new Error(`Unsupported MAIL_TRANSPORT=${transport}`);
}

export async function initMailer() {
    transporter = buildTransport();
    await transporter.verify(); // helpful check
    return transporter;
}

export async function sendMail({ to, subject, text, html }) {
    if (!transporter) transporter = buildTransport();
    return transporter.sendMail({
        from: process.env.MAIL_FROM || `LegalTech <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
        html,
    });
}

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
