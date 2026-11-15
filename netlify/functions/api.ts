import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { connectLambda, getStore } from '@netlify/blobs';
import serverless from 'serverless-http';

const BLOB_STORE_NAME = 'aidomart-storage';
const DB_BLOB_KEY = 'aidomart.db';

let initialized = false;
let cachedServerModule: typeof import('../../server/app.ts') | null = null;
let cachedDbModule: typeof import('../../server/db.ts') | null = null;
let cachedMiddlewareModule: typeof import('../../server/middleware.ts') | null = null;
let cachedHandler: ReturnType<typeof serverless> | null = null;
const syncedUploadKeys = new Set<string>();

function resolveTargetDbPath(): string {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join('/tmp', 'aidomart.db')
    : path.join(process.cwd(), 'aidomart.db');
}

function getBlobStore() {
  try {
    return getStore(BLOB_STORE_NAME);
  } catch {
    return null;
  }
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function resolveRequestPath(event: Record<string, any>): string {
  if (typeof event.rawUrl === 'string' && event.rawUrl) {
    try {
      const parsed = new URL(event.rawUrl);
      if (parsed.pathname.startsWith('/api') || parsed.pathname.startsWith('/uploads')) {
        return parsed.pathname;
      }
    } catch {
      // Ignore malformed rawUrl and fall back to event.path
    }
  }

  const rawPath = String(event.path || event.rawPath || '/');
  const fnPrefix = '/.netlify/functions/api';
  if (!rawPath.startsWith(fnPrefix)) {
    return rawPath;
  }
  const rest = rawPath.slice(fnPrefix.length) || '/';
  if (
    rest === '/api' ||
    rest.startsWith('/api/') ||
    rest.startsWith('/uploads/') ||
    rest.startsWith('/static/')
  ) {
    return rest;
  }
  if (rest === '/') {
    return '/api';
  }
  return `/api${rest.startsWith('/') ? rest : `/${rest}`}`;
}

async function restoreDatabaseFromBlobs(): Promise<void> {
  const store = getBlobStore();
  if (!store) return;

  const targetDbPath = resolveTargetDbPath();
  if (fs.existsSync(targetDbPath)) return;

  try {
    const data = await store.get(DB_BLOB_KEY, { type: 'arrayBuffer' });
    if (data && data.byteLength > 0) {
      fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
      fs.writeFileSync(targetDbPath, Buffer.from(data));
    }
  } catch (err) {
    console.warn('Could not restore SQLite database from Netlify Blobs:', err);
  }
}

async function restoreUploadsIfNeeded(reqPath: string, method: string): Promise<void> {
  if (method !== 'GET' || !cachedMiddlewareModule) return;
  const store = getBlobStore();
  if (!store) return;

  if (reqPath.startsWith('/uploads/public/')) {
    const fileName = path.basename(reqPath);
    if (!fileName) return;
    const localPath = path.join(cachedMiddlewareModule.PUBLIC_UPLOAD_DIR, fileName);
    if (fs.existsSync(localPath)) return;
    try {
      const blobKey = `uploads/public/${fileName}`;
      const data = await store.get(blobKey, { type: 'arrayBuffer' });
      if (data && data.byteLength > 0) {
        fs.mkdirSync(cachedMiddlewareModule.PUBLIC_UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(localPath, Buffer.from(data));
        syncedUploadKeys.add(blobKey);
      }
    } catch {
      // Ignore missing blob keys
    }
    return;
  }

  if (reqPath.startsWith('/api/admin/documents/')) {
    try {
      const listed = await store.list({ prefix: 'uploads/private/' });
      for (const item of listed.blobs || []) {
        const fileName = path.basename(item.key);
        if (!fileName) continue;
        const localPath = path.join(cachedMiddlewareModule.PRIVATE_UPLOAD_DIR, fileName);
        if (fs.existsSync(localPath)) continue;
        const data = await store.get(item.key, { type: 'arrayBuffer' });
        if (data && data.byteLength > 0) {
          fs.mkdirSync(cachedMiddlewareModule.PRIVATE_UPLOAD_DIR, { recursive: true });
          fs.writeFileSync(localPath, Buffer.from(data));
          syncedUploadKeys.add(item.key);
        }
      }
    } catch {
      // Ignore blob listing failures outside Netlify runtime
    }
  }
}

async function persistStateToBlobs(reqPath: string, method: string): Promise<void> {
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const touchesAuthGet =
    method === 'GET' &&
    (reqPath.includes('/auth/oauth/') || reqPath.includes('/auth/verify-email'));

  if (!isMutating && !touchesAuthGet) return;

  const store = getBlobStore();
  if (!store || !cachedDbModule || !cachedMiddlewareModule) return;

  try {
    // Checkpoint/close WAL if any, though serverless sets journal_mode=DELETE
    cachedDbModule.db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Safe to ignore when journal_mode=DELETE
  }

  try {
    if (fs.existsSync(cachedDbModule.DB_PATH)) {
      const dbBytes = fs.readFileSync(cachedDbModule.DB_PATH);
      await store.set(DB_BLOB_KEY, toArrayBuffer(dbBytes));
    }
  } catch (err) {
    console.warn('Could not persist SQLite database to Netlify Blobs:', err);
  }

  if (!isMutating) return;

  const uploadDirs: Array<{ dir: string; prefix: string }> = [
    { dir: cachedMiddlewareModule.PUBLIC_UPLOAD_DIR, prefix: 'uploads/public' },
    { dir: cachedMiddlewareModule.PRIVATE_UPLOAD_DIR, prefix: 'uploads/private' },
  ];

  for (const { dir, prefix } of uploadDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const fileName of fs.readdirSync(dir)) {
      const blobKey = `${prefix}/${fileName}`;
      if (syncedUploadKeys.has(blobKey)) continue;
      const fullPath = path.join(dir, fileName);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        const fileBytes = fs.readFileSync(fullPath);
        await store.set(blobKey, toArrayBuffer(fileBytes));
        syncedUploadKeys.add(blobKey);
      } catch {
        // Ignore transient file read errors
      }
    }
  }
}

async function ensureReady(event: Record<string, any>) {
  if (!process.env.NETLIFY) {
    process.env.NETLIFY = 'true';
  }

  try {
    if (event && typeof event === 'object' && event.blobs) {
      connectLambda(event as Parameters<typeof connectLambda>[0]);
    }
  } catch {
    // Ignore when running outside Netlify Lambda Blobs context
  }

  if (!initialized) {
    await restoreDatabaseFromBlobs();
    cachedDbModule = await import('../../server/db.ts');
    cachedMiddlewareModule = await import('../../server/middleware.ts');
    cachedServerModule = await import('../../server/app.ts');
    cachedDbModule.initDatabase();

    const app = cachedServerModule.createApp();
    cachedHandler = serverless(app, {
      binary: ['image/*', 'application/pdf', 'audio/*', 'application/octet-stream'],
    });
    initialized = true;
  }
}

export async function handler(event: Record<string, any>, context: Record<string, any>) {
  await ensureReady(event);

  const method = String(
    event.httpMethod || event.requestContext?.http?.method || 'GET'
  ).toUpperCase();
  const normalizedPath = resolveRequestPath(event);

  // Rewrite path on cloned event so Express routes match /api/* or /uploads/* reliably
  const forwardedEvent = {
    ...event,
    path: normalizedPath,
    rawPath: normalizedPath,
  };

  await restoreUploadsIfNeeded(normalizedPath, method);

  const response = await cachedHandler!(forwardedEvent, context);

  await persistStateToBlobs(normalizedPath, method);

  return response;
}
