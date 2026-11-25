import { Router } from 'express';
import type { Request, Response, CookieOptions } from 'express';
import { db, createNotification, recordActivityLog } from '../db.ts';
import {
  createRateLimiter,
  escapeHtml,
  generateOtpCode,
  generateRandomToken,
  hashPassword,
  hashToken,
  parseCookies,
  sanitizeText,
  signOAuthState,
  signSessionCookie,
  validatePasswordStrength,
  verifyOAuthState,
  verifyPassword,
} from '../security.ts';
import { sendAdminAlertEmail, sendTransactionalEmail } from '../email.ts';
import { getAppBaseUrl, getPlatformSetting, requireAuth } from '../middleware.ts';

export const authRouter = Router();

const authLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 12,
  prefix: 'auth',
});

const verifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 15,
  prefix: 'verify',
});

function buildOtpCardHtml(code: string, validMinutes: number): string {
  return `
    <div style="margin:22px 0;padding:18px 20px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;text-align:center;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748B;margin-bottom:8px;">
        Your Verification Code
      </div>
      <div style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:800;letter-spacing:8px;color:#0B1F3A;margin:4px 0;">
        ${escapeHtml(code)}
      </div>
      <div style="font-size:12px;color:#64748B;margin-top:8px;">
        This code expires in ${validMinutes} minutes
      </div>
    </div>
  `;
}

