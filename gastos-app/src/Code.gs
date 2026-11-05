/**
 * Contabilidad de gastos e ingresos — Google Apps Script (web app).
 *
 * Vive dentro de la misma planilla de Google Sheets:
 *  - Lee la hoja original ("Hoja 1") para sacar los nombres de la columna
 *    "Garpado x" e importar los gastos históricos.
 *  - Guarda todos los movimientos en una hoja propia "Movimientos" (libro diario).
 *  - Guarda la configuración (cotización del dólar, socios) en la hoja "Config".
 */

var SHEET_ORIGEN = 'Hoja 1';
var SHEET_MOV = 'Movimientos';
var SHEET_CONFIG = 'Config';
var MOV_HEADERS = ['ID', 'Fecha', 'Tipo', 'Descripción', 'Moneda', 'Monto',
  'Persona', 'Nota', 'Liquidado', 'Origen', 'Creado'];
var DEFAULT_DOLAR = 1550;

// Contraseña para entrar a la app (la comparten todos los que la usan). Cambiala acá.
var PASSWORD = 'gastos2026';
var MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8,
  SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };

// ---------------------------------------------------------------- web app

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gastos y cuentas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------- API (llamada desde el front)
// Todas reciben la contraseña como primer parámetro.

function checkPass_(pass) {
  if (String(pass) !== PASSWORD) throw new Error('Contraseña incorrecta.');
}

/** Solo verifica la contraseña (pantalla de ingreso). */
function login(pass) {
  checkPass_(pass);
  return true;
}

/** Devuelve todo lo que el front necesita para dibujar la app. */
function getData(pass) {
  checkPass_(pass);
  return getData_();
}

function getData_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets_(ss);
  var cfg = readConfig_(ss);
  var movimientos = readMovimientos_(ss);
  var personas = personasDesdeOrigen_(ss);
  movimientos.forEach(function (m) {
    if (m.persona && personas.indexOf(m.persona) < 0) personas.push(m.persona);
  });
  cfg.socios.forEach(function (s) { if (personas.indexOf(s) < 0) personas.push(s); });
  return {
    config: cfg,
    personas: personas,
    movimientos: movimientos,
    importado: movimientos.some(function (m) { return m.origen.indexOf(SHEET_ORIGEN) === 0; })
  };
}

/** Agrega un gasto o ingreso. mov = {fecha:'yyyy-mm-dd', tipo, descripcion, moneda, monto, persona, nota} */
function addMovimiento(pass, mov) {
  checkPass_(pass);
  var clean = validarMovimiento_(mov);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets_(ss);
    var sh = ss.getSheetByName(SHEET_MOV);
    var id = Utilities.getUuid().slice(0, 8);
    sh.appendRow([id, parseISODate_(clean.fecha), clean.tipo, clean.descripcion, clean.moneda,
      clean.monto, clean.persona, clean.nota, false, 'App', new Date()]);
    return getData_();
  });
}

/** Borra un movimiento por ID. */
function deleteMovimiento(pass, id) {
  checkPass_(pass);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_MOV);
    var values = sh.getDataRange().getValues();
    for (var r = values.length - 1; r >= 1; r--) {
      if (String(values[r][0]) === String(id)) { sh.deleteRow(r + 1); break; }
    }
    return getData_();
  });
}

/** Guarda cotización del dólar y lista de socios (entre quienes se reparte). */
function saveConfig(pass, cfg) {
  checkPass_(pass);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets_(ss);
    var dolar = Number(cfg.dolar);
    if (!(dolar > 0)) throw new Error('La cotización del dólar tiene que ser un número mayor a 0.');
    var socios = (cfg.socios || []).map(function (s) { return String(s).trim(); })
      .filter(function (s) { return s; });
    if (!socios.length) throw new Error('Tiene que haber al menos un socio.');
    writeConfig_(ss, { dolar: dolar, socios: socios });
    return getData_();
  });
}

/** Marca todos los movimientos pendientes como liquidados (se saldaron las cuentas). */
function liquidarTodo(pass) {
  checkPass_(pass);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_MOV);
    var last = sh.getLastRow();
    if (last >= 2) {
      var col = MOV_HEADERS.indexOf('Liquidado') + 1;
      var rng = sh.getRange(2, col, last - 1, 1);
      rng.setValues(rng.getValues().map(function () { return [true]; }));
    }
    return getData_();
  });
}

