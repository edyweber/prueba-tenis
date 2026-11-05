/**
 * Servidor de desarrollo: sirve Index.html y expone las funciones de Code.gs en /api/<fn>,
 * usando una copia local de la planilla (dev/data.json, creada desde fixture-hoja1.json).
 *
 *   node dev/server.js        → http://localhost:3000
 *   RESET=1 node dev/server.js → arranca de nuevo desde la copia de "Hoja 1"
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./fake-sheets');

const PORT = Number(process.env.PORT) || 3000;
const DATA = path.join(__dirname, 'data.json');
const FIXTURE = path.join(__dirname, 'fixture-hoja1.json');
if (process.env.RESET || !fs.existsSync(DATA)) fs.copyFileSync(FIXTURE, DATA);

const app = loadApp(JSON.parse(fs.readFileSync(DATA, 'utf8')));
const ALLOWED = ['login', 'getData', 'addMovimiento', 'deleteMovimiento', 'saveConfig', 'liquidarTodo', 'importarDesdeOrigen'];

http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html')));
  }
  const m = req.url.match(/^\/api\/(\w+)$/);
  if (req.method === 'POST' && m && ALLOWED.includes(m[1])) {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const out = app.api[m[1]](...JSON.parse(body || '[]'));
        fs.writeFileSync(DATA, app.serialize());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, () => console.log(`Gastos app (dev) en http://localhost:${PORT}`));