function formatSellerProfile(row: Record<string, any> | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    legalName: row.legal_name,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    description: row.description,
    categories: JSON.parse(row.categories_json || '[]'),
    physicalAddress: row.physical_address,
    locationCity: row.location_city,
    deliveryPickupNotes: row.delivery_pickup_notes,
    storefrontImage: row.storefront_image,
    businessPhotos: JSON.parse(row.business_photos_json || '[]'),
    applicationStatus: row.application_status,
    verifiedBadge: Boolean(row.verified_badge),
    adminFeedback: row.admin_feedback,
    physicalInspectionConducted: Boolean(row.physical_inspection_conducted),
    physicalInspectionDate: row.physical_inspection_date,
    physicalInspectionNotes: row.physical_inspection_notes,
    reviewedByName: row.reviewed_by_name ?? null,
    reviewedAt: row.reviewed_at,
    paymentSettings: {
      momoEnabled: Boolean(row.momo_enabled),
      momoProvider: row.momo_provider || '',
      momoAccountName: row.momo_account_name || '',
      momoNumber: row.momo_number || '',
      momoInstructions: row.momo_instructions || '',
      bankEnabled: Boolean(row.bank_enabled),
      bankName: row.bank_name || '',
      bankAccountName: row.bank_account_name || '',
      bankAccountNumber: row.bank_account_number || '',
      bankBranch: row.bank_branch || '',
      bankInstructions: row.bank_instructions || '',
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isHttpsRequest(req: Request): boolean {
  const fwdProto = (req.headers['x-forwarded-proto'] as string) || '';
  if (fwdProto) {
    return fwdProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  if (req.secure) return true;
  const origin = (req.headers.origin as string) || (req.headers.referer as string) || '';
  if (origin.startsWith('https://')) return true;
  if (origin.startsWith('http://')) return false;
  const host = (req.headers.host || '').toLowerCase();
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function isEmbeddedCrossSiteRequest(req: Request): boolean {
  const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  return secFetchDest === 'iframe' || host.endsWith('.run.app');
}

function getCookieOptions(req: Request, maxAge: number): CookieOptions {
  const https = isHttpsRequest(req);
  const embedded = isEmbeddedCrossSiteRequest(req);
  return {
    httpOnly: true,
    sameSite: https && embedded ? 'none' : 'lax',
    secure: https,
    maxAge,
    path: '/',
  };
}

function createSessionAndSetCookie(req: Request, res: Response, userId: number) {
  const sessionId = generateRandomToken(32);
  const csrfToken = generateRandomToken(24);
  const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, userId, csrfToken, expiresAt, createdAt);

  const signed = signSessionCookie(sessionId);
  res.cookie('aidomart_session', signed, getCookieOptions(req, sessionTtlMs));

  return { csrfToken, sessionCreatedAt: createdAt };
}

function describeUserAgent(uaRaw: string): string {
  const ua = uaRaw || '';
  let browser = 'Web Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Unknown Device';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows NT/i.test(ua)) os = 'Windows PC';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

async function recordLoginDeviceAndNotify(
  req: Request,
  res: Response,
  user: { id: number; email: string; full_name: string; role: 'buyer' | 'seller' | 'admin' }
) {
  const cookies = parseCookies(req.headers.cookie);
  let deviceToken = cookies['aidomart_device'];

  if (!deviceToken || deviceToken.length < 16) {
    deviceToken = generateRandomToken(24);
    res.cookie('aidomart_device', deviceToken, getCookieOptions(req, 365 * 24 * 60 * 60 * 1000));
  }

  const ua = sanitizeText(req.headers['user-agent'] || '', 300);
  const ip = sanitizeText(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress || '',
    80
  );
  const deviceLabel = describeUserAgent(ua);
  const deviceHash = hashToken(`${user.id}:${deviceToken}`);

  const existingDevicesCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM known_devices WHERE user_id = ?`).get(user.id) as {
      cnt: number;
    }
  ).cnt;

  const known = db
    .prepare(`SELECT id FROM known_devices WHERE user_id = ? AND device_hash = ?`)
    .get(user.id, deviceHash) as { id: number } | undefined;

  const dashboardLink =
    user.role === 'admin'
      ? '/admin'
      : user.role === 'seller'
        ? '/seller-dashboard'
        : '/buyer-dashboard';

  if (!known) {
    db.prepare(
      `INSERT INTO known_devices (user_id, device_hash, device_label, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?)`
    ).run(user.id, deviceHash, deviceLabel, ua, ip);

    if (existingDevicesCount > 0) {
      createNotification({
        userId: user.id,
        title: 'New Device Sign-In Alert',
        message: `A sign-in was detected from a different device: ${deviceLabel}${ip ? ` (${ip})` : ''}. If this was not you, reset your password immediately.`,
        link: dashboardLink,
        type: 'security_alert',
      });

      const baseUrl = getAppBaseUrl(req);
      await sendTransactionalEmail({
        toEmail: user.email,
        toName: user.full_name,
        subject: 'AIDOMART Security Alert — New device sign-in detected',
        eventType: 'new_device_login',
        headline: 'New Device Sign-In Detected',
        bodyHtml: `
          <p>Hello ${escapeHtml(user.full_name)},</p>
          <p>A sign-in to your <strong>AIDOMART</strong> account just occurred from a new or unrecognized device:</p>
          <div style="margin:16px 0;padding:14px 16px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;color:#1E293B;">
            <strong>Device:</strong> ${escapeHtml(deviceLabel)}<br/>
            ${ip ? `<strong>IP Address:</strong> ${escapeHtml(ip)}<br/>` : ''}
            <strong>Time (UTC):</strong> ${escapeHtml(new Date().toUTCString())}
          </div>
          <p style="font-size:13px;color:#475569;">If this was you, no further action is needed. If you do not recognize this sign-in, please reset your password right away to protect your account.</p>
        `,
        ctaLabel: 'Reset Password If Not You',
        ctaUrl: `${baseUrl}/reset-password?email=${encodeURIComponent(user.email)}`,
      }).catch(() => {});
    } else {
      createNotification({
        userId: user.id,
        title: 'Account Sign-In',
        message: `Signed in successfully from ${deviceLabel}.`,
        link: dashboardLink,
        type: 'login',
      });
    }
  } else {
    db.prepare(
      `UPDATE known_devices SET last_seen_at = datetime('now'), device_label = ?, user_agent = ?, ip_address = ? WHERE id = ?`
    ).run(deviceLabel, ua, ip, known.id);

    createNotification({
      userId: user.id,
      title: 'Account Sign-In',
      message: `Signed in from recognized device: ${deviceLabel}.`,
      link: dashboardLink,
      type: 'login',
    });
  }
}

authRouter.get('/me', (req: Request, res: Response) => {
  const promoCreatorPolicy = getPlatformSetting('promo_creator_policy', 'seller');
  const requireLoginEmailOtp = getPlatformSetting('require_login_email_otp', 'true') === 'true';

  if (!req.authUser) {
    return res.json({
      user: null,
      csrfToken: null,
      settings: { promoCreatorPolicy, requireLoginEmailOtp },
    });
  }

  let sellerProfile = null;
  if (req.authUser.role === 'seller') {
    const sp = db
      .prepare(
        `SELECT sp.*, u2.full_name AS reviewed_by_name
         FROM seller_profiles sp
         LEFT JOIN users u2 ON u2.id = sp.reviewed_by_id
         WHERE sp.user_id = ?`
      )
      .get(req.authUser.id) as Record<string, any> | undefined;
    sellerProfile = formatSellerProfile(sp);
  }

  return res.json({
    user: { ...req.authUser, sellerProfile },
    csrfToken: req.csrfToken,
    settings: { promoCreatorPolicy, requireLoginEmailOtp },
  });
});

authRouter.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const email = sanitizeText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = sanitizeText(req.body?.fullName, 120);
    const phone = sanitizeText(req.body?.phone, 40);
    const roleRaw = sanitizeText(req.body?.role, 20);

    // Strictly allow only buyer or seller registration (never admin)
    if (roleRaw !== 'buyer' && roleRaw !== 'seller') {
      return res.status(400).json({ error: 'Please select a valid account type (Buyer or Seller).' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!fullName || fullName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full legal name.' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    let businessName = '';
    let businessDescription = '';
    let categories: string[] = [];
    let physicalAddress = '';
    let locationCity = '';
    let deliveryPickupNotes = '';
    let saveAsDraft = false;

    if (roleRaw === 'seller') {
      businessName = sanitizeText(req.body?.businessName, 140);
      businessDescription = sanitizeText(req.body?.businessDescription, 1000);
      categories = Array.isArray(req.body?.categories)
        ? req.body.categories.map((c: unknown) => sanitizeText(c, 60)).filter(Boolean)
        : [];
      physicalAddress = sanitizeText(req.body?.physicalAddress, 250);
      locationCity = sanitizeText(req.body?.locationCity, 100);
      deliveryPickupNotes = sanitizeText(req.body?.deliveryPickupNotes, 400);
      saveAsDraft = Boolean(req.body?.saveAsDraft);

      if (!phone) {
        return res.status(400).json({ error: 'Telephone number is required for seller accounts.' });
      }
      if (!businessName) {
        return res.status(400).json({ error: 'Business or trading name is required for seller registration.' });
      }
      if (!saveAsDraft && (!physicalAddress || !businessDescription)) {
        return res.status(400).json({
          error: 'Please provide your business description and physical address, or save as Draft.',
        });
      }
    }

    const passwordHash = hashPassword(password);
    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO users (email, password_hash, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status)
           VALUES (?, ?, ?, ?, ?, 0, 1, 1, 'Active')`
        )
        .run(email, passwordHash, fullName, phone || null, roleRaw);

      const userId = Number(result.lastInsertRowid);

      if (roleRaw === 'seller') {
        const appStatus = saveAsDraft ? 'Draft' : 'Pending Review';
        const spRes = db
          .prepare(
            `INSERT INTO seller_profiles (
              user_id, legal_name, business_name, email, phone, description,
              categories_json, physical_address, location_city, delivery_pickup_notes,
              application_status, verified_badge
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
          )
          .run(
            userId,
            fullName,
            businessName,
            email,
            phone,
            businessDescription,
            JSON.stringify(categories),
            physicalAddress,
            locationCity,
            deliveryPickupNotes,
            appStatus
          );

        db.prepare(
          `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
           VALUES (?, ?, 'Seller Registration Created', NULL, ?, 0, 0, ?)`
        ).run(
          Number(spRes.lastInsertRowid),
          userId,
          appStatus,
          saveAsDraft ? 'Saved as Draft during registration.' : 'Submitted seller application for admin review.'
        );
      }

      return userId;
    });

    const userId = tx();

    // Create email verification code & token
    const rawCode = generateOtpCode();
    const tokenHash = hashToken(`${email}:${rawCode}`);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at)
       VALUES (?, 'email_verify', ?, ?)`
    ).run(userId, tokenHash, expiresAt);

    const baseUrl = getAppBaseUrl(req);
    const verifyUrl = `${baseUrl}/verify-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(rawCode)}`;

    const emailRes = await sendTransactionalEmail({
      toEmail: email,
      toName: fullName,
      subject: 'Welcome to AIDOMART — Please verify your email address',
      eventType: `register_${roleRaw}`,
      dedupKey: `register_${userId}_${rawCode}`,
      headline: `Welcome to AIDOMART, ${fullName}!`,
      bodyHtml: `
        <p>Hello ${escapeHtml(fullName)},</p>
        <p>Thank you for registering a <strong>${escapeHtml(roleRaw === 'seller' ? 'Seller' : 'Buyer')}</strong> account on <strong>AIDOMART</strong>! We are delighted to welcome you to our marketplace.</p>
        <p>${
          roleRaw === 'seller'
            ? 'Before our review team processes your seller application, please confirm your email address by entering the 6-digit verification code below (or by clicking the verification button):'
            : 'To protect your account and get started shopping with verified independent sellers, please confirm your email address using the 6-digit verification code below (or by clicking the verification button):'
        }</p>
        ${buildOtpCardHtml(rawCode, 15)}
        ${
          roleRaw === 'seller'
            ? '<p style="font-size:13px;color:#475569;">Once your email is verified, you can sign in to upload any supporting verification documents in your Seller Dashboard while our administrators review your application.</p>'
            : ''
        }
        <p style="font-size:13px;color:#64748B;">If you did not create an account on AIDOMART, please disregard this email.</p>
      `,
      ctaLabel: 'Verify Email Address',
      ctaUrl: verifyUrl,
    });

    // New sign-up notifications & seller approval email alerts go strictly to the sole Administrator
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const admin of admins) {
      if (roleRaw === 'seller') {
        createNotification({
          userId: admin.id,
          title: saveAsDraft ? 'New Seller Sign-Up (Draft)' : 'New Seller Application Submitted',
          message: saveAsDraft
            ? `${businessName} (${fullName}, ${email}) registered a seller account (Draft).`
            : `${businessName} (${fullName}, ${email}) submitted a new seller application for review.`,
          link: '/admin?tab=sellers',
          type: 'seller_application',
        });
      } else {
        createNotification({
          userId: admin.id,
          title: 'New Buyer Sign-Up',
          message: `${fullName} (${email}) created a new buyer account on AIDOMART.`,
          link: '/admin?tab=users',
          type: 'buyer_signup',
        });
      }
    }

    if (roleRaw === 'seller') {
      const appStateLabel = saveAsDraft ? 'Draft' : 'Pending Review';
      await sendAdminAlertEmail({
        subject: `AIDOMART Admin Alert: New Seller Registered — ${businessName}`,
        eventType: 'admin_new_seller_alert',
        dedupKey: `admin_new_seller_${userId}`,
        headline: `New Seller Registration (${appStateLabel})`,
        bodyHtml: `
          <p>A new seller account has registered on <strong>AIDOMART</strong> and awaits your approval.</p>
          <div style="margin:16px 0;padding:14px 16px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;color:#1E293B;line-height:1.7;">
            <strong>Business Name:</strong> ${escapeHtml(businessName)}<br/>
            <strong>Legal Name:</strong> ${escapeHtml(fullName)}<br/>
            <strong>Email:</strong> ${escapeHtml(email)}<br/>
            <strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}<br/>
            <strong>Location:</strong> ${escapeHtml([physicalAddress, locationCity].filter(Boolean).join(', ') || 'Not provided yet')}<br/>
            <strong>Application Status:</strong> ${escapeHtml(appStateLabel)}
          </div>
          <p style="font-size:13px;color:#475569;">Click below to open Seller Verification and approve or review their application.</p>
        `,
        ctaLabel: 'Review & Approve Seller',
        ctaUrl: `${baseUrl}/admin?tab=sellers`,
      });
    }

    recordActivityLog({
      actorUserId: userId,
      actorEmail: email,
      actorRole: roleRaw,
      eventType: roleRaw === 'seller' ? 'seller_registered' : 'buyer_registered',
      summary:
        roleRaw === 'seller'
          ? `New seller registered: ${businessName} (${fullName})`
          : `New buyer registered: ${fullName}`,
      details: roleRaw === 'seller' ? `Status: ${saveAsDraft ? 'Draft' : 'Pending Review'}` : email,
    });

    return res.status(201).json({
      message: emailRes.delivered
        ? 'Account created. A verification email has been sent to your email address.'
        : 'Account created, but we could not send your verification email right now. Please try resending in a moment.',
      email,
      role: roleRaw,
      emailDelivered: emailRes.delivered,
      emailStatus: emailRes.status,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Unable to complete registration right now.' });
  }
});

authRouter.post('/verify-email', verifyLimiter, (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const code = sanitizeText(req.body?.code, 20);

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const user = db.prepare(`SELECT id, email_verified FROM users WHERE email = ?`).get(email) as
    | { id: number; email_verified: number }
    | undefined;

  if (!user) {
    return res.status(400).json({ error: 'Invalid verification details.' });
  }
  if (user.email_verified) {
    return res.json({ message: 'Your email address is already verified. You may log in.' });
  }

  const tokenRow = db
    .prepare(
      `SELECT id, token_hash, attempts, max_attempts, expires_at
       FROM verification_tokens
       WHERE user_id = ? AND purpose = 'email_verify' AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id) as
    | { id: number; token_hash: string; attempts: number; max_attempts: number; expires_at: string }
    | undefined;

  if (!tokenRow) {
    return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This verification code has expired. Please request a new code.' });
  }
  if (tokenRow.attempts >= tokenRow.max_attempts) {
    return res.status(429).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' });
  }

  const suppliedHash = hashToken(`${email}:${code}`);
  if (suppliedHash !== tokenRow.token_hash) {
    db.prepare(`UPDATE verification_tokens SET attempts = attempts + 1 WHERE id = ?`).run(tokenRow.id);
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  db.transaction(() => {
    db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE id = ?`).run(tokenRow.id);
    db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);
  })();

  recordActivityLog({
    actorUserId: user.id,
    actorEmail: email,
    actorRole: 'user',
    eventType: 'email_verified',
    summary: `Verified email address: ${email}`,
  });

  return res.json({ message: 'Email verified successfully. You can now sign in to AIDOMART.' });
});

