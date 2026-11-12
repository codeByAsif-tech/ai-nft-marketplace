import { env } from '../../config/env.js';

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Simple, email-client-safe layout: inline styles, one button, plain-text link as a fallback. */
function layout({ heading, intro, buttonLabel, link, outro }) {
  const app = escapeHtml(env.email.appName);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
            <tr><td style="font-size:20px;font-weight:bold;padding-bottom:16px;">${app}</td></tr>
            <tr><td style="font-size:18px;font-weight:bold;padding-bottom:12px;">${escapeHtml(heading)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px;">${escapeHtml(intro)}</td></tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${escapeHtml(link)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
              </td>
            </tr>
            <tr><td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:16px;">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(link)}" style="color:#7c3aed;word-break:break-all;">${escapeHtml(link)}</a></td></tr>
            <tr><td style="font-size:13px;line-height:1.6;color:#6b7280;">${escapeHtml(outro)}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verificationEmail({ name, link }) {
  const hours = env.email.verifyTtlHours;
  const intro = `Hi ${name}, please confirm your email address to activate your ${env.email.appName} account.`;
  const outro = `This link expires in ${hours} hour${hours === 1 ? '' : 's'}. If you didn't create an account, you can ignore this email.`;
  return {
    subject: `Verify your email for ${env.email.appName}`,
    html: layout({ heading: 'Confirm your email', intro, buttonLabel: 'Verify email', link, outro }),
    text: `${intro}\n\nVerify your email: ${link}\n\n${outro}`,
  };
}

export function passwordResetEmail({ name, link }) {
  const minutes = env.email.resetTtlMinutes;
  const intro = `Hi ${name}, we received a request to reset the password of your ${env.email.appName} account.`;
  const outro = `This link expires in ${minutes} minutes and can be used once. If you didn't ask for a reset, ignore this email: your password stays the same.`;
  return {
    subject: `Reset your ${env.email.appName} password`,
    html: layout({ heading: 'Reset your password', intro, buttonLabel: 'Reset password', link, outro }),
    text: `${intro}\n\nReset your password: ${link}\n\n${outro}`,
  };
}
