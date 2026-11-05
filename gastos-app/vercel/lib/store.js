/**
 * Dónde se guarda todo: un archivo JSON privado en Vercel Blob (gastos/estado.json),
 * más una copia de respaldo por cada cambio (gastos/historial/…, se guardan las últimas 100).
 * En desarrollo local (sin BLOB_READ_WRITE_TOKEN) se usa un archivo local.
 */
import fs from 'node:fs';
import seed from './seed.js';

const ESTADO = 'gastos/estado.json';
const HISTORIAL = 'gastos/historial/';
const LOCAL_FILE = process.env.LOCAL_DATA_FILE;
const clone = o => JSON.parse(JSON.stringify(o));

function usingBlob() {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return true;
  if (LOCAL_FILE) return false;
  throw new Error('Falta conectar el almacenamiento: en Vercel, Storage → Blob → conectarlo a este proyecto.');
}

export async function load() {
  if (!usingBlob()) return fs.existsSync(LOCAL_FILE) ? JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')) : clone(seed);
  const { get } = await import('@vercel/blob');
  const res = await get(ESTADO, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return clone(seed);
  return JSON.parse(await new Response(res.stream).text());
}

export async function save(state) {
  const body = JSON.stringify(state);
  if (!usingBlob()) { fs.writeFileSync(LOCAL_FILE, body); return; }
  const { put, list, del } = await import('@vercel/blob');
  const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };
  await put(ESTADO, body, opts);
  await put(HISTORIAL + new Date().toISOString().replace(/[:.]/g, '-') + '.json', body, opts);
  const { blobs } = await list({ prefix: HISTORIAL, limit: 1000 });
  if (blobs.length > 100) {
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    await del(blobs.slice(100).map(b => b.url));
  }
}