authRouter.post('/resend-verification', authLimiter, async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const user = db.prepare(`SELECT id, full_name, email_verified FROM users WHERE email = ?`).get(email) as
    | { id: number; full_name: string; email_verified: number }
    | undefined;

  if (!user) {
    return res.json({ message: 'If an unverified account exists for this email, a verification email has been triggered.' });
  }
  if (user.email_verified) {
    return res.status(400).json({ error: 'This email address is already verified.' });
  }

  db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = 'email_verify' AND used_at IS NULL`).run(user.id);

  const rawCode = generateOtpCode();
  const tokenHash = hashToken(`${email}:${rawCode}`);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'email_verify', ?, ?)`).run(
    user.id,
    tokenHash,
    expiresAt
  );

  const baseUrl = getAppBaseUrl(req);
  const verifyUrl = `${baseUrl}/verify-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(rawCode)}`;

  const emailRes = await sendTransactionalEmail({
    toEmail: email,
    toName: user.full_name,
    subject: 'Your AIDOMART email verification code',
    eventType: 'resend_verification',
    headline: 'Confirm Your Email Address',
    bodyHtml: `
      <p>Hello ${escapeHtml(user.full_name)},</p>
      <p>Thank you for joining <strong>AIDOMART</strong>. As requested, here is a fresh 6-digit verification code to confirm your email address and activate your account:</p>
      ${buildOtpCardHtml(rawCode, 15)}
      <p style="font-size:13px;color:#64748B;">You can either enter this code on the verification page or click the button below. If you did not request this email, no further action is needed.</p>
    `,
    ctaLabel: 'Verify Email Address',
    ctaUrl: verifyUrl,
  });

  return res.json({
    message: emailRes.delivered
      ? 'A new verification email has been sent to your email address.'
      : 'We could not deliver your verification email right now. Please try again shortly.',
    emailDelivered: emailRes.delivered,
    emailStatus: emailRes.status,
  });
});

function normalizePhoneCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return trimmed ? [trimmed] : [];

  const set = new Set<string>([trimmed, digits, `+${digits}`]);

  // Handle common local leading zero after country code (e.g. +2330205... -> +233205...)
  if (digits.startsWith('2330') && digits.length >= 12) {
    const fixed = `233${digits.slice(4)}`;
    set.add(fixed);
    set.add(`+${fixed}`);
    set.add(`0${digits.slice(4)}`);
  } else if (digits.startsWith('233') && digits.length >= 11) {
    set.add(`0${digits.slice(3)}`);
  } else if (digits.startsWith('0') && digits.length >= 9) {
    set.add(`233${digits.slice(1)}`);
    set.add(`+233${digits.slice(1)}`);
  }

  return Array.from(set);
}

authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const phoneInput = sanitizeText(req.body?.phone, 40);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if ((!email && !phoneInput) || !password) {
    return res.status(400).json({ error: 'Email or phone number and password are required.' });
  }

  type LoginUserRow = {
    id: number;
    email: string;
    password_hash: string;
    full_name: string;
    phone: string | null;
    role: 'buyer' | 'seller' | 'admin';
    email_verified: number;
    login_2fa_enabled: number;
    sound_enabled: number;
    account_status: 'Active' | 'Restricted' | 'Suspended';
  };

  let user: LoginUserRow | undefined;

  if (email) {
    const candidate = db
      .prepare(
        `SELECT id, email, password_hash, full_name, phone, role, email_verified,
                login_2fa_enabled, sound_enabled, account_status
         FROM users WHERE email = ?`
      )
      .get(email) as LoginUserRow | undefined;

    if (candidate && verifyPassword(password, candidate.password_hash)) {
      user = candidate;
    }
  } else if (phoneInput) {
    const candidates = normalizePhoneCandidates(phoneInput);
    if (candidates.length > 0) {
      const placeholders = candidates.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT id, email, password_hash, full_name, phone, role, email_verified,
                  login_2fa_enabled, sound_enabled, account_status
           FROM users
           WHERE phone IS NOT NULL
             AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') IN (${placeholders})`
        )
        .all(...candidates) as LoginUserRow[];

      user = rows.find((row) => verifyPassword(password, row.password_hash));
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid login credentials.' });
  }

  if (user.account_status === 'Suspended') {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact AIDOMART support.' });
  }

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email address before logging in.',
      requiresEmailVerification: true,
      email: user.email,
    });
  }

  const requireGlobalLoginOtp = getPlatformSetting('require_login_email_otp', 'true') === 'true';
  const shouldRequireOtp = user.role !== 'admin' && Boolean(user.login_2fa_enabled) && requireGlobalLoginOtp;

  if (shouldRequireOtp) {
    // Invalidate old unused login OTPs
    db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = 'login_otp' AND used_at IS NULL`).run(user.id);

    const otpCode = generateOtpCode();
    const otpHash = hashToken(`${user.email}:${otpCode}`);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    db.prepare(`INSERT INTO verification_tokens (user_id, purpose, token_hash, max_attempts, expires_at) VALUES (?, 'login_otp', ?, 5, ?)`).run(
      user.id,
      otpHash,
      expiresAt
    );

    const emailRes = await sendTransactionalEmail({
      toEmail: user.email,
      toName: user.full_name,
      subject: 'Your AIDOMART sign-in security code',
      eventType: 'login_otp',
      headline: 'Sign-In Security Verification',
      bodyHtml: `
        <p>Hello ${escapeHtml(user.full_name)},</p>
        <p>Thank you for signing in to your <strong>AIDOMART</strong> account. To keep your account protected, please enter the 6-digit security code below to complete your sign-in:</p>
        ${buildOtpCardHtml(otpCode, 15)}
        <p style="font-size:13px;color:#64748B;">For your security, never share this code with anyone—AIDOMART staff will never ask for it. If you did not attempt to sign in, please reset your password immediately.</p>
      `,
    });

    if (!emailRes.delivered) {
      return res.status(503).json({
        error: 'Unable to send your login verification code right now. Please try again shortly.',
        requiresLoginOtp: false,
        emailStatus: emailRes.status,
      });
    }

    return res.json({
      requiresLoginOtp: true,
      email: user.email,
      message: 'A 6-digit login verification code has been sent to your email address.',
    });
  }

  const { csrfToken, sessionCreatedAt } = createSessionAndSetCookie(req, res, user.id);
  await recordLoginDeviceAndNotify(req, res, user);

  recordActivityLog({
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    eventType: 'user_login',
    summary: `${user.role.toUpperCase()} signed in: ${user.full_name}`,
    details: user.email,
  });

  let sellerProfile = null;
  if (user.role === 'seller') {
    const sp = db.prepare(`SELECT * FROM seller_profiles WHERE user_id = ?`).get(user.id) as Record<string, any> | undefined;
    sellerProfile = formatSellerProfile(sp);
  }

  return res.json({
    requiresLoginOtp: false,
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      login2faEnabled: Boolean(user.login_2fa_enabled),
      soundEnabled: Boolean(user.sound_enabled),
      accountStatus: user.account_status,
      sessionCreatedAt,
      sellerProfile,
    },
  });
});

authRouter.post('/verify-login-code', verifyLimiter, async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const code = sanitizeText(req.body?.code, 20);

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const user = db
    .prepare(
      `SELECT id, email, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status
       FROM users WHERE email = ?`
    )
    .get(email) as
    | {
        id: number;
        email: string;
        full_name: string;
        phone: string | null;
        role: 'buyer' | 'seller' | 'admin';
        email_verified: number;
        login_2fa_enabled: number;
        sound_enabled: number;
        account_status: 'Active' | 'Restricted' | 'Suspended';
      }
    | undefined;

  if (!user || user.account_status === 'Suspended') {
    return res.status(401).json({ error: 'Invalid login verification request.' });
  }

  const tokenRow = db
    .prepare(
      `SELECT id, token_hash, attempts, max_attempts, expires_at
       FROM verification_tokens
       WHERE user_id = ? AND purpose = 'login_otp' AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id) as
    | { id: number; token_hash: string; attempts: number; max_attempts: number; expires_at: string }
    | undefined;

  if (!tokenRow) {
    return res.status(400).json({ error: 'No active login verification code found. Please sign in again.' });
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Your login verification code has expired. Please sign in again.' });
  }
  if (tokenRow.attempts >= tokenRow.max_attempts) {
    db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE id = ?`).run(tokenRow.id);
    return res.status(429).json({ error: 'Too many failed verification attempts. Please sign in again.' });
  }

  const suppliedHash = hashToken(`${user.email}:${code}`);
  if (suppliedHash !== tokenRow.token_hash) {
    db.prepare(`UPDATE verification_tokens SET attempts = attempts + 1 WHERE id = ?`).run(tokenRow.id);
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE id = ?`).run(tokenRow.id);
  const { csrfToken, sessionCreatedAt } = createSessionAndSetCookie(req, res, user.id);
  await recordLoginDeviceAndNotify(req, res, user);

  let sellerProfile = null;
  if (user.role === 'seller') {
    const sp = db.prepare(`SELECT * FROM seller_profiles WHERE user_id = ?`).get(user.id) as Record<string, any> | undefined;
    sellerProfile = formatSellerProfile(sp);
  }

  return res.json({
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      login2faEnabled: Boolean(user.login_2fa_enabled),
      soundEnabled: Boolean(user.sound_enabled),
      accountStatus: user.account_status,
      sessionCreatedAt,
      sellerProfile,
    },
  });
});

