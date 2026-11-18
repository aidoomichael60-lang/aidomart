import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import serverless from 'serverless-http';

const BLOB_STORE_NAME = 'aidomart-storage';
const DB_BLOB_KEY = 'aidomart.db';

let initialized = false;
let lastSyncedDbEtag: string | null = null;
let cachedServerModule: typeof import('../../server/app.ts') | null = null;
let cachedDbModule: typeof import('../../server/db.ts') | null = null;
let cachedMiddlewareModule: typeof import('../../server/middleware.ts') | null = null;
let cachedHandler: ReturnType<typeof serverless> | null = null;
const syncedUploadKeys = new Set<string>();

// Serialize DB sync, route execution, and blob persistence within each warm isolate
// so parallel API calls cannot close/reopen SQLite mid-query.
let isolateQueue: Promise<void> = Promise.resolve();
function runSerialized<T>(task: () => Promise<T>): Promise<T> {
  const next = isolateQueue.then(task, task);
  isolateQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function resolveTargetDbPath(): string {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join('/tmp', 'aidomart.db')
    : path.join(process.cwd(), 'aidomart.db');
}

function canUseStrongConsistency(): boolean {
  const rawCtx =
    (globalThis as Record<string, any>).netlifyBlobsContext ||
    process.env.NETLIFY_BLOBS_CONTEXT;
  if (typeof rawCtx !== 'string' || !rawCtx) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(rawCtx, 'base64').toString('utf8')) as {
      edgeURL?: string;
      uncachedEdgeURL?: string;
    };
    return Boolean(parsed?.uncachedEdgeURL || !parsed?.edgeURL);
  } catch {
    return false;
  }
}

function getBlobStore() {
  const strong = canUseStrongConsistency();
  try {
    return strong
      ? getStore({ name: BLOB_STORE_NAME, consistency: 'strong' })
      : getStore(BLOB_STORE_NAME);
  } catch {
    try {
      return getStore(BLOB_STORE_NAME);
    } catch {
      return null;
    }
  }
}

function getConsistencyOption(): { consistency: 'strong' } | Record<string, never> {
  return canUseStrongConsistency() ? { consistency: 'strong' } : {};
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function resolveRequestPath(rawUrlOrPath: string): string {
  let pathname = rawUrlOrPath;
  try {
    if (/^https?:\/\//i.test(rawUrlOrPath)) {
      pathname = new URL(rawUrlOrPath).pathname;
    }
  } catch {
    pathname = rawUrlOrPath;
  }

  const fnPrefix = '/.netlify/functions/api';
  if (!pathname.startsWith(fnPrefix)) {
    return pathname;
  }
  const rest = pathname.slice(fnPrefix.length) || '/';
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

async function syncDatabaseFromBlobsIfUpdated(): Promise<void> {
  const store = getBlobStore();
  if (!store) return;

  const targetDbPath = resolveTargetDbPath();
  const dbExistsLocally = fs.existsSync(targetDbPath);
  const readOpts = getConsistencyOption();

  try {
    const meta = await store.getMetadata(DB_BLOB_KEY, readOpts).catch(() => null);
    const remoteEtag = meta?.etag || null;

    const needsDownload =
      !dbExistsLocally ||
      (remoteEtag !== null && remoteEtag !== lastSyncedDbEtag);

    if (!needsDownload) return;

    const blobResult = await store
      .getWithMetadata(DB_BLOB_KEY, { type: 'arrayBuffer', ...readOpts })
      .catch(() => null);

    const data = blobResult?.data;
    if (data && data.byteLength > 0) {
      if (initialized && cachedDbModule) {
        cachedDbModule.closeDatabase();
      }
      fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
      for (const suffix of ['-wal', '-shm']) {
        try {
          fs.unlinkSync(`${targetDbPath}${suffix}`);
        } catch {
          // ignore missing sidecar files
        }
      }
      const tempPath = `${targetDbPath}.download`;
      fs.writeFileSync(tempPath, Buffer.from(data));
      fs.renameSync(tempPath, targetDbPath);
      lastSyncedDbEtag = blobResult?.etag || remoteEtag;

      if (initialized && cachedDbModule) {
        cachedDbModule.reopenDatabase();
      }
    }
  } catch (err) {
    console.warn('Could not sync SQLite database from Netlify Blobs:', err);
  }
}

async function restoreUploadsIfNeeded(reqPath: string, method: string): Promise<void> {
  if (method !== 'GET' || !cachedMiddlewareModule) return;
  const store = getBlobStore();
  if (!store) return;
  const readOpts = getConsistencyOption();

  if (reqPath.startsWith('/uploads/public/')) {
    const fileName = path.basename(reqPath);
    if (!fileName) return;
    const localPath = path.join(cachedMiddlewareModule.PUBLIC_UPLOAD_DIR, fileName);
    if (fs.existsSync(localPath)) return;
    try {
      const blobKey = `uploads/public/${fileName}`;
      const data = await store.get(blobKey, { type: 'arrayBuffer', ...readOpts });
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
        const data = await store.get(item.key, { type: 'arrayBuffer', ...readOpts });
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
  const touchesAuthOrRepairGet =
    method === 'GET' &&
    (reqPath.includes('/auth/oauth/') ||
      reqPath.includes('/auth/verify-email') ||
      reqPath.includes('/admin/sellers') ||
      reqPath.includes('/admin/bootstrap'));

  if (!isMutating && !touchesAuthOrRepairGet) return;

  const store = getBlobStore();
  if (!store || !cachedDbModule || !cachedMiddlewareModule) return;

  if (isMutating) {
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

  try {
    cachedDbModule.db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Safe to ignore when journal_mode=DELETE
  }

  try {
    if (fs.existsSync(cachedDbModule.DB_PATH)) {
      const dbBytes = fs.readFileSync(cachedDbModule.DB_PATH);
      const writeRes = await store.set(DB_BLOB_KEY, toArrayBuffer(dbBytes));
      if (writeRes?.etag) {
        lastSyncedDbEtag = writeRes.etag;
      } else {
        const meta = await store
          .getMetadata(DB_BLOB_KEY, getConsistencyOption())
          .catch(() => null);
        if (meta?.etag) {
          lastSyncedDbEtag = meta.etag;
        }
      }
    }
  } catch (err) {
    console.warn('Could not persist SQLite database to Netlify Blobs:', err);
  }
}

async function ensureReady() {
  if (!process.env.NETLIFY) {
    process.env.NETLIFY = 'true';
  }

  if (!initialized) {
    await syncDatabaseFromBlobsIfUpdated();
    cachedDbModule = await import('../../server/db.ts');
    cachedMiddlewareModule = await import('../../server/middleware.ts');
    cachedServerModule = await import('../../server/app.ts');
    cachedDbModule.initDatabase();

    const app = cachedServerModule.createApp();
    cachedHandler = serverless(app, {
      binary: ['image/*', 'application/pdf', 'audio/*', 'application/octet-stream'],
    });
    initialized = true;
  } else {
    await syncDatabaseFromBlobsIfUpdated();
  }
}

async function toLambdaEvent(req: Request, context: Record<string, any>) {
  const url = new URL(req.url);
  const normalizedPath = resolveRequestPath(url.pathname);
  const method = req.method.toUpperCase();

  const headers: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    headers[lower] = value;
    multiValueHeaders[lower] = [value];
  });

  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = url.protocol.replace(/:$/, '') || 'https';
  }
  if (!headers['x-forwarded-host'] && url.host) {
    headers['x-forwarded-host'] = url.host;
  }

  const queryStringParameters: Record<string, string> = {};
  const multiValueQueryStringParameters: Record<string, string[]> = {};
  url.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value;
    if (!multiValueQueryStringParameters[key]) {
      multiValueQueryStringParameters[key] = [];
    }
    multiValueQueryStringParameters[key].push(value);
  });

  let body = '';
  let isBase64Encoded = false;
  if (!['GET', 'HEAD'].includes(method)) {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > 0) {
      body = buf.toString('base64');
      isBase64Encoded = true;
    }
  }

  const sourceIp =
    (typeof context?.ip === 'string' && context.ip) ||
    headers['x-nf-client-connection-ip'] ||
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    '';

  return {
    httpMethod: method,
    path: normalizedPath,
    rawPath: normalizedPath,
    rawUrl: req.url,
    headers,
    multiValueHeaders,
    queryStringParameters,
    multiValueQueryStringParameters,
    body,
    isBase64Encoded,
    requestContext: {
      identity: { sourceIp },
      requestId: typeof context?.requestId === 'string' ? context.requestId : '',
    },
  };
}

