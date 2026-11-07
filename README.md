# Facturas de Proyectos

App web instalable (PWA) para llenar las órdenes de compra, recibir las facturas de los proyectos, ordenarlas por obra y presentar cada pago con un PDF y un Excel. Está hecha para República Dominicana: NCF y e-NCF, RNC, ITBIS y factura electrónica (e-CF).

No necesita servidor, base de datos ni cuenta: se publica gratis en GitHub Pages, se instala en el iPhone desde Safari y guarda todo en el propio teléfono.

## Qué hace

- **Agregar facturas** desde la galería, la cámara o Archivos: fotos, PDF y XML de e-CF (varias a la vez).
- **Facturas electrónicas (e-CF):** lee el código QR de la DGII y toma el e-NCF, el RNC del emisor y del comprador, la fecha y el monto. También importa el XML y toma además el ITBIS. Si llega la foto y el XML de la misma factura, los junta. No necesita la clave de API ni tiene costo. Cada factura con QR trae el enlace **Verificar en la DGII**.
  - El QR no trae el nombre del proveedor: la app lo toma de una factura anterior con el mismo RNC (o del XML, que sí lo trae).
  - Busca el QR en la foto original y por partes, porque en muchas facturas mide 2 o 3 cm. Si una foto llega muy comprimida y el QR no se lee, pide la factura en PDF o mándala por WhatsApp como *documento*.
- **Facturas de papel (serie B):** con una clave de API, lee proveedor, RNC, NCF, fecha, ITBIS, total, obra y orden de compra o cubicación. Sin clave, los datos se llenan a mano.
- **Avisos:** factura de consumo (B02 o E32, no sirve para crédito fiscal), NCF vencido según su fecha "Válida hasta", NCF incompleto, dígito verificador del RNC, factura a nombre de otro RNC, posibles repetidas, facturas sin proyecto o sin monto y facturas sin orden de compra.
- **Notas de crédito** (B04 o E34): restan del total del pago, de lo que se le paga al proveedor y de los totales del Excel (el monto y el ITBIS se guardan en negativo). No piden orden de compra.
- **Obra:** la toma de campos como *Nota: CAPERUZA 2* y reconoce variantes como "caperuza II" para no duplicar proyectos. El NCF impreso con ceros delante (`00000000B0100003467`) se guarda limpio (`B0100003467`).
- **Varias páginas:** si una factura viene en varias fotos, **Agregar página** las junta en la misma factura; una foto que entró sola se pasa con **Es otra página**. La lectura automática y el PDF del pago usan todas las páginas.
- **La grapa:** si la factura y la orden firmada se escanean juntas en un PDF, la app reconoce el código QR de la orden: esa página queda como la copia firmada de la orden y la factura se enlaza a ella. Para lo demás, **Separar páginas** dice qué es cada página (factura, conduce, orden firmada, otra factura o quitar) y la app arma cada parte.
- **Recortar la foto:** en la factura, **Recortar la foto** endereza la hoja arrastrando sus cuatro esquinas y quita lo que sobra (la mesa, los dedos); también se puede girar. La foto original se guarda y se vuelve a ella con **Volver a la foto original**.
- **Órdenes de compra** (pestaña *Órdenes*), con el formato de la empresa:
  - Cada vez que piden materiales se llena la orden: obra, solicitante, proveedor, fecha requerida, lugar de entrega, departamento, artículos (cantidad, unidad y descripción) y observaciones. El número sigue solo (`OC-0001`, `OC-0002`…); en Ajustes se cambia el prefijo y el próximo número para seguir el talonario de la empresa.
  - Con la clave de API, se puede pegar el mensaje del pedido (por ejemplo, de WhatsApp) o usar una foto de la lista, y la orden se llena sola para revisarla.
  - **Guardar y sacar PDF** genera la orden en carta, igual al formato impreso: encabezado de la empresa, 12 renglones por página (sigue en otra página si hay más), firmas del solicitante y de quien autoriza, sello y la nota obligatoria. Se comparte por WhatsApp o correo para firmarla y sellarla.
  - Cada orden lleva un **código QR** pequeño arriba a la derecha. Cuando llega la foto de la orden firmada y sellada, basta con agregarla con **+** junto con las facturas: la app reconoce el código y la adjunta sola a su orden, que pasa de *Por firmar* a *Firmada*. También se puede adjuntar desde la orden. El PDF que hizo la app (sin firmar) no se acepta como firmada. El código se quita en Ajustes si no se quiere.
  - Cada factura se enlaza a su orden: sola, si la factura trae el número (el XML de la e-CF en *NumeroOrdenCompra*, un PDF que dice "Orden de compra: 0012", o la lectura automática que encuentra "OC-0012"); con la sugerencia **Asignar OC-…** cuando hay una orden del mismo proveedor (por nombre o por RNC); o eligiéndola en la factura. Si a la factura le falta la obra o el proveedor, los toma de la orden.
  - Si de un proveedor hay **una sola orden abierta** (por firmar o firmada, todavía sin factura), su factura se enlaza sola a ella y lo avisa, por si hay que cambiarla. Con dos o más abiertas no adivina: sugiere.
  - **Con orden o sin ella, a la vista:** en *Facturas*, cada factura lleva su número de orden (`OC-0012` en verde si está firmada, en ámbar si está por firmar, en rojo si se anuló). Las que no tienen dicen *Sin orden* (en rojo si la debían llevar) o *No lleva orden*. El filtro **Todas / Con orden / Sin orden** muestra cada grupo con su cantidad, y el Excel y el pago que se arman desde ahí salen solo con esas. La búsqueda también encuentra por número de orden.
  - Estados: *Por firmar*, *Sin factura* (firmada, esperando la factura), *Completas* y *Todas*. Las órdenes salen **divididas por proyecto** (cada obra con cuántas tiene y cuántas faltan por firmar) y se pueden filtrar por proyecto; la orden nueva toma el proyecto elegido.
  - Cada artículo puede llevar un **precio** (opcional; no sale en el PDF de la orden): la orden calcula el estimado y la factura avisa si cobra, sin ITBIS, más de lo estimado.
  - **Repetir esta orden** crea una nueva con el mismo proveedor, obra y artículos. Al elegir la obra se llenan el lugar de entrega, quién pide y el departamento de la última orden de esa obra; los artículos de órdenes anteriores salen como sugerencia y traen su unidad.
  - **Pegar y llenar** toma el mensaje que copiaste de WhatsApp y llena la orden (con la clave de API). **Compartir la firmada** manda la copia firmada al proveedor.
  - Una orden sin facturas se puede eliminar; si ya tiene facturas, solo se anula y queda en el registro.
