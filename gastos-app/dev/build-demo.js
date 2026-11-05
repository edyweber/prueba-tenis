/**
 * Genera una versión demo autocontenida (un solo HTML) que corre Code.gs en el navegador
 * contra una copia de "Hoja 1". Lo que se carga queda solo en ese navegador.
 *
 *   node dev/build-demo.js <salida.html>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || path.join(__dirname, 'demo.html');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixture-hoja1.json'), 'utf8');

const style = html.match(/<style>[\s\S]*?<\/style>/)[0]
  .replace('</style>', `
  :root[data-theme="dark"] {
    --bg: #11141a; --card: #1a1f29; --ink: #e8ebf1; --muted: #98a2b3; --line: #2b3240;
    --accent: #7c9cff; --accent-ink: #0b1020; --gasto: #ff8a65; --ingreso: #47cd89;
    --warn-bg: #3a2a0c; --warn: #fdb022; --bar: #3d5bb8; color-scheme: dark;
  }
  .demo { max-width: 1100px; margin: 12px auto 0; padding: 0 16px; }
  .demo div { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: 8px 14px; font-size: 13px; }
</style>`)
  .replace('@media (prefers-color-scheme: dark) {\n    :root {', '@media (prefers-color-scheme: dark) {\n    :root:not([data-theme="light"]) {');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];

const shim = `
<script>
(function () {
  // ---- planilla simulada en memoria (copia de "Hoja 1") ----
  var KEY = 'gastos-demo-sheets';
  function revive(k, v) { return v && typeof v === 'object' && v.$date ? new Date(v.$date) : v; }
  var data;
  try { data = JSON.parse(localStorage.getItem(KEY), revive); } catch (e) {}
  if (!data) data = ${fixture};
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data, function (k, v) { return this[k] instanceof Date ? { $date: this[k].toISOString() } : v; }));
    } catch (e) {}
  }
  function text(v) { return v instanceof Date ? v.getDate() + '/' + (v.getMonth() + 1) + '/' + v.getFullYear() : v === true ? 'TRUE' : v === false ? 'FALSE' : v == null ? '' : String(v); }
  function Sheet(name) { this.name = name; }
  Sheet.prototype = {
    rows: function () { return data[this.name]; },
    width: function () { return Math.max.apply(null, [1].concat(this.rows().map(function (r) { return r.length; }))); },
    getLastRow: function () { return this.rows().length; },
    appendRow: function (r) { this.rows().push(r.slice()); },
    deleteRow: function (n) { this.rows().splice(n - 1, 1); },
    clearContents: function () { data[this.name] = []; },
    setFrozenRows: function () {},
    getDataRange: function () { return this.getRange(1, 1, Math.max(1, this.rows().length), this.width()); },
    getRange: function (r, c, nr, nc) {
      var sh = this; nr = nr || 1; nc = nc || 1;
      function read() { var o = []; for (var i = 0; i < nr; i++) { var row = sh.rows()[r - 1 + i] || [], a = [];
        for (var j = 0; j < nc; j++) { var v = row[c - 1 + j]; a.push(v === undefined ? '' : v); } o.push(a); } return o; }
      return {
        getValues: read,
        getDisplayValues: function () { return read().map(function (row) { return row.map(text); }); },
        setValues: function (vals) { vals.forEach(function (row, i) { while (sh.rows().length < r + i) sh.rows().push([]);
          row.forEach(function (v, j) { sh.rows()[r - 1 + i][c - 1 + j] = v; }); }); return this; }
      };
    }
  };
  var ss = {
    getSheetByName: function (n) { return data[n] ? new Sheet(n) : null; },
    insertSheet: function (n) { data[n] = []; return new Sheet(n); }
  };
  var SpreadsheetApp = { getActiveSpreadsheet: function () { return ss; } };
  var LockService = { getDocumentLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  var Utilities = { getUuid: function () { return Math.random().toString(16).slice(2) + Date.now().toString(16); } };
  var HtmlService = null;

  // ---- Code.gs tal cual ----
${code}

  // ---- reemplazo de google.script.run ----
  var api = { login: login, getData: getData, addMovimiento: addMovimiento, deleteMovimiento: deleteMovimiento,
    saveConfig: saveConfig, liquidarTodo: liquidarTodo, importarDesdeOrigen: importarDesdeOrigen };
  function runner(ok, fail) {
    var r = { withSuccessHandler: function (f) { return runner(f, fail); }, withFailureHandler: function (f) { return runner(ok, f); } };
    Object.keys(api).forEach(function (k) {
      r[k] = function () { var args = arguments;
        setTimeout(function () {
          try { var res = JSON.parse(JSON.stringify(api[k].apply(null, args))); save(); ok && ok(res); }
          catch (e) { fail && fail(e); }
        }, 120); };
    });
    return r;
  }
  window.google = { script: { run: runner() } };
  window.confirm = function () { return true; };
  window.resetDemo = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
})();
</script>`;

const demoBanner = `<div class="demo"><div><b>Demo.</b> Usa una copia de tu planilla; lo que cargues acá queda solo en tu navegador y no toca el Google Sheet.
Contraseña: <b>gastos2026</b> · <a href="#" onclick="resetDemo();return false" style="color:inherit">empezar de cero</a></div></div>`;

const page = `<title>Gastos y cuentas</title>
${style}
${shim}
${demoBanner}
${body}`;
fs.writeFileSync(out, page);
console.log('demo →', out, (page.length / 1024).toFixed(0) + ' KB');
