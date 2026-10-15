/** Sends the calendar-link email to yourself so you can check Gmail sending works:  npm run mail:test */
import { config } from "../src/config.js";
import { calendarLinkEmail, mailEnabled, sendMail } from "../src/mail/mailer.js";

if (!mailEnabled()) {
  console.error("Set MAIL_USER and MAIL_APP_PASSWORD in .env first.");
  process.exit(1);
}
const to = process.argv[2] || config.mailUser;
const { subject, text } = calendarLinkEmail("there");
const outcome = await sendMail(to, `[TEST] ${subject}`, text);
console.log(outcome.sent ? `Sent a test email to ${to}. Check the inbox (and spam).` : `Not sent: ${outcome.note}`);
process.exit(outcome.sent ? 0 : 1);