function fromLambdaResponse(lambdaRes: Record<string, any>): Response {
  const statusCode = Number(lambdaRes?.statusCode) || 200;
  const respHeaders = new Headers();

  const singleHeaders = (lambdaRes?.headers || {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(singleHeaders)) {
    if (key.toLowerCase() === 'set-cookie') continue;
    if (value !== undefined && value !== null) {
      respHeaders.set(key, String(value));
    }
  }

  const multiHeaders = (lambdaRes?.multiValueHeaders || {}) as Record<string, unknown[]>;
  for (const [key, values] of Object.entries(multiHeaders)) {
    if (!Array.isArray(values)) continue;
    if (key.toLowerCase() === 'set-cookie') {
      for (const cookieVal of values) {
        if (cookieVal !== undefined && cookieVal !== null) {
          respHeaders.append('set-cookie', String(cookieVal));
        }
      }
    } else if (!respHeaders.has(key) && values.length > 0) {
      respHeaders.set(key, values.map(String).join(', '));
    }
  }

  if (typeof singleHeaders['set-cookie'] === 'string' && !respHeaders.has('set-cookie')) {
    respHeaders.append('set-cookie', singleHeaders['set-cookie']);
  }

  if (statusCode === 204 || statusCode === 304) {
    return new Response(null, { status: statusCode, headers: respHeaders });
  }

  const rawBody = typeof lambdaRes?.body === 'string' ? lambdaRes.body : '';
  const bodyBytes = lambdaRes?.isBase64Encoded
    ? Buffer.from(rawBody, 'base64')
    : Buffer.from(rawBody, 'utf8');

  return new Response(bodyBytes, {
    status: statusCode,
    headers: respHeaders,
  });
}

export default async function handler(req: Request, context: Record<string, any> = {}) {
  const event = await toLambdaEvent(req, context);
  const lambdaResponse = await runSerialized(async () => {
    await ensureReady();
    await restoreUploadsIfNeeded(event.path, event.httpMethod);
    const res = await cachedHandler!(event, context);
    await persistStateToBlobs(event.path, event.httpMethod);
    return res;
  });

  return fromLambdaResponse(lambdaResponse as Record<string, any>);
}
