# Facturas de Proyectos

App web instalable (PWA) para llenar las órdenes de compra, recibir las facturas de los proyectos, ordenarlas por obra y presentar cada pago con un PDF y un Excel. Está hecha para República Dominicana: NCF y e-NCF, RNC, ITBIS y factura electrónica (e-CF).

No necesita servidor, base de datos ni cuenta: se publica gratis en GitHub Pages, se instala en el iPhone desde Safari y guarda todo en el propio teléfono.

## Qué hace

- **Agregar facturas** desde la galería, la cámara o Archivos: fotos, PDF y XML de e-CF (varias a la vez).
- **Facturas electrónicas (e-CF):** lee el código QR de la DGII y toma el e-NCF, el RNC del emisor y del comprador, la fecha y el monto. También importa el XML y toma además el ITBIS. Si llega la foto y el XML de la misma factura, los junta. No necesita la clave de API ni tiene costo. Cada factura con QR trae el enlace **Verificar en la DGII**.
- **Facturas de papel (serie B):** con una clave de API, lee proveedor, RNC, NCF, fecha, ITBIS, total, obra y orden de compra o cubicación. Sin clave, los datos se llenan a mano.
- **Avisos:** factura de consumo (B02 o E32, no sirve para crédito fiscal), NCF vencido según su fecha "Válida hasta", NCF incompleto, dígito verificador del RNC, factura a nombre de otro RNC, posibles repetidas, facturas sin proyecto o sin monto y facturas sin orden de compra.
- **Obra:** la toma de campos como *Nota: CAPERUZA 2* y reconoce variantes como "caperuza II" para no duplicar proyectos. El NCF impreso con ceros delante (`00000000B0100003467`) se guarda limpio (`B0100003467`).
- **Órdenes de compra** (pestaña *Órdenes*), con el formato de la empresa:
  - Cada vez que piden materiales se llena la orden: obra, solicitante, proveedor, fecha requerida, lugar de entrega, departamento, artículos (cantidad, unidad y descripción) y observaciones. El número sigue solo (`OC-0001`, `OC-0002`…); en Ajustes se cambia el prefijo y el próximo número para seguir el talonario de la empresa.
  - Con la clave de API, se puede pegar el mensaje del pedido (por ejemplo, de WhatsApp) o usar una foto de la lista, y la orden se llena sola para revisarla.
  - **Guardar y sacar PDF** genera la orden en carta, igual al formato impreso: encabezado de la empresa, 12 renglones por página (sigue en otra página si hay más), firmas del solicitante y de quien autoriza, sello y la nota obligatoria. Se comparte por WhatsApp o correo para firmarla y sellarla.
  - Con la foto o el PDF de la orden firmada y sellada, la orden pasa de *Por firmar* a *Firmada*.
  - Cada factura se enlaza a su orden: sola, si la factura menciona el número ("OC-0012"); con la sugerencia **Asignar OC-…** cuando hay una orden del mismo proveedor para esa obra; o eligiéndola en la factura.
  - Una orden sin facturas se puede eliminar; si ya tiene facturas, solo se anula y queda en el registro.
- **Pagos:** eliges qué facturas entran (o un proyecto completo) y sale:
  - **PDF para presentar:** portada con el total y el ITBIS, totales por proyecto, detalle con RNC, NCF, orden de compra, fecha, ITBIS y total, firmas *Elaboró / Revisó / Autorizó*, y después cada factura seguida de su orden firmada y sellada, como pide la nota de la orden. Si la orden todavía no tiene la copia firmada, entra la orden marcada *COPIA SIN FIRMA*, y la pantalla del pago avisa qué facturas no tienen orden. Si una orden tiene varias facturas, la copia va una sola vez, después de la primera.
  - **Excel:** hoja *Resumen* y hoja *Facturas* (con la columna *Orden de compra*) con filtros, encabezado fijo, montos en RD$ y totales que se ajustan al filtrar.
- **Seguimiento:** cada pago pasa por *Por presentar → Presentado → Pagado*.
- **Funciona sin internet**, salvo la lectura automática de facturas de papel y de pedidos.

## Publicarla en GitHub Pages