authRouter.post('/resend-login-code', authLimiter, async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const user = db
    .prepare(
      `SELECT id, email, full_name, role, email_verified, account_status
       FROM users WHERE email = ?`
    )
    .get(email) as
    | {
        id: number;
        email: string;
        full_name: string;
        role: 'buyer' | 'seller' | 'admin';
        email_verified: number;
        account_status: string;
      }
    | undefined;

  if (!user || user.account_status === 'Suspended' || !user.email_verified) {
    return res.status(400).json({ error: 'Unable to resend login code for this account.' });
  }

  db.prepare(
    `UPDATE verification_tokens SET used_at = datetime('now')
     WHERE user_id = ? AND purpose = 'login_otp' AND used_at IS NULL`
  ).run(user.id);

  const otpCode = generateOtpCode();
  const otpHash = hashToken(`${user.email}:${otpCode}`);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO verification_tokens (user_id, purpose, token_hash, max_attempts, expires_at)
     VALUES (?, 'login_otp', ?, 5, ?)`
  ).run(user.id, otpHash, expiresAt);

  const emailRes = await sendTransactionalEmail({
    toEmail: user.email,
    toName: user.full_name,
    subject: 'Your new AIDOMART sign-in security code',
    eventType: 'login_otp_resend',
    headline: 'Fresh Sign-In Security Code',
    bodyHtml: `
      <p>Hello ${escapeHtml(user.full_name)},</p>
      <p>Here is your new 6-digit security verification code to complete signing in to <strong>AIDOMART</strong>:</p>
      ${buildOtpCardHtml(otpCode, 15)}
      <p style="font-size:13px;color:#64748B;">For your protection, any previous login code has been cancelled. If you did not request this code, please reset your password immediately.</p>
    `,
  });

  if (!emailRes.delivered) {
    return res.status(503).json({
      error: 'Unable to deliver a new login verification code right now. Please try again shortly.',
      emailDelivered: false,
    });
  }

  return res.json({
    message: 'A new 6-digit login verification code has been sent to your email.',
    emailDelivered: true,
  });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  if (req.sessionId) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(req.sessionId);
  }
  const https = isHttpsRequest(req);
  const embedded = isEmbeddedCrossSiteRequest(req);
  res.clearCookie('aidomart_session', {
    path: '/',
    sameSite: https && embedded ? 'none' : 'lax',
    secure: https,
  });
  return res.json({ message: 'Signed out successfully.' });
});

authRouter.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Please enter your email address.' });
  }

  const user = db.prepare(`SELECT id, full_name FROM users WHERE email = ?`).get(email) as
    | { id: number; full_name: string }
    | undefined;

  if (!user) {
    return res.json({
      message: 'If an account matches that email, a password reset email will be sent.',
    });
  }

  db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL`).run(user.id);

  const rawToken = generateRandomToken(24);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'password_reset', ?, ?)`).run(
    user.id,
    tokenHash,
    expiresAt
  );

  const baseUrl = getAppBaseUrl(req);
  const resetUrl = `${baseUrl}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(rawToken)}`;

  const emailRes = await sendTransactionalEmail({
    toEmail: email,
    toName: user.full_name,
    subject: 'Reset your AIDOMART account password',
    eventType: 'password_reset',
    headline: 'Password Reset Request',
    bodyHtml: `
      <p>Hello ${escapeHtml(user.full_name)},</p>
      <p>Thank you for contacting <strong>AIDOMART</strong> regarding your account access. We received a request to reset your password.</p>
      <p>Please click the button below to choose a new password. For your protection, this link can only be used once and expires in 15 minutes.</p>
      <p style="font-size:13px;color:#64748B;">If you did not request a password reset, you can safely ignore this message—your current password will remain unchanged.</p>
    `,
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
  });

  return res.json({
    message: emailRes.delivered
      ? 'A password reset link has been sent to your email address.'
      : 'Unable to send your password reset email right now. Please try again shortly.',
    emailDelivered: emailRes.delivered,
    emailStatus: emailRes.status,
  });
});

authRouter.post('/reset-password', authLimiter, (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 160).toLowerCase();
  const token = sanitizeText(req.body?.token, 128);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, reset token, and new password are required.' });
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ error: strength.message });
  }

  const user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as { id: number } | undefined;
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired password reset link.' });
  }

  const tokenHash = hashToken(token);
  const tokenRow = db
    .prepare(
      `SELECT id, expires_at FROM verification_tokens
       WHERE user_id = ? AND purpose = 'password_reset' AND token_hash = ? AND used_at IS NULL
       LIMIT 1`
    )
    .get(user.id, tokenHash) as { id: number; expires_at: string } | undefined;

  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired password reset link.' });
  }

  const newHash = hashPassword(newPassword);
  db.transaction(() => {
    db.prepare(`UPDATE verification_tokens SET used_at = datetime('now') WHERE id = ?`).run(tokenRow.id);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, user.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);
  })();

  return res.json({ message: 'Password updated successfully. You may now log in with your new password.' });
});

authRouter.patch('/preferences', requireAuth, (req: Request, res: Response) => {
  const user = req.authUser!;
  const fullName = sanitizeText(req.body?.fullName, 120) || user.fullName;
  const phone = req.body?.phone !== undefined ? sanitizeText(req.body.phone, 40) : user.phone;
  const soundEnabled =
    typeof req.body?.soundEnabled === 'boolean' ? (req.body.soundEnabled ? 1 : 0) : user.soundEnabled ? 1 : 0;
  const login2faEnabled =
    typeof req.body?.login2faEnabled === 'boolean'
      ? req.body.login2faEnabled
        ? 1
        : 0
      : user.login2faEnabled
        ? 1
        : 0;

  db.prepare(
    `UPDATE users SET full_name = ?, phone = ?, sound_enabled = ?, login_2fa_enabled = ? WHERE id = ?`
  ).run(fullName, phone || null, soundEnabled, login2faEnabled, user.id);

  return res.json({
    message: 'Preferences updated.',
    fullName,
    phone: phone || null,
    soundEnabled: Boolean(soundEnabled),
    login2faEnabled: Boolean(login2faEnabled),
  });
});

// ============================================================
// SOCIAL SIGN-IN (GOOGLE / GMAIL)
// ============================================================

function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function renderOAuthPopupResultHtml(params: {
  ok: boolean;
  provider: 'google';
  message: string;
  redirectPath?: string;
}): string {
  const payload = JSON.stringify({
    type: params.ok ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR',
    provider: params.provider,
    error: params.ok ? undefined : params.message,
  });
  const fallbackPath = params.ok ? params.redirectPath || '/' : '/login';
  const safeMessage = escapeHtml(params.message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AIDOMART Sign-In</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#F8FAFC; color:#0B1F3A; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
    .card { background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:28px 24px; max-width:420px; text-align:center; box-shadow:0 4px 14px rgba(11,31,58,0.08); }
    .brand { font-size:20px; font-weight:800; margin-bottom:10px; }
    .accent { color:#F97316; }
    p { font-size:14px; color:#475569; line-height:1.5; margin:0 0 14px 0; }
    a { color:#F97316; font-weight:600; font-size:13px; text-decoration:none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">AIDO<span class="accent">MART</span></div>
    <p>${safeMessage}</p>
    <a href="${escapeHtml(fallbackPath)}">Continue to AIDOMART</a>
  </div>
  <script>
    (function () {
      var msg = ${payload};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, '*');
        setTimeout(function () { window.close(); }, 150);
      } else {
        window.location.href = ${JSON.stringify(fallbackPath)};
      }
    })();
  </script>
</body>
</html>`;
}

