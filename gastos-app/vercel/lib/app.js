/** Lógica de la app: contraseña, validaciones y operaciones sobre el estado. */
import { load, save } from './store.js';

// Contraseña compartida para entrar. Cambiala acá.
export const PASSWORD = 'gastos2026';

function vista(state) {
  const cfg = state.config || {};
  const corte = cfg.liquidadoHasta || 0;
  const movimientos = Object.entries(state.movimientos || {}).map(([id, m]) => ({
    id, fecha: m.fecha || '', tipo: m.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto', descripcion: String(m.descripcion || ''),
    moneda: m.moneda === 'ARS' ? 'ARS' : 'USD', monto: Number(m.monto) || 0, persona: String(m.persona || ''),
    nota: String(m.nota || ''), origen: String(m.origen || ''),
    liquidado: !!m.liquidado || (corte > 0 && (Number(m.creado) || 0) <= corte)
  }));
  const personas = [];
  const add = p => { if (p && !personas.includes(p)) personas.push(p); };
  (cfg.personas || []).forEach(add); movimientos.forEach(m => add(m.persona)); (cfg.socios || []).forEach(add);
  return { config: { dolar: Number(cfg.dolar) || 1550, socios: (cfg.socios || []).slice() }, personas, movimientos };
}

function validarMovimiento(mov = {}) {
  const tipo = mov.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto';
  const monto = Number(mov.monto);
  if (!(monto > 0)) throw new Error('El monto tiene que ser un número mayor a 0.');
  const descripcion = String(mov.descripcion || '').trim().slice(0, 300);
  if (!descripcion) throw new Error('Falta la descripción.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(mov.fecha || ''))) throw new Error('Fecha inválida.');
  const persona = String(mov.persona || '').trim().slice(0, 60);
  if (tipo === 'Gasto' && !persona) throw new Error('Indicá quién hizo el gasto.');
  return { fecha: mov.fecha, tipo, descripcion, moneda: mov.moneda === 'ARS' ? 'ARS' : 'USD',
    monto: Math.round(monto * 100) / 100, persona, nota: String(mov.nota || '').trim().slice(0, 500),
    liquidado: false, origen: 'App', creado: Date.now() };
}

const acciones = {
  getData: () => null,
  addMovimiento: (state, mov) => {
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.movimientos[id] = validarMovimiento(mov);
    return true;
  },
  deleteMovimiento: (state, id) => {
    if (!state.movimientos[id]) throw new Error('Ese movimiento ya no existe.');
    delete state.movimientos[id];
    return true;
  },
  saveConfig: (state, c = {}) => {
    const dolar = Number(c.dolar);
    if (!(dolar > 0)) throw new Error('La cotización del dólar tiene que ser un número mayor a 0.');
    const socios = (c.socios || []).map(s => String(s).trim()).filter(Boolean);
    if (!socios.length) throw new Error('Tiene que haber al menos un socio.');
    state.config = { ...state.config, dolar, socios };
    return true;
  },
  liquidarTodo: state => { state.config = { ...state.config, liquidadoHasta: Date.now() }; return true; }
};

/**
 * Correcciones de datos ya guardados (se aplican una sola vez).
 * v2: los gastos traídos de la planilla no estaban saldados ("PAGADO" = pagado al proveedor).
 */
function migrar(state) {
  if ((state.schema || 1) >= 2) return false;
  Object.values(state.movimientos).forEach(m => { if (String(m.origen || '').startsWith('Planilla')) m.liquidado = false; });
  state.schema = 2;
  return true;
}

export async function ejecutar({ pass, fn, args } = {}) {
  if (pass !== PASSWORD) { const e = new Error('Contraseña incorrecta.'); e.status = 401; throw e; }
  const accion = acciones[fn];
  if (!accion) { const e = new Error('Acción desconocida.'); e.status = 400; throw e; }
  const state = await load();
  state.movimientos = state.movimientos || {};
  state.config = state.config || {};
  const migrado = migrar(state);
  if (accion(state, ...(Array.isArray(args) ? args : [])) || migrado) await save(state);
  return vista(state);
}
