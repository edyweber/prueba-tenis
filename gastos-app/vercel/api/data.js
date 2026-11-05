import { ejecutar } from '../lib/app.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Usá POST.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    res.status(200).json(await ejecutar(body));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || String(e) });
  }
}
