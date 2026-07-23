# Diseño funcional — quickcampaign_sms_mail

Basado en el flujo existente de `E:\Documentos\Proyectos_Roisa\quickcampaign_sms` (n8n + Google Sheets + Twilio), extendido para envío de SMS + 1 correo por tanda, con fuentes unificadas y diseño abierto a nuevas tandas.

## 1. Unificación de fuentes de leads

Workflow **WF0_unificar_leads** (nuevo, on-demand):

1. Lee los 2 Sheets de origen (Leads institucional, Leads meta) vía Google Sheets API.
2. Normaliza teléfono (misma función `normalizarTelefonoAR` que ya usa `quickcampaign_sms`) y normaliza email (lowercase, trim).
3. Dedupea por teléfono normalizado. Si el mismo lead aparece en ambas fuentes, se conserva un solo registro y se guarda de qué fuente vino.
4. Escribe el resultado en la hoja "Contactos" del sheet unificado (`fuente = institucional|meta`).

## 2. Sheet unificado: `ENVIO_SMS_MAIL_V2.xlsx`

### 2.1 Hoja "Contactos"

Columnas base:

| Columna | Uso |
|---|---|
| `telefono` | Editable — formato internacional (+54...) |
| `nombre` | Editable, opcional — placeholder `{{nombre}}` |
| `email` | **Nueva** — requerida para el envío de mail |
| `fuente` | **Nueva** — `institucional` / `meta`, trazabilidad post-dedupe |
| `codigo` | Generado por el workflow — código de tracking (8 chars), no tocar |
| `desuscripto` | **Nueva** — flag global `Si` / vacío. Si está en `Si`, corta todo envío de mail futuro |

Por cada tanda N (sin tope fijo — ver §4):

| Columna | Uso |
|---|---|
| `Envio{N}` | Si/No — envío SMS tanda N |
| `FechaEnvio{N}` | **Timestamp completo** (`yyyy-MM-dd HH:mm:ss`), no solo fecha — necesario para calcular la ventana de 30 min del mail |
| `Click{N}` | **Corrección**: en vez de Si/No, guarda el **timestamp del click** en el shortlink SMS (vacío = no clickeado). Corta las tandas SMS siguientes cuando tiene valor |
| `EmailEnvio{N}` | **Nueva** — timestamp de envío del mail (vacío = no enviado) |
| `EmailClick{N}` | **Nueva** — timestamp de click en el CTA principal del mail (vacío = no clickeado). Corta las tandas de mail siguientes cuando tiene valor |

### 2.2 Hoja "Plantillas" (rediseñada — una fila por tanda, no columnas por tanda)

| `tanda` | `mensaje_sms` | `destino_sms` | `delay_sms_horas` | `delay_mail_min` |
|---|---|---|---|---|
| 1 | texto con `{{nombre}}`/`{{link}}` | link WhatsApp destino | 0 | 30 |
| 2 | ... | ... | 24 | 30 |
| 3 | ... | ... | 24 | 30 |

`delay_sms_horas` es un agregado necesario al pasar `FechaEnvio{N}` a timestamp completo: reemplaza la espera fija "1 día" que tenía `quickcampaign_sms` entre tandas de SMS (ahora configurable por tanda, en horas). El workflow itera esta hoja fila por fila en vez de tener nodos hardcodeados por tanda (ver §4).

### 2.3 Hoja "Plantillas_Mail" (nueva — vinculada a la tanda, no al lead)

Parametrizable: qué `.html` se usa lo define la **tanda**, no un atributo del lead. Así, cambiar o agregar templates es editar esta hoja, sin tocar el workflow ni los datos de "Contactos".

| `tanda` | `archivo_template` |
|---|---|
| 1 | plantilla_alta.html |
| 2 | plantilla_media.html |
| 3 | plantilla_baja.html |

El `tanda` de esta hoja debe existir también en "Plantillas" (misma numeración). Si una tanda no tiene fila acá, WF2_envio_mail no le envía mail a esa tanda (solo SMS).

### 2.4 Hoja "Panel_Control" (nueva — responde a la pregunta sobre el disparo)