/**
 * Importa (o re-importa) los gastos e ingresos de "Hoja 1" a "Movimientos".
 * Los movimientos cargados desde la app no se tocan.
 */
function importarDesdeOrigen(pass) {
  checkPass_(pass);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets_(ss);
    var origen = ss.getSheetByName(SHEET_ORIGEN);
    if (!origen) throw new Error('No encuentro la hoja "' + SHEET_ORIGEN + '".');
    var parsed = parseOrigen_(origen.getDataRange().getValues(), origen.getDataRange().getDisplayValues());

    var sh = ss.getSheetByName(SHEET_MOV);
    var values = sh.getDataRange().getValues();
    for (var r = values.length - 1; r >= 1; r--) {
      if (String(values[r][9]).indexOf(SHEET_ORIGEN) === 0) sh.deleteRow(r + 1);
    }
    var now = new Date();
    var rows = parsed.movimientos.map(function (m, i) {
      return ['H1-' + (i + 1), parseISODate_(m.fecha), m.tipo, m.descripcion, m.moneda, m.monto,
        m.persona, m.nota, m.liquidado, m.origen, now];
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, MOV_HEADERS.length).setValues(rows);

    var cfg = readConfig_(ss);
    if (parsed.dolar) cfg.dolar = parsed.dolar;
    parsed.socios.forEach(function (s) { if (cfg.socios.indexOf(s) < 0) cfg.socios.push(s); });
    writeConfig_(ss, cfg);
    return getData_();
  });
}

// ---------------------------------------------------------------- parseo de "Hoja 1"

/**
 * Convierte las celdas de la hoja original en movimientos.
 * values: getValues() (pueden venir Date / Number); display: getDisplayValues() (texto).
 * Función pura (sin SpreadsheetApp) para poder testearla.
 */
function parseOrigen_(values, display) {
  display = display || values;
  var out = { movimientos: [], socios: [], dolar: null };
  var hdr = findHeader_(display);
  if (!hdr) throw new Error('No encuentro la fila de encabezados (Fecha / Desc / Garpado x) en "' + SHEET_ORIGEN + '".');
  var c = hdr.cols;

  // Cotización: celda "Dolar" con el valor a la derecha.
  for (var r = 0; r < display.length && !out.dolar; r++) {
    for (var k = 0; k < display[r].length - 1; k++) {
      if (norm_(display[r][k]) === 'DOLAR') { out.dolar = parseMonto_(values[r][k + 1]) || null; break; }
    }
  }
  // Socios: encabezados del resumen, a la derecha de la tabla (ej. GCM EW LM JG ... Total).
  for (var k2 = c.max + 1; k2 < display[hdr.row].length; k2++) {
    var name = String(display[hdr.row][k2]).trim();
    if (name && norm_(name) !== 'TOTAL') out.socios.push(name);
  }

  // Gastos.
  // La fila "PAGADO" solo marca que esos servicios ya se pagaron al proveedor; no es una liquidación entre socios.
  var lastDate = null;
  for (var i = hdr.row + 1; i < display.length; i++) {
    var desc = String(display[i][c.desc] || '').trim();
    if (!desc || norm_(desc) === 'PAGADO') continue;
    var usd = parseMonto_(values[i][c.usd]);
    var ars = c.ars >= 0 ? parseMonto_(values[i][c.ars]) : 0;
    if (!usd && !ars) continue;
    var notas = [];
    [c.extra1, c.extra2].forEach(function (col) {
      if (col >= 0 && String(display[i][col] || '').trim()) notas.push(String(display[i][col]).trim());
    });
    var fecha = parseFecha_(values[i][c.fecha], display[i][c.fecha], lastDate);
    if (fecha) lastDate = fecha; else { fecha = lastDate; notas.push('(sin fecha en la planilla)'); }
    var moneda = usd ? 'USD' : 'ARS';
    if (usd && ars) notas.push('En la planilla también figura ARS ' + ars);
    out.movimientos.push({
      fecha: fecha ? toISO_(fecha) : '',
      tipo: 'Gasto',
      descripcion: desc,
      moneda: moneda,
      monto: usd || ars,
      persona: String(display[i][c.persona] || '').trim(),
      nota: notas.join(' · '),
      liquidado: false,
      origen: SHEET_ORIGEN + ' fila ' + (i + 1)
    });
  }

  // Ingresos: bloque "INGRESOS" | cliente1 | cliente2 ... y debajo filas "MES" | monto | monto.
  for (var r3 = 0; r3 < display.length; r3++) {
    for (var k3 = 0; k3 < display[r3].length; k3++) {
      if (norm_(display[r3][k3]) !== 'INGRESOS') continue;
      var clientes = [];
      for (var cc = k3 + 1; cc < display[r3].length && String(display[r3][cc]).trim(); cc++) {
        clientes.push({ col: cc, nombre: String(display[r3][cc]).trim() });
      }
      for (var rr = r3 + 1; rr < display.length; rr++) {
        var etiqueta = String(display[rr][k3] || '').trim();
        if (!etiqueta) break;
        var mes = MESES[norm_(etiqueta).slice(0, 3)];
        var anio = lastDate ? lastDate.getFullYear() : new Date().getFullYear();
        clientes.forEach(function (cl) {
          var monto = parseMonto_(values[rr][cl.col]);
          if (!monto) return;
          out.movimientos.push({
            fecha: mes ? toISO_(new Date(anio, mes - 1, 1)) : '',
            tipo: 'Ingreso',
            descripcion: cl.nombre + ' — ' + etiqueta,
            moneda: 'USD',
            monto: monto,
            persona: '',
            nota: 'Importado del bloque INGRESOS (verificar moneda y quién cobró)',
            liquidado: false,
            origen: SHEET_ORIGEN + ' fila ' + (rr + 1)
          });
        });
      }
    }
  }
  return out;
}

