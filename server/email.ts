import { db } from './db.ts';
import { escapeHtml } from './security.ts';

export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  eventType: string;
  dedupKey?: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface EmailSendResult {
  delivered: boolean;
  status: 'sent' | 'failed' | 'skipped_unconfigured';
  messageId?: string;
  error?: string;
}

function buildBrandedTemplate(opts: SendEmailOptions): string {
  const safeHeadline = escapeHtml(opts.headline);
  const safeCtaLabel = opts.ctaLabel ? escapeHtml(opts.ctaLabel) : '';
  const safeCtaUrl = opts.ctaUrl ? escapeHtml(opts.ctaUrl) : '';

  const ctaBlock =
    safeCtaLabel && safeCtaUrl
      ? `<div style="margin:24px 0 8px 0;text-align:center;">
           <a href="${safeCtaUrl}" style="display:inline-block;background-color:#F97316;color:#FFFFFF;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;letter-spacing:0.01em;">
             ${safeCtaLabel}
           </a>
         </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safeHeadline} — AIDOMART Verified Multi-Vendor Marketplace&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 2px 8px rgba(11,31,58,0.06);">
          <tr>
            <td style="background-color:#0B1F3A;padding:22px 30px;border-bottom:3px solid #F97316;">
              <div style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:-0.02em;">AIDO<span style="color:#F97316;">MART</span></div>
              <div style="color:#CBD5E1;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">Verified Multi-Vendor Marketplace</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#0B1F3A;line-height:1.3;">${safeHeadline}</h1>
              <div style="font-size:15px;line-height:1.65;color:#334155;">
                ${opts.bodyHtml}
              </div>
              ${ctaBlock}
              <p style="margin:26px 0 0 0;font-size:14px;line-height:1.6;color:#1E293B;">
                Thank you for choosing <strong>AIDOMART</strong>.<br/>
                Warm regards,<br/>
                <strong>The AIDOMART Team</strong>
              </p>
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 18px 0;" />
              <p style="margin:0 0 6px 0;font-size:12px;color:#64748B;line-height:1.5;">
                This is an official automated message from AIDOMART. For your security, never share your verification codes with anyone.
              </p>
              <p style="margin:0;font-size:12px;color:#64748B;line-height:1.5;">
                Need assistance? Contact AIDOMART Support (Michael Aidoo) · Phone: 0205283752 · Email: aidoomichael60@gmail.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTransactionalEmail(opts: SendEmailOptions): Promise<EmailSendResult> {
  // Prevent unnecessary duplicate emails within 10 minutes for same dedup_key
  if (opts.dedupKey) {
    const existing = db
      .prepare(
        `SELECT id, status, brevo_message_id FROM email_logs
         WHERE dedup_key = ? AND status = 'sent'
           AND created_at >= datetime('now', '-10 minutes')
         LIMIT 1`
      )
      .get(opts.dedupKey) as { id: number; status: string; brevo_message_id: string | null } | undefined;

    if (existing) {
      return {
        delivered: true,
        status: 'sent',
        messageId: existing.brevo_message_id ?? undefined,
      };
    }
  }

  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || 'aidoomichael60@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'AIDOMART';

  if (!apiKey) {
    const errMsg = 'BREVO_API_KEY is not configured in server environment variables.';
    db.prepare(`
      INSERT INTO email_logs (recipient_email, subject, event_type, dedup_key, status, error_message, attempts)
      VALUES (?, ?, ?, ?, 'skipped_unconfigured', ?, 0)
    `).run(opts.toEmail, opts.subject, opts.eventType, opts.dedupKey ?? null, errMsg);
    return {
      delivered: false,
      status: 'skipped_unconfigured',
      error: errMsg,
    };
  }

  const htmlContent = buildBrandedTemplate(opts);
  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.toEmail, name: opts.toName || opts.toEmail }],
    subject: opts.subject,
    htmlContent,
  };

  let lastError = 'Unknown Brevo error';
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const data = (await response.json()) as { messageId?: string };
        db.prepare(`
          INSERT INTO email_logs (recipient_email, subject, event_type, dedup_key, status, brevo_message_id, attempts)
          VALUES (?, ?, ?, ?, 'sent', ?, ?)
        `).run(
          opts.toEmail,
          opts.subject,
          opts.eventType,
          opts.dedupKey ?? null,
          data.messageId ?? null,
          attempt
        );
        return {
          delivered: true,
          status: 'sent',
          messageId: data.messageId,
        };
      }

      const textErr = await response.text().catch(() => '');
      lastError = `Brevo HTTP ${response.status}: ${textErr.slice(0, 200)}`;
      if (response.status < 500) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error calling Brevo API';
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  db.prepare(`
    INSERT INTO email_logs (recipient_email, subject, event_type, dedup_key, status, error_message, attempts)
    VALUES (?, ?, ?, ?, 'failed', ?, ?)
  `).run(opts.toEmail, opts.subject, opts.eventType, opts.dedupKey ?? null, lastError, maxAttempts);

  return {
    delivered: false,
    status: 'failed',
    error: lastError,
  };
}

export async function sendAdminAlertEmail(opts: {
  subject: string;
  eventType: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  dedupKey?: string;
}): Promise<void> {
  const admins = db
    .prepare(`SELECT id, email, full_name FROM users WHERE role = 'admin'`)
    .all() as Array<{ id: number; email: string; full_name: string }>;

  for (const admin of admins) {
    if (!admin.email) continue;
    await sendTransactionalEmail({
      toEmail: admin.email,
      toName: admin.full_name || 'AIDOMART Admin',
      subject: opts.subject,
      eventType: opts.eventType,
      dedupKey: opts.dedupKey ? `${opts.dedupKey}_${admin.id}` : undefined,
      headline: opts.headline,
      bodyHtml: opts.bodyHtml,
      ctaLabel: opts.ctaLabel,
      ctaUrl: opts.ctaUrl,
    }).catch((err) => {
      console.error('Admin alert email failed:', err);
    });
  }
}