async function completeOAuthLogin(
  req: Request,
  res: Response,
  opts: {
    provider: 'google';
    providerUserId: string;
    email: string;
    fullName: string;
    preferredRole: 'buyer' | 'seller';
  }
) {
  const normalizedEmail = sanitizeText(opts.email, 160).toLowerCase();
  const displayFallback =
    normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'AIDOMART Member';
  const cleanFullName = sanitizeText(opts.fullName, 120) || displayFallback;

  if (!normalizedEmail) {
    throw new Error('Could not retrieve an email address from your account provider.');
  }

  type DbUserRow = {
    id: number;
    email: string;
    full_name: string;
    phone: string | null;
    role: 'buyer' | 'seller' | 'admin';
    email_verified: number;
    login_2fa_enabled: number;
    sound_enabled: number;
    account_status: 'Active' | 'Restricted' | 'Suspended';
  };

  let user: DbUserRow | undefined;
  let isNewUser = false;

  const linked = db
    .prepare(`SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?`)
    .get(opts.provider, opts.providerUserId) as { user_id: number } | undefined;

  if (linked) {
    user = db
      .prepare(
        `SELECT id, email, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status
         FROM users WHERE id = ?`
      )
      .get(linked.user_id) as DbUserRow | undefined;
  }

  if (!user) {
    user = db
      .prepare(
        `SELECT id, email, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status
         FROM users WHERE email = ?`
      )
      .get(normalizedEmail) as DbUserRow | undefined;

    if (user) {
      if (user.account_status === 'Suspended') {
        throw new Error('Your account has been suspended. Please contact AIDOMART support.');
      }
      db.prepare(
        `INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_user_id, provider_email)
         VALUES (?, ?, ?, ?)`
      ).run(user.id, opts.provider, opts.providerUserId, normalizedEmail);

      if (!user.email_verified) {
        db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(user.id);
      }
    }
  }

  if (!user) {
    isNewUser = true;
    const role: 'buyer' | 'seller' = opts.preferredRole === 'seller' ? 'seller' : 'buyer';
    const randomPwHash = hashPassword(generateRandomToken(32));
    const providerLabel = opts.provider === 'google' ? 'Google Sign-In' : 'Apple Sign-In';

    const newUserId = db.transaction(() => {
      const insertRes = db
        .prepare(
          `INSERT INTO users (email, password_hash, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status)
           VALUES (?, ?, ?, NULL, ?, 1, 1, 1, 'Active')`
        )
        .run(normalizedEmail, randomPwHash, cleanFullName, role);

      const createdId = Number(insertRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email)
         VALUES (?, ?, ?, ?)`
      ).run(createdId, opts.provider, opts.providerUserId, normalizedEmail);

      if (role === 'seller') {
        const defaultBizName = `${cleanFullName.split(/\s+/)[0]}'s Store`;
        const spRes = db
          .prepare(
            `INSERT INTO seller_profiles (
              user_id, legal_name, business_name, email, phone, description,
              categories_json, physical_address, location_city, delivery_pickup_notes,
              application_status, verified_badge
            ) VALUES (?, ?, ?, ?, '', '', '[]', '', '', '', 'Draft', 0)`
          )
          .run(createdId, cleanFullName, defaultBizName, normalizedEmail);

        db.prepare(
          `INSERT INTO seller_audit_logs (seller_profile_id, actor_user_id, action, previous_status, new_status, verified_badge_state, physical_inspection_conducted, notes)
           VALUES (?, ?, 'Seller Registration Created', NULL, 'Draft', 0, 0, ?)`
        ).run(Number(spRes.lastInsertRowid), createdId, `Created via ${providerLabel} (Draft).`);
      }

      return createdId;
    })();

    user = db
      .prepare(
        `SELECT id, email, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status
         FROM users WHERE id = ?`
      )
      .get(newUserId) as DbUserRow;

    // New sign-up notifications & emails go strictly to Administrator only
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        title: role === 'seller' ? `New Seller Sign-Up (${providerLabel})` : `New Buyer Sign-Up (${providerLabel})`,
        message:
          role === 'seller'
            ? `${cleanFullName} (${normalizedEmail}) registered a seller account via ${providerLabel}.`
            : `${cleanFullName} (${normalizedEmail}) created a buyer account via ${providerLabel}.`,
        link: role === 'seller' ? '/admin?tab=sellers' : '/admin?tab=users',
        type: role === 'seller' ? 'seller_application' : 'buyer_signup',
      });
    }

    const baseUrl = getAppBaseUrl(req);
    if (role === 'seller') {
      await sendAdminAlertEmail({
        subject: `AIDOMART Admin Alert: New Seller (${providerLabel}) — ${cleanFullName}`,
        eventType: 'admin_new_seller_oauth_alert',
        dedupKey: `admin_oauth_seller_${user.id}`,
        headline: `New Seller Sign-Up (${providerLabel})`,
        bodyHtml: `
          <p>A new <strong>Seller</strong> signed up on AIDOMART using ${escapeHtml(providerLabel)}:</p>
          <div style="margin:16px 0;padding:14px 16px;background-color:#F8FAFC;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;color:#1E293B;line-height:1.7;">
            <strong>Full Name:</strong> ${escapeHtml(cleanFullName)}<br/>
            <strong>Email:</strong> ${escapeHtml(normalizedEmail)}<br/>
            <strong>Status:</strong> Seller (Draft)
          </div>
        `,
        ctaLabel: 'Review & Approve Seller',
        ctaUrl: `${baseUrl}/admin?tab=sellers`,
      });
    }
  } else if (user.account_status === 'Suspended') {
    throw new Error('Your account has been suspended. Please contact AIDOMART support.');
  }

  createSessionAndSetCookie(req, res, user.id);
  await recordLoginDeviceAndNotify(req, res, user);

  const redirectPath =
    user.role === 'admin'
      ? '/admin'
      : user.role === 'seller'
        ? '/seller-dashboard'
        : '/buyer-dashboard';

  return { user, isNewUser, redirectPath };
}

