/**
 * Script del Panel_Control para "quickcampaign_sms_mail".
 * A diferencia de quickcampaign_sms, el disparo NO vive en la hoja "Contactos":
 * vive en su propia pestaña "Panel_Control" (ver ENVIO_SMS_MAIL_V2.xlsx),
 * junto con el estado Activa/Pausada que actua como llave general de la campaña.
 *
 * Como instalarlo:
 * 1. En el Google Sheet: Extensiones > Apps Script.
 * 2. Pegar este codigo (reemplaza el contenido del archivo Codigo.gs).
 * 3. Completar las constantes de abajo (las 2 URLs y el token).
 * 4. Guardar (Ctrl+S) y volver al Sheet. Recargar la hoja una vez (F5) para que aparezca el menu "Quick Camp Mail".
 * 5. Para el boton fisico en Panel_Control (opcional): Insertar > Dibujo > rectangulo "INICIAR CAMPAÑA"
 *    > asignar script: iniciarCampana (ese boton siempre pega a PRODUCCION, igual que en quickcampaign_sms).
 *    Para test, usar el menu "Quick Camp Mail" de arriba, no el boton.
 *
 * Diferencia entre los dos caminos (igual criterio que quickcampaign_sms):
 * - PRODUCCION: funciona siempre. Requiere que WF1_envio_sms este con el toggle "Active" prendido en n8n.
 * - TEST: pega a la Test URL del nodo Webhook. Solo funciona si en el editor de n8n clickeaste
 *   "Listen for test event" justo antes de correr esto.
 *
 * Que dispara el boton:
 * - Pone Estado_Campana = "Activa" en Panel_Control (arma el envio automatico de las tandas
 *   siguientes y de los mails, que corren por Schedule Trigger en n8n).
 * - Pega al webhook para forzar el primer envio (Tanda 1) sin esperar al proximo Schedule Trigger.
 * - Escribe fecha/hora y resultado del disparo en el bloque "Ultima ejecucion" de Panel_Control.
 *   (El conteo de "Leads procesados" lo termina de completar el propio workflow de n8n cuando
 *   corre, via Google Sheets update — no lo escribe este script).
 */

// --- Configuracion ---

// Produccion: Config > nodo Webhook (WF1_envio_sms) > boton "Production URL"
const PROD_WEBHOOK_URL = 'https://devn8n.gruporoisa.com.ar/webhook/quick-camp-mail-iniciar';

// Test: Config > nodo Webhook > pestaña "Test URL" (normalmente termina en /webhook-test/...)
const TEST_WEBHOOK_URL = 'https://devn8n.gruporoisa.com.ar/webhook-test/quick-camp-mail-iniciar';

// Debe coincidir con el valor configurado en la credencial "Quick Camp Mail Webhook Secret" (Header Auth) en n8n.
const WEBHOOK_TOKEN = 'PON_AQUI_UN_TOKEN_SECRETO_LARGO';

// Nombre de la pestaña de control (debe coincidir con la hoja del ENVIO_SMS_MAIL_V2.xlsx)
const PANEL_SHEET_NAME = 'Panel_Control';

// Celdas del Panel_Control (deben coincidir con el layout del xlsx de referencia)
const CELDA_MODO = 'B3';
const CELDA_ESTADO_CAMPANA = 'B4';
const CELDA_ULTIMA_FECHA = 'B8';
const CELDA_ULTIMOS_LEADS = 'B9';
const CELDA_ULTIMO_RESULTADO = 'B10';

// --- Menu en el Sheet (se crea solo al abrir la hoja) ---
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Quick Camp Mail')
    .addItem('Iniciar Campaña (Producción)', 'iniciarCampana')
    .addItem('Iniciar Campaña (Test n8n)', 'iniciarCampanaTest')
    .addSeparator()
    .addItem('Pausar Campaña', 'pausarCampana')
    .addItem('Reanudar Campaña', 'reanudarCampana')
    .addToUi();
}

