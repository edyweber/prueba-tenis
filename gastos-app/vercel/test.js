import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.LOCAL_DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gastos-')), 'd.json');
const { ejecutar } = await import('./lib/app.js');
const P = 'gastos2026';

test('pide contraseña', async () => {
  await assert.rejects(ejecutar({ pass: 'x', fn: 'getData' }), /Contraseña/);
});
test('arranca con los datos de la planilla', async () => {
  const d = await ejecutar({ pass: P, fn: 'getData' });
  assert.strictEqual(d.movimientos.length, 54);
  assert.deepStrictEqual(d.config, { dolar: 1550, socios: ['GCM', 'EW', 'LM', 'JG'] });
  const ew = d.movimientos.filter(m => m.persona === 'EW' && m.tipo === 'Gasto');
  assert.strictEqual(Math.round(ew.reduce((a, m) => a + m.monto, 0) * 100) / 100, 1015.32);
});
test('carga, borra, configura y liquida (y persiste)', async () => {
  let d = await ejecutar({ pass: P, fn: 'addMovimiento', args: [{ fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'Test', moneda: 'USD', monto: '10', persona: 'EW' }] });
  const nuevo = d.movimientos.find(m => m.descripcion === 'Test');
  assert.ok(nuevo && nuevo.monto === 10);
  d = await ejecutar({ pass: P, fn: 'getData' });
  assert.strictEqual(d.movimientos.length, 55);
  d = await ejecutar({ pass: P, fn: 'deleteMovimiento', args: [nuevo.id] });
  assert.strictEqual(d.movimientos.length, 54);
  d = await ejecutar({ pass: P, fn: 'saveConfig', args: [{ dolar: 1600, socios: ['GCM', ' EW', ''] }] });
  assert.deepStrictEqual(d.config, { dolar: 1600, socios: ['GCM', 'EW'] });
  d = await ejecutar({ pass: P, fn: 'liquidarTodo' });
  assert.ok(d.movimientos.every(m => m.liquidado));
});
test('valida', async () => {
  await assert.rejects(ejecutar({ pass: P, fn: 'addMovimiento', args: [{ fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'x', monto: 0, persona: 'EW' }] }), /monto/);
  await assert.rejects(ejecutar({ pass: P, fn: 'borrarTodo' }), /desconocida/);
});

test('corrige datos viejos: lo de la planilla queda pendiente, lo liquidado en la app se respeta', async () => {
  fs.writeFileSync(process.env.LOCAL_DATA_FILE, JSON.stringify({
    config: { dolar: 1550, socios: ['EW'], liquidadoHasta: 0 },
    movimientos: {
      a: { fecha: '2026-07-18', tipo: 'Gasto', descripcion: 'GP', moneda: 'USD', monto: 50, persona: 'EW', liquidado: true, origen: 'Planilla: fila 8', creado: 1 },
      b: { fecha: '2026-11-05', tipo: 'Gasto', descripcion: 'App', moneda: 'USD', monto: 5, persona: 'EW', liquidado: true, origen: 'App', creado: 2 }
    }
  }));
  const d = await ejecutar({ pass: P, fn: 'getData' });
  assert.deepStrictEqual(d.movimientos.map(m => [m.id, m.liquidado]), [['a', false], ['b', true]]);
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.LOCAL_DATA_FILE, 'utf8')).schema, 2);
});