function findHeader_(display) {
  for (var r = 0; r < display.length; r++) {
    var row = display[r].map(norm_);
    var persona = row.indexOf('GARPADO X');
    var desc = row.indexOf('DESC');
    if (persona < 0 || desc < 0) continue;
    var cols = {
      fecha: row.indexOf('FECHA'),
      desc: desc,
      usd: indexStarting_(row, 'IMPORTE'),
      ars: row.indexOf('ARS'),
      persona: persona,
      extra1: persona + 1 < row.length ? persona + 1 : -1,
      extra2: persona + 2 < row.length ? persona + 2 : -1
    };
    // La tabla termina en la primera columna vacía después de las notas.
    cols.max = Math.max(cols.fecha, cols.desc, cols.usd, cols.ars, cols.extra2);
    // Las columnas de notas no tienen encabezado; si tienen texto de encabezado es el resumen.
    if (row[cols.extra1]) { cols.extra1 = -1; cols.extra2 = -1; cols.max = persona; }
    else if (row[cols.extra2]) { cols.extra2 = -1; cols.max = persona + 1; }
    return { row: r, cols: cols };
  }
  return null;
}

function indexStarting_(row, prefix) {
  for (var i = 0; i < row.length; i++) if (row[i].indexOf(prefix) === 0) return i;
  return -1;
}

// ---------------------------------------------------------------- helpers de hojas

function ensureSheets_(ss) {
  var mov = ss.getSheetByName(SHEET_MOV);
  if (!mov) {
    mov = ss.insertSheet(SHEET_MOV);
    mov.appendRow(MOV_HEADERS);
    mov.setFrozenRows(1);
  }
  var cfg = ss.getSheetByName(SHEET_CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEET_CONFIG);
    cfg.appendRow(['Clave', 'Valor']);
    cfg.appendRow(['Dolar', DEFAULT_DOLAR]);
    cfg.appendRow(['Socios', personasDesdeOrigen_(ss).join(', ')]);
  }
}

function readConfig_(ss) {
  var sh = ss.getSheetByName(SHEET_CONFIG);
  var cfg = { dolar: DEFAULT_DOLAR, socios: [] };
  if (!sh) return cfg;
  sh.getDataRange().getValues().forEach(function (row) {
    var key = norm_(row[0]);
    if (key === 'DOLAR') cfg.dolar = parseMonto_(row[1]) || DEFAULT_DOLAR;
    if (key === 'SOCIOS') cfg.socios = String(row[1] || '').split(',')
      .map(function (s) { return s.trim(); }).filter(function (s) { return s; });
  });
  return cfg;
}

