import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

export type MailOutcome = {
  sent: boolean;
  to: string;
  /** Why it wasn't sent — shown on the dashboard, never spoken. */
  note?: string;
};

export function mailEnabled(): boolean {
  return Boolean(config.mailUser && config.mailAppPassword);
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.mailUser, pass: config.mailAppPassword },
  });
  return transport;
}

/** Send one plain email from the configured Gmail. Never throws — a mail failure must not lose the call record. */
export async function sendMail(to: string, subject: string, text: string): Promise<MailOutcome> {
  if (config.demoMode) return { sent: false, to, note: "Demo mode: no real email is sent" };
  if (!mailEnabled()) return { sent: false, to, note: "Gmail sending isn't set up (MAIL_USER / MAIL_APP_PASSWORD)" };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { sent: false, to, note: "No valid email address for this lead" };
  try {
    await getTransport().sendMail({
      from: `"${config.mailFromName || config.companyName}" <${config.mailUser}>`,
      to,
      subject,
      text,
    });
    return { sent: true, to };
  } catch (error) {
    transport = null; // rebuild the connection next time
    return { sent: false, to, note: error instanceof Error ? error.message : "Mail failed" };
  }
}

/** The email a caller gets after asking for the calendar link on the call. */
export function calendarLinkEmail(name: string): { subject: string; text: string } {
  const link = config.calBookingUrl;
  return {
    subject: `Pick a time for your demo with ${config.founderName}`,
    text: [
      `Hi ${name},`,
      "",
      `Thanks for speaking with ${config.companyName}'s assistant. As promised, here is the link to pick a time for a 15-minute demo with ${config.founderName}:`,
      "",
      link,
      "",
      "Choose whatever suits you — you'll get a calendar invite and a reminder straight away.",
      "",
      `Best,`,
      `${config.founderName}`,
      `${config.companyName}`,
    ].join("\n"),
  };
}
