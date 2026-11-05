/**
 * Genera los datos iniciales de la web app a partir de la copia de "Hoja 1"
 * (dev/fixture-hoja1.json), usando el mismo parser de src/Code.gs.
 *   node dev/make-seed.js  → seed/movimientos.json, seed/config.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./fake-sheets');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-hoja1.json'), 'utf8'));
const app = loadApp(fixture);
const display = fixture['Hoja 1'];
const parsed = app.api.parseOrigen_(display, display);
const creado = Date.parse('2026-11-05T12:00:00Z');
const personas = [];
parsed.movimientos.forEach(m => { if (m.persona && !personas.includes(m.persona)) personas.push(m.persona); });

const movimientos = parsed.movimientos.map((m, i) => ({
  id: 'h1-' + String(i + 1).padStart(3, '0'),
  data: { fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, moneda: m.moneda, monto: m.monto,
    persona: m.persona, nota: m.nota, liquidado: m.liquidado, origen: 'Planilla: ' + m.origen.replace('Hoja 1 ', ''), creado }
}));
const config = { dolar: parsed.dolar || 1550, socios: parsed.socios, personas, liquidadoHasta: 0 };
const out = path.join(__dirname, '..', 'seed');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'movimientos.json'), JSON.stringify(movimientos, null, 1));
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(config, null, 1));
console.log(movimientos.length, 'movimientos;', JSON.stringify(config));