// --- Boton fisico de Panel_Control / uso normal: PRODUCCION ---
function iniciarCampana() {
  ejecutarDisparo(PROD_WEBHOOK_URL, false);
}

// --- Menu "Quick Camp Mail > Iniciar Campaña (Test n8n)" ---
function iniciarCampanaTest() {
  ejecutarDisparo(TEST_WEBHOOK_URL, true);
}

// --- Menu "Quick Camp Mail > Pausar Campaña" ---
// Llave general: WF1_envio_sms y WF2_envio_mail chequean Estado_Campana antes de procesar
// cualquier tanda. Pausar no requiere entrar a n8n.
function pausarCampana() {
  setEstadoCampana_('Pausada');
  SpreadsheetApp.getUi().alert('Campaña pausada. No se van a enviar mas SMS ni mails hasta que la reanudes.');
}

// --- Menu "Quick Camp Mail > Reanudar Campaña" ---
function reanudarCampana() {
  setEstadoCampana_('Activa');
  SpreadsheetApp.getUi().alert('Campaña reanudada. Los proximos Schedule Trigger de n8n van a procesar las tandas pendientes.');
}

// --- Logica compartida por los dos caminos de disparo ---
function ejecutarDisparo(url, esTest) {
  const ui = SpreadsheetApp.getUi();

  if (esTest) {
    const continuar = ui.alert(
      'Modo TEST',
      'Antes de aceptar, andá al editor de n8n, abrí el nodo Webhook de WF1_envio_sms y clickeá "Listen for test event". ¿Ya lo hiciste?',
      ui.ButtonSet.YES_NO
    );
    if (continuar !== ui.Button.YES) {
      ui.alert('Cancelado. Clickeá "Listen for test event" en n8n y volvé a intentar.');
      return;
    }
  }

  const panel = getPanelSheet_();
  const fecha = new Date();

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-webhook-token': WEBHOOK_TOKEN
      },
      payload: JSON.stringify({
        spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
        disparadoPor: Session.getActiveUser().getEmail(),
        fecha: fecha.toISOString(),
        modo: esTest ? 'test' : 'produccion'
      }),
      muteHttpExceptions: true
    });

    const codigo = response.getResponseCode();
    const ok = codigo >= 200 && codigo < 300;

    if (!esTest) {
      // Arma el envio automatico de tandas siguientes y mails (Schedule Trigger en n8n).
      setEstadoCampana_('Activa');
    }

    if (panel) {
      panel.getRange(CELDA_ULTIMA_FECHA).setValue(fecha);
      panel.getRange(CELDA_ULTIMO_RESULTADO).setValue(
        ok ? 'OK (' + (esTest ? 'TEST' : 'PRODUCCIÓN') + ')' : 'ERROR ' + codigo
      );
      // "Leads procesados" lo completa WF1_envio_sms al terminar de correr, no este script.
    }

    if (ok) {
      ui.alert('Listo (' + (esTest ? 'TEST' : 'PRODUCCIÓN') + '). Se disparó el envío de la Tanda 1. ' +
        'Los resultados se van a ir viendo en las columnas Envio1 / FechaEnvio1 de "Contactos" en unos segundos.');
    } else {
      ui.alert('El webhook respondió con error (' + codigo + '). Detalle: ' + response.getContentText());
    }
  } catch (err) {
    if (panel) {
      panel.getRange(CELDA_ULTIMA_FECHA).setValue(fecha);
      panel.getRange(CELDA_ULTIMO_RESULTADO).setValue('ERROR: ' + err.message);
    }
    ui.alert('No se pudo contactar a n8n. Error: ' + err.message);
  }
}

// --- Helpers ---
function getPanelSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PANEL_SHEET_NAME);
}

function setEstadoCampana_(valor) {
  const panel = getPanelSheet_();
  if (!panel) {
    throw new Error('No se encontró la hoja "' + PANEL_SHEET_NAME + '". Revisá el nombre de la pestaña.');
  }
  panel.getRange(CELDA_ESTADO_CAMPANA).setValue(valor);
}