- **Conduces:** cuando la factura viene con su conduce (la nota de entrega del material, por ejemplo de agregados), se guarda con ella. Si los conduces llegan antes y la factura después, esperan en su pestaña hasta que llegue:
  - **Pestaña Conduces:** los que esperan factura (*Sin factura*), los que ya la tienen y todos, por proveedor y con lo que suman, para compararlo con la factura cuando llegue. Se busca por número, proveedor, material u obra, y **Agregar conduces** agrega los que llegan solos (fotos o PDF).
  - En la factura, **Agregar conduce** (foto o PDF; varios a la vez). Con la clave de API se lee solo: número, fecha, material, cantidad, viajes y total.
  - Si se agregan con **+** junto con las facturas, la lectura reconoce que es un conduce y no lo cuenta como factura. Se adjunta solo a su factura cuando la factura menciona el número del conduce, cuando es del mismo proveedor y el monto coincide, o cuando se agregaron juntos; si no, queda en **Para hacer → conduces esperando su factura** y la factura del mismo proveedor lo sugiere.
  - **Una factura que junta varios conduces:** si no dice sus números, se le adjuntan solos los conduces que esperan de ese proveedor, del más viejo al más nuevo, cuando suman lo mismo que la factura (con o sin ITBIS); los de después de la fecha de la factura no entran. Si no cuadran, la factura muestra los conduces que esperan con casillas: marcas los que son, dice cuánto suman al lado del monto de la factura, y **Adjuntar** los pega de una vez. A una factura que ya cuadra con sus conduces no se le pegan más solos.
  - Sin clave, la foto entra como factura sin datos y con **Es un conduce** se pasa a conduce.
  - Cada factura muestra su etiqueta *Conduce 39807* (o *2 conduces*) y la búsqueda encuentra por número de conduce. Si el mismo conduce (mismo proveedor y número) se agrega dos veces, la factura avisa *¿Conduce repetido?* para que no se pague doble. Si se elimina la factura, sus conduces se quedan, esperando factura.
  - **Cruce orden, conduce y factura:** la factura avisa si cobra más (sin ITBIS) de lo que suman sus conduces, si menciona un conduce que no está adjunto, o si los conduces de su orden traen más cantidad de un material que la que pidió la orden (en la misma unidad: m³, viajes, fundas…). La orden también lo avisa. Después de revisarlo, cada aviso se quita con **Está bien** o **No hace falta**.
