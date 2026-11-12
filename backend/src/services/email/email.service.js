import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let transporter = null;

/** One reusable SMTP transport, created on first use. */
function getTransporter() {
  if (!transporter) {
    const { host, port, secure, requireTls, user, pass } = env.email.smtp;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure && requireTls,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: env.email.timeoutMs,
      greetingTimeout: env.email.timeoutMs,
      socketTimeout: env.email.timeoutMs,
    });
  }
  return transporter;
}

/**
 * Sends one email over SMTP with nodemailer.
 *
 * Without SMTP_HOST (local development) nothing is sent; the email, including
 * its link, is printed in the server console instead. Production refuses to
 * start without it (see config/env.js).
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!env.email.smtp.host) {
    logger.warn(`[email not sent: SMTP_HOST is not set]\n  To: ${to}\n  Subject: ${subject}\n${text}`);
    return;
  }
  await getTransporter().sendMail({ from: env.email.from, to, subject, html, text });
}

/**
 * Sends without making the caller wait or fail. Used where the response must
 * not depend on whether an email was sent (e.g. "forgot password" must answer
 * the same for registered and unknown emails), and so an SMTP outage never
 * breaks registration. Failures are logged (nodemailer never includes the password).
 */
export function sendEmailInBackground(message) {
  sendEmail(message).catch((err) => logger.error(`Email to ${message.to} failed: ${err.message}`));
}
