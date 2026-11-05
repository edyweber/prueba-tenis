'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../dev/fake-sheets');
const fixture = require('../dev/fixture-hoja1.json');

const PASS = 'gastos2026';
// Envuelve la API para pasar la contraseña en cada llamada, como hace el front.
const fresh = () => {
  const app = loadApp(JSON.parse(JSON.stringify(fixture)));
  const api = {};
  Object.keys(app.api).forEach(k => { api[k] = (...a) => app.api[k](PASS, ...a); });
  return { api, raw: app.api };
};

test('toma los nombres de la columna "Garpado x"', () => {
  const { api } = fresh();
  assert.deepStrictEqual(api.getData().personas.slice(0, 3), ['GCM', 'EW', 'LM']);
});

test('importa gastos e ingresos de Hoja 1', () => {
  const { api } = fresh();
  const d = api.importarDesdeOrigen();
  const gastos = d.movimientos.filter(m => m.tipo === 'Gasto');
  const ingresos = d.movimientos.filter(m => m.tipo === 'Ingreso');
  assert.strictEqual(gastos.length, 53);
  assert.strictEqual(ingresos.length, 1);
  assert.deepStrictEqual(d.config.socios, ['GCM', 'EW', 'LM', 'JG']);
  assert.strictEqual(d.config.dolar, 1550);

  const zoho = gastos[0];
  assert.strictEqual(zoho.descripcion, 'Mensual Zoho Campaigns');
  assert.strictEqual(zoho.fecha, ''); // la primera fila no tiene fecha
  const fb = gastos.find(m => m.descripcion === 'Facebook campañas');
  assert.deepStrictEqual([fb.moneda, fb.monto, fb.fecha, fb.liquidado], ['ARS', 185144, '2026-08-20', true]);
  const sep = gastos.find(m => m.descripcion === 'Plan Dreamina');
  assert.strictEqual(sep.fecha, '2026-09-01');
  const ult = gastos[gastos.length - 1];
  assert.deepStrictEqual([ult.fecha, ult.monto, ult.liquidado], ['2026-11-01', 29.4, false]);
  // las filas por encima de "PAGADO" quedan liquidadas
  assert.strictEqual(gastos.filter(m => m.liquidado).length, 20);
  assert.deepStrictEqual([ingresos[0].descripcion, ingresos[0].monto, ingresos[0].fecha], ['Jorge — OCTUBRE', 11600, '2026-10-01']);
});

test('re-importar no duplica y conserva lo cargado en la app', () => {
  const { api } = fresh();
  api.importarDesdeOrigen();
  api.addMovimiento({ fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'Test', moneda: 'USD', monto: 10, persona: 'EW' });
  const d = api.importarDesdeOrigen();
  assert.strictEqual(d.movimientos.length, 55);
  assert.ok(d.movimientos.some(m => m.descripcion === 'Test' && m.origen === 'App'));
});

test('carga, borra, configura y liquida', () => {
  const { api } = fresh();
  let d = api.addMovimiento({ fecha: '2026-11-05', tipo: 'Ingreso', descripcion: 'Jorge nov', moneda: 'USD', monto: '500', persona: '' });
  assert.strictEqual(d.movimientos.length, 1);
  assert.strictEqual(d.movimientos[0].monto, 500);
  d = api.saveConfig({ dolar: 1600, socios: ['GCM', ' EW ', ''] });
  assert.deepStrictEqual(d.config, { dolar: 1600, socios: ['GCM', 'EW'] });
  d = api.liquidarTodo();
  assert.ok(d.movimientos.every(m => m.liquidado));
  d = api.deleteMovimiento(d.movimientos[0].id);
  assert.strictEqual(d.movimientos.length, 0);
});

test('valida los datos', () => {
  const { api } = fresh();
  assert.throws(() => api.addMovimiento({ fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'x', monto: 0, persona: 'EW' }), /monto/);
  assert.throws(() => api.addMovimiento({ fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'x', monto: 5 }), /quién/);
  assert.throws(() => api.addMovimiento({ fecha: 'ayer', tipo: 'Gasto', descripcion: 'x', monto: 5, persona: 'EW' }), /Fecha/);
});

test('pide contraseña', () => {
  const { raw } = fresh();
  assert.throws(() => raw.getData('mal'), /Contraseña/);
  assert.throws(() => raw.addMovimiento(undefined, { fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'x', monto: 5, persona: 'EW' }), /Contraseña/);
  assert.strictEqual(raw.login(PASS), true);
});