- **Proveedores** (botón en *Proyectos*): una ficha por proveedor con RNC, teléfono, banco, tipo y número de cuenta, si es persona física y días de crédito. Se crea desde sus facturas. Con los días de crédito, cada factura dice cuándo vence y *Para hacer* avisa las vencidas y las que vencen esta semana. El banco y la cuenta salen en el PDF del pago (en *Por proveedor*) y en el Excel, para hacer las transferencias.
- **Presupuesto por obra:** en cada proyecto se escribe su presupuesto y la app muestra lo gastado (facturas más la mano de obra del pase de lista), el porcentaje, lo que queda y las órdenes por facturar. En *Proyectos*, cada obra lleva su barra.
- **Abonos:** si a una factura ya se le pagó una parte (un abono o un avance), se anota en la factura con su fecha y una nota. La tarjeta dice el *Balance*, y el pago, su PDF y su Excel toman solo lo que falta (el Excel muestra lo abonado y lo que queda por pagar). Si los abonos cubren todo el monto, la factura queda pagada.
- **Digitadora:** cada factura sabe si ya se le mandó a la digitadora. Las que faltan llevan la etiqueta *Por digitar* y *Para hacer* dice cuántas son. **Mandar** junta las que elijas en un PDF (la lista y cada factura detrás) para mandarlo por WhatsApp o correo, o saca solo la lista para entregarla en papel con firma de recibido. Nada queda marcado hasta que confirmas que se lo mandaste; entonces quedan marcadas con la fecha y el número de envío, y la factura lo dice al abrirla. Si una no salió, **No se la mandé** la devuelve a la lista; si se la mandaste por fuera, **Ya se la mandé** la marca. Para mandarle las de cada día al final del día: en la tarde (desde las 3; el sábado desde las 11) *Para hacer* pone arriba **Manda las de hoy a la digitadora** y, cuando ya salieron, dice **Hoy ya le mandaste…** con el número del envío. En **Mandar** salen separadas por el día en que se agregaron (las de días anteriores dicen *sin mandar*), y el PDF lleva la fecha del día; si van de varios días, cada día sale aparte. En *Proyectos → Digitadora* están los envíos anteriores, cada uno con sus facturas, y el PDF se puede sacar otra vez. El Excel tiene la columna *Mandada a digitar*.
- **Pagos:** eliges qué facturas entran (o un proyecto completo) y sale:
  - **PDF para presentar:** portada con el total y el ITBIS, totales por proyecto, detalle con RNC, NCF, orden de compra (o *Sin OC* / *No lleva*), fecha, ITBIS y total, firmas *Elaboró / Revisó / Autorizó*, y después cada factura seguida de sus conduces y de su orden firmada y sellada, como pide la nota de la orden. Si la orden todavía no tiene la copia firmada, entra la orden marcada *COPIA SIN FIRMA*, y la pantalla del pago avisa qué facturas no tienen orden. Si una orden tiene varias facturas, la copia va una sola vez, después de la primera.
  - En la portada también van los **totales por proveedor** con su RNC, para hacer una transferencia por proveedor.
  - **Excel detallado**, con filtros, encabezado fijo, montos en RD$ (y US$ si hay) y totales que se ajustan al filtrar:
    - *Resumen*: por proyecto (subtotal, ITBIS y total), por estado y un control de cuántas tienen orden de compra, cuántas no y cuántas no la llevan, más lo que falta (órdenes sin firmar, avisos, facturas de consumo, electrónicas verificables).
    - *Facturas*: proyecto, proveedor, RNC, NCF, tipo, vencimiento del NCF, fecha, concepto, orden de compra y su estado, quién la pidió, referencia, conduces, subtotal sin ITBIS, ITBIS, total, estado, pago, fecha del pago, de dónde salieron los datos (QR, XML, lectura automática o a mano), avisos, enlace **Verificar** a la DGII, fecha en que se agregó y fecha en que se mandó a digitar. Al imprimir ocupa 3 hojas de ancho y repite las columnas que identifican la factura.
    - *Por proveedor*, *Órdenes* (las órdenes de esas facturas), *Artículos* (lo que se pidió en cada orden) y *Conduces* (número, fecha, material, cantidad, viajes, total y su factura).
