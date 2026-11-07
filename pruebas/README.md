# Pruebas

Pruebas automáticas de la app: abren la app en un navegador (Chromium), hacen lo que haría una persona (agregar facturas, conduces, órdenes, pagos, el pase de lista…) y revisan el resultado, también dentro de los PDF y los Excel que salen.

Usan solo datos inventados. Las muestras (dos facturas en PDF y dos fotos de un conduce) las genera `muestras.py` cada vez. La lectura automática se simula: las pruebas no usan ninguna clave ni internet.

## Qué hace falta

- Node 18 o más nuevo, con Playwright y su Chromium:

  ```bash
  npm install --no-save playwright
  ```

  ```bash
  npx playwright install chromium
  ```

- Python 3 con Pillow, reportlab y openpyxl:

  ```bash
  pip install pillow reportlab openpyxl
  ```

- `pdftotext`, `pdfinfo` y `pdftoppm` (paquete *poppler-utils*) y LibreOffice (`soffice`), que usa la prueba del Excel para abrirlo y calcular sus fórmulas.

## Correrlas

Desde la carpeta de la app:

```bash
node pruebas/correr.js
```

Para correr solo algunas:

```bash
node pruebas/correr.js conduces.js abonos.js
```

Cada prueba dice `OK` o `FALLA` en cada revisión, y al final `correr.js` dice cuáles pasaron. Los archivos que salen (PDF, Excel y capturas) quedan en la carpeta temporal `facturas-pruebas` (se cambia con la variable `PRUEBAS_TMP`).

| Prueba | Qué revisa |
|---|---|
| `codigo-qr.js` | El código QR de las órdenes se dibuja bien y se puede leer. |
| `actualizacion.js` | La app se actualiza sola cuando hay versión nueva. |
| `con-y-sin-orden.js` | Las etiquetas de orden de compra, el filtro Con orden / Sin orden, el PDF del pago y el Excel. |
| `excel.js` | El Excel detallado: hojas, columnas, totales por moneda y fórmulas (abierto con LibreOffice). |
| `conduces.js` | Conduces: lectura, enlace solo a su factura, conduces esperando factura, PDF y Excel; órdenes por proyecto. |
| `notas-credito-cruce-fechas.js` | Notas de crédito que restan, avisos del cruce orden-conduce-factura, filtro por fecha y listas largas. |
| `pase-de-lista.js` | Obreros, marcas de entrada, pase sorpresa y salida, reglas de la empresa (tardanza y sábado, medio día), resumen, Excel y PDF de la planilla. |
| `paginas-y-grapa.js` | Factura y orden engrapadas en un PDF, agregar página, «Es otra página» y separar páginas. |
| `proveedores-presupuesto.js` | Ficha de proveedores, vencimientos, banco en el pago, precio estimado y presupuesto por obra. |
| `fotos-computadora-errores.js` | Recortar y enderezar fotos, vista de computadora (menú a la izquierda, tablas que se ordenan y panel a la derecha), registro de errores y la protección de la página. |
| `abonos.js` | Abonos: balance en la factura, y el pago, el PDF y el Excel con lo que falta por pagar. |
| `conduces-apartado.js` | La pestaña Conduces, los conduces que se adjuntan solos cuando suman lo mismo que la factura, marcar varios en la factura y la dirección del panel de la nube. |
| `respaldo-papelera-nube.js` | La papelera (Deshacer, recuperar, se vacía a los 30 días), el respaldo automático en la nube y restaurarlo, el indicador de la nube, el aviso cuando Supabase la pausa y el recordatorio mensual del respaldo. |
| `pantallas.js` | En el teléfono, las 5 pestañas con «Más», «Para hacer» corto y las etiquetas secundarias; en la computadora, los filtros en una barra, la tabla a la vista y marcar varias facturas para pago, digitadora o Excel. |
| `revision-planilla.js` | En la computadora: la factura con su documento al lado (PDF y foto), el pase de lista como la planilla de papel y las facturas del pago en tabla; en el teléfono no cambia. |
| `digitadora.js` | Envíos a la digitadora: lo que falta por mandar, el aviso de la tarde para mandar las de hoy, la lista por día, el PDF con la fecha y la lista en papel, confirmar, «No se la mandé», deshacer y el Excel. |