En `quickcampaign_sms` el disparo de Tanda 1 se hace desde un **menú de Apps Script** ("Quick Camp" → Enviar SMS) definido en `apps_script/Codigo.gs`, no desde una pestaña. Acá se propone algo más visible y separado de los datos: una pestaña dedicada exclusivamente al control de la campaña, sin tocar "Contactos".

Contenido de la pestaña:

| Elemento | Función |
|---|---|
| Botón "Iniciar Campaña" (dibujo de Sheets asociado a script) | Dispara el webhook de Tanda 1 (equivalente al botón actual de Codigo.gs, pero como control visual en su propia hoja) |
| Celda `Modo` (dropdown Test/Producción) | Igual al modo ya existente en `Codigo.gs` |
| Celda `Estado_Campana` (Activa/Pausada) | **Kill switch general**: los workflows de envío (SMS y mail) chequean esta celda antes de procesar cualquier tanda. Pausar la campaña no requiere entrar a n8n |
| Bloque "Última ejecución" | Fecha/hora, cantidad de leads procesados, resultado — actualizado automáticamente al terminar cada corrida |
| Bloque "Resumen" | Contadores: pendientes tanda 1/2/3 (SMS), pendientes mail 1/2/3 — visibilidad rápida sin filtrar "Contactos" |

Esta hoja es solo de control/lectura de estado; no se edita manualmente la data de leads desde ahí.

### 2.5 Hoja "Control_Data" (nueva, oculta)

Google Sheets/n8n leen por fila de encabezado, no por celda suelta, y "Panel_Control" tiene un layout libre (no tabular). Por eso esta hoja auxiliar oculta espeja `Modo` y `Estado_Campana` en formato tabla (`clave`/`valor`) vía fórmulas (`=Panel_Control!B3`, `=Panel_Control!B4`), para que los workflows la lean con un `Google Sheets - read` normal. No se edita a mano; `Panel_Control` sigue siendo la fuente real.

## 3. Flujo (workflows n8n)

Implementados en `n8n/WF0_unificar_leads.json` … `n8n/WF5_desuscripcion.json`:

- **WF0_unificar_leads**: manual (Manual Trigger), arma "Contactos" unificada (§1), upsert por teléfono (no duplica ni pisa columnas de tandas en corridas repetidas).
- **WF1_envio_sms** (generaliza los WF1+WF2 actuales): Webhook (botón "Iniciar Campaña") + Schedule Trigger (cada 15 min) → lee `Control_Data` y chequea `Estado_Campana = Activa` → itera hoja "Plantillas" → por cada tanda N filtra candidatos (`Envio{N}` vacío, tanda previa enviada, `Click{N-1}` vacío, pasó `delay_sms_horas`) → Twilio → marca `Envio{N}=Si`, `FechaEnvio{N}=timestamp` (columnas calculadas dinámicamente por tanda, vía `autoMapInputData`).
- **WF2_envio_mail** (nuevo): Schedule Trigger cada 10 min → chequea `Estado_Campana = Activa` → busca filas con `Envio{N}=Si`, `now - FechaEnvio{N} >= delay_mail_min`, `EmailEnvio{N}` vacío, `desuscripto != Si` → lee el `.html` según la **tanda** (hoja Plantillas_Mail) → reemplaza `[email]`, el link de "desuscribirme" (→ WF5) y el botón CTA (→ WF4) → envía por SMTP (`doctored.dyndns.org`, `ventasdoctored@doctored.com.ar`) → marca `EmailEnvio{N}=timestamp`. Si el envío falla, no marca nada y reintenta en la corrida siguiente.
- **WF3_click_tracking_sms**: mismo patrón que el WF3 actual (página intermedia + filtro anti-bot por User-Agent), pero ahora marca `Click{N}=timestamp` (antes `Si`). Paths renombrados a `sms-click/:code` y `sms-click-confirmar/:code` (el WF3 de `quickcampaign_sms` usa `:code` a nivel raíz) para que ambos proyectos puedan convivir activos en la misma instancia de n8n sin chocar. **Acción pendiente fuera de n8n**: el shortlink externo (`SHORTLINK_BASE`, hoy `yutiypy.s.gy/doctoredVentas`, reutilizado del proyecto anterior) debe reconfigurarse para redirigir a `/webhook/sms-click/{codigo}-{tanda}` en vez de a la ruta vieja.
- **WF4_click_tracking_mail** (nuevo): mismo patrón anti-bot (clave acá: los proveedores de mail pre-visitan links por seguridad — Outlook Safe Links, Gmail image proxy — y eso no debe contar como click real) → marca `EmailClick{N}=timestamp` → redirige al destino real.
- **WF5_desuscripcion** (nuevo): Webhook público enlazado al link "quiero desuscribirme" → página de confirmación (evita que un pre-fetch automático dispare la baja) → al confirmar, marca `desuscripto=Si` → corta todo mail futuro del lead. No afecta el envío de SMS.