- **En el teléfono**, abajo están *Facturas*, *Conduces*, *Órdenes*, *Pagos* y **Más**, que tiene el Pase de lista, Proyectos, Proveedores, la Digitadora, la Papelera y Ajustes. En las tarjetas, lo que casi todas tienen (*No lleva orden*, *Por digitar*, el QR de la DGII, los conduces) va al final y más suave, para que se vea primero el estado y los avisos.
- **Pase de lista** (pestaña *Asistencia*), igual a la planilla de papel:
  - Por obra se anotan una vez los obreros: nombre, función y pago por día. El que se va queda en las planillas viejas y ya no sale en las nuevas.
  - La planilla dura una quincena (de domingo a sábado, dos veces), con la hora límite de entrada y la de salida. Cada día se marca la **entrada** (✓ a tiempo, T tarde, x no vino), el **pase sorpresa** (✓ estaba, x no estaba; la app guarda la hora) y la **salida** (✓ estaba, C siguió corrido y se fue antes = día completo, 1½ siguió corrido hasta la salida = día y medio, x se fue antes). Un toque marca a todos y solo se cambian los que no.
  - El **resumen de la quincena** suma los días a pagar y el pago de cada obrero, con sus tardanzas, faltas y salidas antes. Sale en **Excel** y en **PDF** con la forma de la planilla, y también la **planilla en blanco** con los nombres, para imprimir.
  - En **Reglas** se dice cuánto cuenta cada marca: si la tardanza o no estar en el pase descuentan, cuánto vale irse antes, el corrido, el sábado y el domingo. Las de la empresa vienen puestas: la tardanza descuenta medio día, el sábado vale medio día, no estar en el pase no descuenta, irse antes cuenta medio día, C cuenta 1, 1½ cuenta día y medio y el domingo vale como cualquier día. Si un sábado llega tarde, se le descuenta la mitad de lo que vale ese día.
- **Seguimiento:** cada pago pasa por *Por presentar → Presentado → Pagado*.
- **Aprobación del dueño** (opcional, con la nube): en *Ajustes → Aprobación del dueño* se activa y se pone el correo de la cuenta del dueño en la nube. Un pago presentado no se puede marcar como pagado hasta que el dueño lo apruebe desde su teléfono; a él le sale en *Para hacer* «pagos esperando tu aprobación», y puede **Aprobar el pago** o **Devolver con una nota** (el pago vuelve a *Por presentar* y la nota se ve en tu teléfono). Queda anotado quién lo aprobó y cuándo.
- **Historial de cada factura:** al final de la factura, *Historial* dice cuándo se agregó, cada cambio a mano o de la lectura automática (qué campo, de cuánto a cuánto, quién y en qué aparato), cuándo se mandó a la digitadora, en qué pago entró, sus abonos y cuándo se pagó.
- **PIN** (opcional, por aparato): en *Ajustes → Seguridad* se pone un PIN de 4 a 8 números. La app lo pide al abrirse y después de 5 minutos sin usarla, y no deja ver nada sin él. Si se olvida, con la nube se quita entrando con la contraseña de la cuenta; sin la nube, hay que borrar los datos de la app en el navegador y restaurar un respaldo.
- **Para hacer:** arriba en *Facturas*, lo pendiente con un toque para resolverlo: facturas sin leer (**Leer todas**), con algo que revisar, sin orden de compra, conduces esperando su factura, órdenes por firmar o esperando factura, facturas listas para pagar (**Armar pago** las marca) y pagos presentados que faltan por pagar. Lo urgente va arriba; si son muchas cosas, se ven las primeras y **Ver todo** muestra el resto.
- **Fechas:** en *Facturas* se elige un mes o un rango de fechas (por la fecha de la factura); los contadores, el total, el Excel y el pago que se arma desde ahí siguen ese período. Con muchas facturas, cada grupo muestra 60 y **Ver más**.
- **Más ayudas en la factura:** la obra se toma del texto del PDF aunque no haya clave ("Obra: Caperuza 2"); si falta el ITBIS, sugiere el 18 % incluido y se guarda con un toque; el concepto sale de los artículos de la orden; **No lleva orden** quita el aviso a las que no la necesitan.
- **Lectura sin internet:** si una factura no se pudo leer por falta de conexión, se lee sola cuando vuelve el internet. Si pones la clave de API después de cargar facturas, **Leer todas** las lee de una vez.
- **En la computadora** cambia la forma: las secciones y Ajustes van en un menú a la izquierda, y el botón de agregar va arriba. Las facturas, los conduces y las órdenes salen en tablas (proveedor, NCF, fecha, estado, etiquetas y monto) que se ordenan tocando el encabezado. En *Facturas*, los filtros quedan a la izquierda y *Para hacer* a la derecha, y lo que se abre sale como panel a la derecha, al lado de la lista. En el teléfono todo sigue igual. Los filtros van en una barra arriba para que la tabla se vea sin bajar. Con las casillas de la tabla se marcan varias facturas (o todas las de un proyecto) y sale una barra para **Armar pago**, **Mandar a la digitadora** o sacar su **Excel**. Al abrir una factura con foto o PDF, el documento sale grande a la izquierda y los datos a la derecha, para revisarla sin abrir y cerrar. El pase de lista muestra la quincena como la planilla de papel (cada obrero con sus 14 días: entrada, pase y salida, y lo que cuenta cada día); tocando un día se marca abajo. Las facturas de un pago también van en tabla, con **Quitar**.
- **Si algo falla**, *Ajustes → Registro de errores* dice qué pasó y cuándo; se puede compartir para revisarlo. La página solo carga sus propios archivos y solo se conecta con la lectura automática y la nube del equipo, para proteger la clave guardada en el teléfono.
- **Funciona sin internet**, salvo la lectura automática de facturas de papel y de pedidos.

