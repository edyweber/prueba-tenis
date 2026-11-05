# Gastos y cuentas

Web app para llevar los gastos e ingresos entre socios (GCM, EW, LM, JG), todo en dólares.

**App:** https://gastos-y-cuentas.vercel.app (contraseña: `gastos2026`, se cambia en
`vercel/lib/app.js`, constante `PASSWORD`).

Publicada en Vercel (proyecto `gastos-y-cuentas`). Los datos se guardan en un almacenamiento privado de
Vercel Blob (`gastos-datos`): `gastos/estado.json` y una copia por cada cambio en `gastos/historial/`
(se guardan las últimas 100). Para publicar cambios: `cd vercel && npx vercel deploy --prod`.

La planilla de Google (“planilla pedorra de gastos”) se usó **solo como punto de partida**: sus 53 gastos
y el ingreso de octubre se cargaron una vez en la base de datos de la app. Desde ahí todo se carga y se
consulta en la app; la planilla ya no se usa.

## Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `vercel/` | **La app**: `index.html` (pantalla), `api/data.js` + `lib/` (servidor, contraseña, datos). `npm run dev` / `npm test`. |
| `web/index.html` | Versión anterior publicada en claude.ai (ya no se usa). |
| `seed/` | Datos iniciales sacados de la planilla (`dev/make-seed.js` los genera). |
| `src/Code.gs`, `src/Index.html` | Versión anterior como Google Apps Script (ya no se usa; su parser de la planilla generó el seed). |
| `dev/`, `test/` | Copia de la planilla, servidor local y tests del parser. |

### Formato de los datos (`gastos/estado.json`)

- `movimientos.<id>`: `fecha` (aaaa-mm-dd), `tipo` (Gasto/Ingreso), `descripcion`, `moneda` (USD/ARS),
  `monto`, `persona`, `nota`, `liquidado`, `origen`, `creado` (ms).
- `config`: `dolar`, `socios`, `personas`, `liquidadoHasta` (ms: lo creado antes queda liquidado).

### Quién puede usarla

Cualquiera que tenga la URL y la contraseña, desde cualquier navegador, sin cuenta.

---

> Lo que sigue describe la versión anterior en Google Apps Script, que ya no se usa.

## Qué hace

- **Resumen**: gastos, ingresos y resultado, todo en dólares (lo pagado en pesos se convierte con la cotización configurada), gastos por
  persona, por mes y por concepto.
- **Cuentas entre socios**: cuánto pagó y cobró cada uno, cuánto le toca (resultado repartido en partes
  iguales) y las transferencias sugeridas para quedar a mano. Lo que no tiene persona asignada (por
  ejemplo un ingreso que entró a la cuenta común) va a la **Caja común**.
- **Cargar** gastos (quién pagó: los nombres salen de la columna “Garpado x”) e ingresos (quién cobró, o
  caja común), en USD o ARS.
- **Movimientos**: lista con filtros (tipo, persona, mes, pendiente/liquidado, búsqueda) y borrado.
- **Configuración**: cotización del dólar, lista de socios, importar “Hoja 1”, “marcar todo como
  liquidado” cuando se saldan las cuentas.

## Cómo guarda los datos

La app no modifica “Hoja 1”. Crea dos hojas nuevas en la misma planilla:

| Hoja | Contenido |
|---|---|
| `Movimientos` | Libro diario: ID, fecha, tipo (Gasto/Ingreso), descripción, moneda, monto, persona, nota, liquidado, origen |
| `Config` | Cotización del dólar y socios |

**Importar “Hoja 1”** copia los gastos históricos a `Movimientos`:
- Las filas por encima de la fila “PAGADO” quedan marcadas como liquidadas.
- Las fechas sin año (“07/08”) toman el año de la fila anterior; “SEP” → 1/9; las filas sin fecha heredan
  la de arriba (queda anotado en la nota).
- Si una fila tiene USD y ARS a la vez, se toma USD y el monto ARS queda en la nota.
- El bloque “INGRESOS” (Jorge / Morando × mes) se importa como ingresos en USD a la caja común.
- Los socios salen de los encabezados del resumen (GCM, EW, LM, JG) y la cotización de la celda “Dolar”.

Se puede re-importar cuando quieras: reemplaza solo lo que vino de “Hoja 1” y no toca lo cargado desde la app.

## Publicarla (una sola vez, ~5 minutos)

1. Abrí la planilla → **Extensiones → Apps Script**.
2. En el editor:
   - Reemplazá el contenido de `Código.gs` con [`src/Code.gs`](src/Code.gs).
   - **Archivo → + → HTML**, llamalo `Index` y pegá [`src/Index.html`](src/Index.html).
   - (Opcional) **Configuración del proyecto → Mostrar el archivo de manifiesto** y pegá
     [`src/appsscript.json`](src/appsscript.json).
3. **Cambiá la contraseña**: en `Code.gs`, la línea `var PASSWORD = 'gastos2026';`.
4. **Implementar → Nueva implementación → Tipo: Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Autorizá los permisos (la app necesita leer/escribir esta planilla) y copiá la URL `…/exec`.
6. Abrí la URL, poné la contraseña y tocá **Importar ahora**.

Pasale la URL y la contraseña a los demás. La contraseña queda recordada en cada navegador (botón
“Salir” para olvidarla).

Para publicar cambios: **Implementar → Administrar implementaciones → editar → Versión: nueva**
(así la URL no cambia).

Con [clasp](https://github.com/google/clasp) también se puede subir desde la terminal:
`clasp clone <scriptId> --rootDir src` y después `clasp push`.

## Seguridad

Es una protección simple, como se pidió: una contraseña compartida y fija en el código. Cualquiera que
tenga la URL y la contraseña puede ver y cargar movimientos. La contraseña nunca se manda al navegador;
el servidor la valida en cada operación. Como la app se ejecuta con tu cuenta, solo puede tocar esta planilla.

## Desarrollo local

Hay un servidor que ejecuta el mismo `Code.gs` con Node contra una copia de “Hoja 1”
(`dev/fixture-hoja1.json`), simulando `SpreadsheetApp`:

```bash
npm run dev        # http://localhost:3000  (contraseña: gastos2026)
npm run dev:reset  # arranca de cero desde la copia de Hoja 1
npm test
```