authRouter.get('/oauth/providers', (_req: Request, res: Response) => {
  return res.json({
    google: isGoogleOAuthConfigured(),
  });
});

authRouter.get('/oauth/google/url', (req: Request, res: Response) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error:
        'Google Sign-In is not configured yet on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment settings, or sign in with your Email or Phone.',
    });
  }
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  const redirectUri = `${getAppBaseUrl(req)}/api/auth/oauth/google/callback`;
  const state = signOAuthState({ provider: 'google', role });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  return res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
});

authRouter.get(['/oauth/google/callback', '/oauth/google/callback/'], async (req: Request, res: Response) => {
  try {
    const errorParam = sanitizeText(req.query.error, 100);
    if (errorParam) {
      return res
        .status(400)
        .send(
          renderOAuthPopupResultHtml({
            ok: false,
            provider: 'google',
            message: 'Google Sign-In was cancelled or declined.',
          })
        );
    }

    const code = sanitizeText(req.query.code, 500);
    const stateRaw = sanitizeText(req.query.state, 800);
    const state = verifyOAuthState(stateRaw);
    if (!code || !state || state.provider !== 'google') {
      return res
        .status(400)
        .send(
          renderOAuthPopupResultHtml({
            ok: false,
            provider: 'google',
            message: 'Invalid or expired Google Sign-In session. Please try again.',
          })
        );
    }

    if (!isGoogleOAuthConfigured()) {
      return res
        .status(503)
        .send(
          renderOAuthPopupResultHtml({
            ok: false,
            provider: 'google',
            message: 'Google Sign-In is not configured on this server.',
          })
        );
    }

    const redirectUri = `${getAppBaseUrl(req)}/api/auth/oauth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      throw new Error('Google rejected the authorization code. Check your redirect URI configuration.');
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new Error('Google did not return an access token.');
    }

    const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userInfoRes.ok) {
      throw new Error('Could not load Google account profile.');
    }

    const profile = (await userInfoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.sub || !profile.email || !profile.email_verified) {
      throw new Error('Your Google account email must be verified to sign in.');
    }

    const result = await completeOAuthLogin(req, res, {
      provider: 'google',
      providerUserId: profile.sub,
      email: profile.email,
      fullName: profile.name || '',
      preferredRole: state.role,
    });

    return res.send(
      renderOAuthPopupResultHtml({
        ok: true,
        provider: 'google',
        message: 'Google Sign-In successful. Redirecting you to AIDOMART...',
        redirectPath: result.redirectPath,
      })
    );
  } catch (err: any) {
    return res
      .status(400)
      .send(
        renderOAuthPopupResultHtml({
          ok: false,
          provider: 'google',
          message: err?.message || 'Unable to complete Google Sign-In.',
        })
      );
  }
});