## Publicarla en GitHub Pages (para el autor)

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

- En el propio teléfono, en el almacenamiento del navegador (IndexedDB). Si conectas los teléfonos a la nube del equipo (ver *Compartir los datos entre teléfonos*), también se guarda una copia ahí.
- **Respaldo:** Ajustes → **Descargar respaldo** genera un `.zip` con los datos y los archivos (facturas, órdenes y sus copias firmadas). Guárdalo en iCloud Drive o en la computadora. Se recupera con **Restaurar un respaldo**, que reemplaza todo. La app recuerda hacerlo cada 7 días; con la nube, cada mes, porque la nube copia también lo que se borra o se cambia por error.
- **Respaldo automático en la nube:** con la nube conectada, la app guarda sola tus datos en la nube cada semana y quedan los últimos 8. En *Ajustes → Ver los respaldos* se escoge uno y todo vuelve a como estaba ese día, en todos los aparatos conectados (las fotos y los PDF no se tocan, y antes se guarda cómo estaba, por si acaso).
- **Papelera:** lo que se borra (facturas, conduces, órdenes y pagos) se va a la papelera con sus archivos por 30 días. Justo después de borrar sale **Deshacer**; y en *Ajustes → Papelera* se recupera. Una factura recuperada vuelve con sus conduces. Pasados los 30 días se elimina sola, para siempre.
- Si se borra la app o los datos de Safari, o se pierde el teléfono, sin respaldo se pierde la información.
- Solo salen del teléfono las fotos de facturas de papel y los pedidos (mensaje o foto) que se mandan a la API para leerlos (si configuras la clave), y los archivos que tú compartas.

## Compartir los datos entre teléfonos (prueba)

Con esto, lo que se agrega o cambia en un teléfono (facturas con sus fotos, órdenes, pagos, proyectos y los datos de la empresa) les aparece solo a los demás teléfonos conectados, por ejemplo al del dueño. Cada teléfono sigue guardando todo en sí mismo y funcionando sin internet; cuando hay conexión, sube lo suyo y baja lo de los demás (al abrir la app, cada 30 segundos mientras está abierta y después de cada cambio).