1. Crea un repositorio **público** en GitHub, por ejemplo `facturas`. GitHub Pages gratis pide repositorio público: el código queda público, pero las facturas no, porque se guardan en cada teléfono.
2. Sube todo el contenido de esta carpeta a la rama `main`, con sus carpetas (`js`, `vendor`, `fonts`, `icons`). Incluye el archivo `.nojekyll`.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En un par de minutos queda en `https://TU-USUARIO.github.io/facturas/`.

## Instalarla en el iPhone

1. Abre el enlace en **Safari**.
2. Toca **Compartir → Agregar a pantalla de inicio**.
3. Ábrela desde el ícono.

En iPhone, lo que guardes en Safari no pasa a la app instalada: instálala antes de empezar a cargar facturas.

En Android: Chrome → menú → **Instalar app**.

## Dónde quedan los datos

- En el propio teléfono, en el almacenamiento del navegador (IndexedDB). No hay servidor ni nube.
- **Respaldo:** Ajustes → **Descargar respaldo** genera un `.zip` con los datos y los archivos (facturas, órdenes y sus copias firmadas). Guárdalo en iCloud Drive o en la computadora. Se recupera con **Restaurar un respaldo**, que reemplaza todo. La app recuerda hacerlo cada 7 días.
- Si se borra la app o los datos de Safari, o se pierde el teléfono, sin respaldo se pierde la información.
- Solo salen del teléfono las fotos de facturas de papel y los pedidos (mensaje o foto) que se mandan a la API para leerlos (si configuras la clave), y los archivos que tú compartas.

## Lectura automática de facturas de papel y pedidos (opcional)

- Crea una clave en [platform.claude.com](https://platform.claude.com) (sección API Keys) y pégala en **Ajustes → Lectura automática → Probar la clave**. Conviene una clave solo para esta app, en un espacio de trabajo con límite de gasto.
- La clave se guarda solo en el teléfono y no va en los respaldos. Como la app llama a la API directo desde el teléfono, quien tenga el teléfono desbloqueado podría verla: si pierdes el equipo, revócala en la consola.
- Costo aproximado por factura (una foto, a precios de lista de noviembre de 2026; varía con cada factura, revisa el uso real en la consola):

  | Modelo | Costo aproximado por factura |
  |---|---|
  | Más precisa (Opus 5.5, la predeterminada) | US$0.02 a 0.05 |
  | Equilibrada (Sonnet 5.5) | US$0.01 a 0.03 |
  | Más económica (Haiku 5.5) | alrededor de US$0.001 |

- Llenar una orden desde el mensaje del pedido cuesta menos que leer una factura, porque casi siempre es solo texto.
- Las facturas electrónicas con QR o XML no necesitan esta lectura para los datos fiscales.

## Actualizar la app

Al cambiar archivos, sube también `sw.js` con un número nuevo en `VERSION` (por ejemplo `facturas-1.1.1`). Al abrirla, la app avisa que hay una versión nueva y se actualiza con un toque.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `index.html` | Pantallas y estilos |
| `js/app.js` | Lógica de la app: facturas, órdenes de compra, pagos, PDF, Excel y respaldos |
| `js/rd.js` | NCF y e-NCF, RNC, código QR y XML de la DGII |
| `js/runtime.js` | Almacenamiento en el teléfono y lectura de facturas y pedidos por API |
| `js/xlsx-zip.js` | Archivos Excel y `.zip` |
| `sw.js` | Funcionamiento sin internet |
| `manifest.webmanifest`, `icons/` | Instalación como app |
| `vendor/`, `fonts/` | Librerías y fuentes de terceros |

## Licencias de terceros

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1: MIT
- [PDF.js](https://github.com/mozilla/pdf.js) (pdfjs-dist) 3.11.174: Apache 2.0
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0: Apache 2.0
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) 1.3.0, empaquetado en un solo archivo: Apache 2.0
- Fuentes [Archivo](https://fonts.google.com/specimen/Archivo) e [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono): SIL Open Font License 1.1

Los textos de las licencias de las librerías están en `vendor/licencias/`.

## Límites conocidos

- Cada teléfono tiene sus propios datos: no se sincronizan entre dispositivos. Para pasarlos de uno a otro, usa el respaldo.
- No consulta a la DGII por su cuenta: el enlace del QR abre la consulta oficial para verificar.
- Está pensada para el trabajo de una persona. Para varios usuarios con permisos y respaldo central hace falta un servidor.
