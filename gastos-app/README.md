# Gastos y cuentas

Web app para resumir los gastos de la planilla **“planilla pedorra de gastos”** (Google Sheets),
cargar gastos e ingresos nuevos y llevar las cuentas entre socios.

Corre como **Google Apps Script** pegado a la misma planilla: no hace falta servidor ni base de datos,
los datos quedan en el Sheet y se publica con una URL pública protegida con contraseña.

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