La nube es una cuenta de [Supabase](https://supabase.com) a nombre de la empresa. Se crea una sola vez:

1. Crea una cuenta en supabase.com y un proyecto nuevo (por ejemplo `facturas`), con una contraseña fuerte para la base de datos y la región más cercana (por ejemplo, *East US*).
2. En el proyecto, abre **SQL Editor**, pega todo el contenido de [`nube/supabase.sql`](nube/supabase.sql) y toca **Run**. Crea la tabla de los datos, la carpeta privada de los archivos y los permisos: solo entran los usuarios que tú crees.
3. En **Authentication**:
   - En la configuración de acceso (*Sign In / Providers*), apaga **Allow new users to sign up**, para que nadie más pueda crearse una cuenta.
   - En **Users → Add user → Create new user**, crea un usuario para ti y otro para el dueño, cada uno con su correo y su contraseña. Marca **Auto Confirm User**.
4. Copia la **URL del proyecto** (`https://….supabase.co`) y la **clave pública** (*publishable* o *anon public*). Están en el botón **Connect** del proyecto o en *Project Settings → API Keys*. Esa clave puede ir en el teléfono: lo que protege los datos son los usuarios y los permisos del paso 2. La clave secreta (*secret* o *service_role*) no se pone nunca en la app.

En los teléfonos:

1. En tu teléfono: **Ajustes → Compartir con otros teléfonos**. Pega la URL, la clave pública, tu correo y tu contraseña, y toca **Conectar este teléfono**. La primera vez sube todo lo que ya tienes. Si en vez de la URL del proyecto pegas la dirección del panel (`supabase.com/dashboard/project/…`), la app saca la URL sola.
2. Toca **Datos para otro teléfono** y manda el código por WhatsApp al dueño. El código lleva la URL y la clave pública, no tu contraseña.
3. En el teléfono del dueño: instala la app, ve a **Ajustes → Compartir con otros teléfonos**, pega el código y entra con su correo y su contraseña. Baja todo; las fotos llegan al abrirlas o poco después.

Cómo se comporta:

- Sin internet, los cambios quedan pendientes y se suben solos cuando vuelve la conexión. Arriba, un indicador con una nube dice si está *Al día*, sincronizando, cuántos cambios faltan por subir, *Sin internet* o si hay un problema; tocándolo se abre la nube en Ajustes.
- Si Supabase pausa el proyecto (en el plan gratis lo hace después de una semana sin uso), la app lo dice y explica qué hacer: entrar a supabase.com, abrir el proyecto y tocar **Restore**. Mientras tanto todo se guarda en el teléfono y se sube cuando vuelve.
- Si dos teléfonos cambian lo mismo antes de ponerse al día, queda el último cambio que llegó a la nube.
- Si la sesión vence, la app la renueva sola. Si ya no se puede, avisa arriba y pide la contraseña otra vez.
- **Desconectar este teléfono** deja de sincronizarlo; sus datos se quedan en él.
- Conviene conectar el teléfono del dueño cuando todavía está vacío. Y que las órdenes las haga una sola persona, o con internet, para que los números no se repitan.
- La clave de la lectura automática no se comparte: cada teléfono usa la suya, si la tiene.
- Plan gratis de Supabase (según su página al momento de escribir esto; revísalo): base de datos de unos 500 MB y 1 GB para archivos, y el proyecto se pausa si pasa una semana sin usarse. Si se llena, hay planes de pago.

## Lectura automática de facturas de papel y pedidos (opcional)

Para conectarla, en la consola de Claude ([platform.claude.com](https://platform.claude.com)), con una cuenta de la empresa:

1. **Saldo:** en *Billing* (facturación), agrega una tarjeta y compra créditos. Sin saldo, la API no responde.
2. **Espacio de trabajo con tope de gasto:** en [Workspaces](https://platform.claude.com/settings/workspaces), crea uno (por ejemplo `Facturas`), ábrelo y en **Spend limits** pon el tope del mes (por ejemplo US$20) y los avisos. Al *Default Workspace* no se le puede poner tope; por eso conviene uno aparte.
3. **Clave:** en [API keys](https://platform.claude.com/settings/keys), toca **Create key**, ponle un nombre (por ejemplo `Teléfono facturas`), asígnala al espacio de trabajo `Facturas` y en la expiración elige **Never** (o una fecha lejana: cuando vence, la app deja de leer y lo avisa). Copia la clave (empieza con `sk-ant-`).
4. En la app: **Ajustes → Lectura automática**, pega la clave, elige el modelo y toca **Probar la clave**. Si algo falla, el mensaje dice qué arreglar: sin saldo, clave sin espacio de trabajo, clave vencida o inválida, modelo no disponible o cuenta que no permite usarla desde el teléfono. Después toca **Guardar**.
5. Si ya tenías facturas cargadas, en **Para hacer** toca **Leer todas**.

Si la lectura se detiene después (por ejemplo, se acabó el saldo), la app lo avisa arriba; al arreglarlo, **Leer todas** lee las que quedaron pendientes.

- Con la nube del equipo, basta con la clave en el teléfono que carga las facturas: los demás reciben los datos ya leídos. La clave no se comparte con los otros teléfonos.
- La clave se guarda solo en el teléfono y no va en los respaldos. Como la app llama a la API directo desde el teléfono, quien tenga el teléfono desbloqueado podría verla: si pierdes el equipo, desactívala o bórrala en la consola (*API keys*).
- Costo aproximado por factura (una foto, a precios de lista de noviembre de 2026; varía con cada factura, revisa el uso real en la consola):

  | Modelo | Costo aproximado por factura |
  |---|---|
  | Más precisa (Opus 5.5, la predeterminada) | US$0.02 a 0.06 |
  | Equilibrada (Sonnet 5.5) | US$0.01 a 0.03 |
  | Más económica (Haiku 5.5) | alrededor de US$0.002 |

- Llenar una orden desde el mensaje del pedido cuesta menos que leer una factura, porque casi siempre es solo texto.
- Las facturas electrónicas con QR o XML no necesitan esta lectura para los datos fiscales.

## Actualizar la app

Al cambiar archivos, sube también `sw.js` con un número nuevo en `VERSION` (por ejemplo `facturas-1.3.1`). Cada teléfono instala la versión nueva solo, al abrir la app o al volver a ella, siempre que no se esté llenando nada (si hay una hoja abierta, espera a que se cierre). Después avisa «La app se actualizó sola». Actualizar no cuesta nada: no pasa por la App Store.

Cada versión que se sube les llega a todos los que usan la app a la vez: hay que probarla antes de subirla.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `index.html` | Pantallas y estilos |
| `js/app.js` | Lógica de la app: facturas, conduces, órdenes de compra, pagos, pase de lista, proveedores, PDF, Excel y respaldos |
| `js/rd.js` | NCF y e-NCF, RNC, código QR y XML de la DGII |
| `js/qr.js` | Código QR de cada orden de compra |
| `js/runtime.js` | Almacenamiento en el teléfono, sincronización con la nube del equipo y lectura de facturas y pedidos por API |
| `nube/supabase.sql` | Lo que se corre una vez para crear la nube del equipo |
| `js/xlsx-zip.js` | Archivos Excel y `.zip` |
| `sw.js` | Funcionamiento sin internet |
| `manifest.webmanifest`, `icons/` | Instalación como app |
| `vendor/`, `fonts/` | Librerías y fuentes de terceros |
| `pruebas/` | Pruebas automáticas con datos inventados (cómo correrlas: `pruebas/README.md`) |

## Licencias de terceros

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1: MIT
- [PDF.js](https://github.com/mozilla/pdf.js) (pdfjs-dist) 3.11.174: Apache 2.0
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0: Apache 2.0
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) 1.3.0, empaquetado en un solo archivo: Apache 2.0
- Fuentes [Archivo](https://fonts.google.com/specimen/Archivo) e [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono): SIL Open Font License 1.1

Los textos de las licencias de las librerías y de las fuentes están en `vendor/licencias/`.

## Licencia

© 2026 AngelixVrobles. **Uso gratuito**: cualquier persona o empresa puede instalarla y usarla sin pagar. No se permite venderla ni copiar, modificar o publicar el código sin permiso por escrito del autor. Se entrega sin garantía; los datos son de quien los carga y se quedan en su equipo. El texto completo está en [`LICENSE`](LICENSE).

## Límites conocidos

- Sin conectar a la nube, cada teléfono tiene sus propios datos. Para pasarlos de uno a otro, usa el respaldo o la nube del equipo.
- No consulta a la DGII por su cuenta: el enlace del QR abre la consulta oficial para verificar.
- La sincronización entre teléfonos está en prueba: todos los usuarios conectados pueden ver y cambiar todo (no hay permisos por persona), no guarda un historial de cambios y, si dos cambian lo mismo a la vez, queda el último.
