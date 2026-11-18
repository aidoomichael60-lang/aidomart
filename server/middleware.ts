import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, IS_SERVERLESS } from './db.ts';
import { parseCookies, verifySessionCookie } from './security.ts';

export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'buyer' | 'seller' | 'admin';
  emailVerified: boolean;
  login2faEnabled: boolean;
  soundEnabled: boolean;
  accountStatus: 'Active' | 'Restricted' | 'Suspended';
  sessionCreatedAt?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser | null;
      sessionId?: string | null;
      csrfToken?: string | null;
    }
  }
}

const UPLOAD_ROOT = IS_SERVERLESS
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');

export const PUBLIC_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'public');
export const PRIVATE_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'private');

fs.mkdirSync(PUBLIC_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_DOC_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const publicImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PUBLIC_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype.toLowerCase())) {
      return cb(new Error('Only JPG, PNG, WebP, or GIF images are permitted.'));
    }
    cb(null, true);
  },
});

export const privateDocUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRIVATE_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.pdf';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.bin';
      cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOC_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WebP, or PDF documents are permitted.'));
    }
    cb(null, true);
  },
});

export function attachSession(req: Request, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const rawSession = cookies['aidomart_session'];
  const sessionId = verifySessionCookie(rawSession);

  if (!sessionId) {
    req.authUser = null;
    req.sessionId = null;
    req.csrfToken = null;
    return next();
  }

  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.csrf_token, s.expires_at, s.created_at AS session_created_at,
              u.id, u.email, u.full_name, u.phone, u.role, u.email_verified,
              u.login_2fa_enabled, u.sound_enabled, u.account_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | {
        session_id: string;
        csrf_token: string;
        expires_at: string;
        session_created_at: string;
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

  const expiresMs = row?.expires_at ? Date.parse(row.expires_at) : 0;
  if (!row || !Number.isFinite(expiresMs) || expiresMs <= Date.now() || row.account_status === 'Suspended') {
    req.authUser = null;
    req.sessionId = null;
    req.csrfToken = null;
    return next();
  }

  const normalizedSessionCreatedAt = row.session_created_at
    ? row.session_created_at.includes('T')
      ? row.session_created_at
      : `${row.session_created_at.replace(' ', 'T')}Z`
    : new Date().toISOString();

  req.sessionId = row.session_id;
  req.csrfToken = row.csrf_token;
  req.authUser = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    emailVerified: Boolean(row.email_verified),
    login2faEnabled: Boolean(row.login_2fa_enabled),
    soundEnabled: Boolean(row.sound_enabled),
    accountStatus: row.account_status,
    sessionCreatedAt: normalizedSessionCreatedAt,
  };
  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  if (req.authUser.accountStatus === 'Suspended') {
    return res.status(403).json({ error: 'Your account is currently suspended.' });
  }
  return next();
}

export function requireRole(...roles: Array<'buyer' | 'seller' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    return next();
  };
}

const CSRF_EXEMPT_AUTH_PATHS = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/resend-login-code',
  '/auth/verify-login-code',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_EXEMPT_AUTH_PATHS.has(req.path)) return next();
  if (!req.authUser || !req.csrfToken) return next();
  const headerToken = req.headers['x-csrf-token'];
  if (typeof headerToken !== 'string' || headerToken !== req.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing security token. Please refresh and try again.' });
  }
  return next();
}

export function getAppBaseUrl(req: Request): string {
  const envAppUrl = (process.env.APP_URL || '').trim();
  if (
    envAppUrl &&
    envAppUrl !== 'MY_APP_URL' &&
    !(IS_SERVERLESS && /^https?:\/\/localhost(?::\d+)?/i.test(envAppUrl))
  ) {
    return envAppUrl.replace(/\/+$/, '');
  }
  if (IS_SERVERLESS && process.env.URL) {
    return process.env.URL.replace(/\/+$/, '');
  }
  const fwdProto = (req.headers['x-forwarded-proto'] as string) || '';
  const proto = fwdProto.split(',')[0].trim() || req.protocol || 'http';
  const fwdHost = (req.headers['x-forwarded-host'] as string) || '';
  const host = fwdHost.split(',')[0].trim() || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export function getPlatformSetting(key: string, fallback: string): string {
  const row = db.prepare(`SELECT value FROM platform_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}
