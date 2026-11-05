// Servidor local: sirve index.html y /api/data con datos en un archivo local.
import http from 'node:http';
import fs from 'node:fs';
process.env.LOCAL_DATA_FILE ||= new URL('./.data-local.json', import.meta.url).pathname;
const { default: handler } = await import('./api/data.js');
const PORT = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
  if (req.url === '/api/data') {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      req.body = body;
      res.status = code => { res.statusCode = code; return res; };
      res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      handler(req, res);
    });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(new URL('./index.html', import.meta.url)));
}).listen(PORT, () => console.log('http://localhost:' + PORT));