## 4. Versatilidad de tandas (diseño abierto)

En vez de hardcodear "Tanda1/2/3" en el código de los workflows, el diseño es data-driven:
- Agregar una tanda nueva = agregar una fila en "Plantillas" + agregar el set de 5 columnas (`Envio{N}`, `FechaEnvio{N}`, `Click{N}`, `EmailEnvio{N}`, `EmailClick{N}`) en "Contactos" siguiendo la convención de nombres.
- Los workflows no se tocan: arman los nombres de columna dinámicamente a partir del número de tanda en el nodo Code.

## 5. Regla de corte

- **SMS**: `Click{N}` con timestamp (no vacío) en la tanda previa corta las tandas SMS siguientes para ese lead.
- **Mail**: corta por cualquiera de estos dos eventos — `desuscripto=Si` (global) o `EmailClick{N}` con timestamp (click en el CTA de esa tanda) → no se envía `EmailEnvio{N+1}`.
- **Kill switch general**: `Estado_Campana=Pausada` en Panel_Control detiene todo envío (SMS y mail) sin tocar n8n.

## 6. Buenas prácticas anti-spam (WF2_envio_mail)

- SPF/DKIM/DMARC configurados para el dominio de envío — sin esto, el volumen masivo rebota o cae en spam en Gmail/Outlook.
- Throttling: envío en lotes con espera entre ellos (ej. 1 email/seg), no todo el volumen de golpe.
- Header `List-Unsubscribe` además del link visible, para que los clientes de correo muestren el botón nativo de baja.
- Monitorear bounce rate y quejas; sacar de la lista automáticamente los hard-bounces.
- Balance texto/imagen en los templates (hoy son mayormente imagen — puede penalizar en Gmail).
- Calentar el dominio/IP si es la primera vez que se envía volumen masivo desde ese servidor.

## 7. Archivos entregados

| Archivo | Contenido |
|---|---|
| `ENVIO_SMS_MAIL_V2.xlsx` | Sheet unificado: Contactos, Plantillas, Plantillas_Mail, Panel_Control, Control_Data |
| `apps_script/Codigo.gs` | Menú "Quick Camp Mail", botón/kill switch de Panel_Control |
| `n8n/WF0_unificar_leads.json` | Unificación y dedupe de las 2 fuentes de leads |
| `n8n/WF1_envio_sms.json` | Envío de SMS por tandas (genérico, data-driven) |
| `n8n/WF2_envio_mail.json` | Envío de mail 30 min después del SMS, template por tanda |
| `n8n/WF3_click_tracking_sms.json` | Tracking de click en shortlink SMS (timestamp) |
| `n8n/WF4_click_tracking_mail.json` | Tracking de click en CTA de mail (timestamp) |
| `n8n/WF5_desuscripcion.json` | Baja global de mail vía link "quiero desuscribirme" |

Pendiente de completar en n8n al importar: credenciales (`REEMPLAZAR`), `GOOGLE_SHEET_ID`, `TEMPLATES_DIR` (o reemplazar por hosting de los `.html`), y el `WEBHOOK_TOKEN`/URLs en `Codigo.gs`.
