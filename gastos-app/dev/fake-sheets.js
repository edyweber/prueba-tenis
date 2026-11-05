/**
 * Simulación mínima de SpreadsheetApp / HtmlService / LockService / Utilities
 * para ejecutar Code.gs con Node (desarrollo local y tests).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function cellText(v) {
  if (v instanceof Date) return `${v.getDate()}/${v.getMonth() + 1}/${v.getFullYear()}`;
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return v == null ? '' : String(v);
}

class FakeSheet {
  constructor(name, rows) { this.name = name; this.rows = rows || []; }
  width() { return Math.max(1, ...this.rows.map(r => r.length)); }
  getLastRow() { return this.rows.length; }
  appendRow(row) { this.rows.push(row.slice()); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.rows.length), this.width()); }
  getRange(r, c, nr, nc) {
    const sheet = this;
    nr = nr || 1; nc = nc || 1;
    const read = () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => { const row = sheet.rows[r - 1 + i]; const v = row ? row[c - 1 + j] : undefined; return v === undefined ? '' : v; }));
    return {
      getValues: read,
      getDisplayValues: () => read().map(row => row.map(cellText)),
      setValues(vals) {
        vals.forEach((row, i) => {
          while (sheet.rows.length < r + i) sheet.rows.push([]);
          row.forEach((v, j) => { sheet.rows[r - 1 + i][c - 1 + j] = v; });
        });
        return this;
      }
    };
  }
}

class FakeSpreadsheet {
  constructor(data) { this.sheets = Object.entries(data).map(([n, rows]) => new FakeSheet(n, rows)); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n, []); this.sheets.push(s); return s; }
  toJSON() { return Object.fromEntries(this.sheets.map(s => [s.name, s.rows])); }
}

/** Revive fechas guardadas como {"$date": "..."} en JSON. */
function reviveDates(data) {
  return JSON.parse(JSON.stringify(data), (k, v) => (v && typeof v === 'object' && v.$date ? new Date(v.$date) : v));
}
function serialize(ss) {
  return JSON.stringify(ss.toJSON(), function (k, v) {
    const raw = this[k];
    return raw instanceof Date ? { $date: raw.toISOString() } : v;
  });
}

/** Carga Code.gs en un contexto aislado con la planilla dada. */
function loadApp(data) {
  const ss = new FakeSpreadsheet(reviveDates(data));
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    HtmlService: null,
    Date, Math, JSON, Number, String, Object, Array, isNaN, parseFloat, Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
  // Los objetos que vuelven del contexto vm se pasan por JSON, como hace google.script.run.
  const api = {};
  ['login', 'getData', 'addMovimiento', 'deleteMovimiento', 'saveConfig', 'liquidarTodo', 'importarDesdeOrigen', 'parseOrigen_']
    .forEach(fn => { api[fn] = (...args) => JSON.parse(JSON.stringify(context[fn](...args))); });
  return { ss, api, serialize: () => serialize(ss) };
}

module.exports = { loadApp };