function writeConfig_(ss, cfg) {
  var sh = ss.getSheetByName(SHEET_CONFIG);
  sh.clearContents();
  sh.getRange(1, 1, 3, 2).setValues([['Clave', 'Valor'], ['Dolar', cfg.dolar], ['Socios', cfg.socios.join(', ')]]);
}

function readMovimientos_(ss) {
  var sh = ss.getSheetByName(SHEET_MOV);
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    if (!v[0]) continue;
    out.push({
      id: String(v[0]),
      fecha: v[1] instanceof Date ? toISO_(v[1]) : String(v[1] || ''),
      tipo: v[2] === 'Ingreso' ? 'Ingreso' : 'Gasto',
      descripcion: String(v[3] || ''),
      moneda: v[4] === 'ARS' ? 'ARS' : 'USD',
      monto: Number(v[5]) || 0,
      persona: String(v[6] || ''),
      nota: String(v[7] || ''),
      liquidado: v[8] === true || norm_(v[8]) === 'TRUE',
      origen: String(v[9] || '')
    });
  }
  return out;
}

/** Nombres distintos de la columna "Garpado x" de la hoja original. */
function personasDesdeOrigen_(ss) {
  var sh = ss.getSheetByName(SHEET_ORIGEN);
  if (!sh) return [];
  var display = sh.getDataRange().getDisplayValues();
  var hdr = findHeader_(display);
  if (!hdr) return [];
  var out = [];
  for (var r = hdr.row + 1; r < display.length; r++) {
    var p = String(display[r][hdr.cols.persona] || '').trim();
    if (p && out.indexOf(p) < 0) out.push(p);
  }
  return out;
}

function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- helpers puros

function validarMovimiento_(mov) {
  mov = mov || {};
  var tipo = mov.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto';
  var monto = Number(mov.monto);
  if (!(monto > 0)) throw new Error('El monto tiene que ser un número mayor a 0.');
  var descripcion = String(mov.descripcion || '').trim();
  if (!descripcion) throw new Error('Falta la descripción.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(mov.fecha || ''))) throw new Error('Fecha inválida.');
  var persona = String(mov.persona || '').trim();
  if (tipo === 'Gasto' && !persona) throw new Error('Indicá quién hizo el gasto.');
  return {
    tipo: tipo, monto: Math.round(monto * 100) / 100, descripcion: descripcion,
    fecha: mov.fecha, moneda: mov.moneda === 'ARS' ? 'ARS' : 'USD', persona: persona,
    nota: String(mov.nota || '').trim()
  };
}

function norm_(s) {
  return String(s == null ? '' : s).trim().toUpperCase()
    .replace(/[ÁÀ]/g, 'A').replace(/[ÉÈ]/g, 'E').replace(/[ÍÌ]/g, 'I').replace(/[ÓÒ]/g, 'O').replace(/[ÚÙ]/g, 'U');
}

/** "$1,550" | " $ 11,600.00 " | "-$877,023" | 185144 → número. Formato de la planilla: coma = miles, punto = decimales. */
function parseMonto_(v) {
  if (typeof v === 'number') return v;
  var s = String(v == null ? '' : v).replace(/[$\s]/g, '').replace(/,/g, '');
  if (!s) return 0;
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Acepta Date, "3/7/2026", "07/08", "SEP". Devuelve Date o null. */
function parseFecha_(value, text, lastDate) {
  if (value instanceof Date && !isNaN(value)) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  var s = String(text || value || '').trim();
  if (!s) return null;
  var anioPrevio = lastDate ? lastDate.getFullYear() : new Date().getFullYear();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    var y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : anioPrevio;
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  var mes = MESES[norm_(s).slice(0, 3)];
  if (mes) return new Date(anioPrevio, mes - 1, 1);
  return null;
}

function parseISODate_(iso) {
  if (!iso) return '';
  var p = String(iso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function toISO_(d) {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
