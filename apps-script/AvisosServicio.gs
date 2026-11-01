/**
 * Inspección de Servicio (IS-Web) · Avisos por Telegram del Programa de visitas.
 * Gratuito. Se instala en la cuenta globalclean.respaldos@gmail.com, como un archivo más del proyecto de Apps Script
 * «Avisos Buzón SST» (usa el bot y los vínculos de Telegram de AvisosBuzon.gs). Sus funciones terminan en «Is» / «Is_».
 *
 * Qué avisa (solo por Telegram, a las personas vinculadas en el panel del Buzón › Configuración › Avisos por Telegram):
 *   · Recordatorio diario (18:00): a cada supervisor/a, sus visitas programadas para mañana.
 *     Al administrador (RESPALDO_IS): resumen de visitas de mañana y visitas atrasadas sin acta.
 *   · Cambios del administrador en el programa (cada 15 minutos): al supervisor/a afectado, con el detalle y el motivo.
 * El correo del supervisor/a se toma de su ficha en IS-Web (Supervisores › correo).
 *
 * Instalación:
 *  1. Proyecto «Avisos Buzón SST» › Archivos › + › Script › nombre «AvisosServicio». Pegue este archivo.
 *  2. Ejecute instalarIs (crea los dos activadores). probarIs() envía el resumen de mañana ahora mismo.
 */
const IS_BASE = 'https://firestore.googleapis.com/v1/projects/apps-gc-78118/databases/(default)/documents';
const IS_APP = 'https://inspeccion-servicio.pages.dev/';
const RESPALDO_IS = 'ed.verdugo.penaloza@gmail.com';   // administrador: recibe el resumen diario

function instalarIs() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['recordarIs', 'revisarCambiosIs'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recordarIs').timeBased().atHour(18).everyDays(1).inTimezone('America/Santiago').create();
  ScriptApp.newTrigger('revisarCambiosIs').timeBased().everyMinutes(15).create();
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('IS_DESDE')) p.setProperty('IS_DESDE', new Date().toISOString());   // solo cambios desde ahora
}

/** Prueba: envía ya el recordatorio de mañana (a supervisores y administrador). */
function probarIs() { recordarIs(true); }

/** 18:00: visitas de mañana a cada supervisor/a y resumen al administrador. */
function recordarIs(prueba) {
  const hoy = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
  const man = Utilities.formatDate(new Date(Date.now() + 864e5), 'America/Santiago', 'yyyy-MM-dd');
  const prog = consultarIs_('programa', 'est', 'programada');
  const sups = {};
  listarIs_('supervisores').forEach(function (s) { sups[s.id] = s; });
  const manana = prog.filter(function (x) { return x.fec === man; });
  const atrasadas = prog.filter(function (x) { return x.fec && x.fec < hoy; });
  const porSup = {};
  manana.forEach(function (x) { (porSup[x.sup] = porSup[x.sup] || []).push(x); });
  let enviados = 0;
  Object.keys(porSup).forEach(function (id) {
    const s = sups[id] || {}, l = porSup[id].sort(function (a, b) { return String(a.hor).localeCompare(String(b.hor)); });
    if (!s.mail) return;
    enviados += telegramIs_([s.mail], '📅 <b>Inspección de Servicio</b> · Mañana ' + fechaIs_(man) + ' tiene ' + l.length + ' visita' + (l.length > 1 ? 's' : '') + ' programada' + (l.length > 1 ? 's' : '') + ':\n\n' +
      l.map(function (x) { return '• ' + hIs_(x.hor || '') + ' · <b>' + hIs_(x.ins) + '</b> (' + hIs_(x.cli) + ')' + (x.tip ? ' · ' + hIs_(x.tip) : ''); }).join('\n') +
      '\n\nAl terminar, complete el acta desde el Programa de visitas.');
  });
  const resumen = ['🗓️ <b>Inspección de Servicio</b> · Resumen ' + fechaIs_(hoy) + (prueba ? ' (prueba)' : ''), '',
    '<b>Mañana:</b> ' + manana.length + ' visita' + (manana.length === 1 ? '' : 's') + ' programada' + (manana.length === 1 ? '' : 's')];
  Object.keys(porSup).forEach(function (id) { resumen.push('  • ' + hIs_((sups[id] || {}).n || porSup[id][0].supN || 'Sin supervisor') + ': ' + porSup[id].length); });
  resumen.push('<b>Atrasadas sin acta:</b> ' + atrasadas.length);
  atrasadas.sort(function (a, b) { return String(a.fec).localeCompare(String(b.fec)); }).slice(0, 8).forEach(function (x) {
    resumen.push('  • ' + fechaIs_(x.fec) + ' · ' + hIs_(x.ins) + ' · ' + hIs_((sups[x.sup] || {}).n || x.supN || ''));
  });
  if (atrasadas.length > 8) resumen.push('  … y ' + (atrasadas.length - 8) + ' más.');
  if (manana.length || atrasadas.length || prueba) enviados += telegramIs_([RESPALDO_IS], resumen.join('\n'));
  console.log('Mañana: ' + manana.length + ' · atrasadas: ' + atrasadas.length + ' · mensajes enviados: ' + enviados);
}

/** Cada 15 minutos: cambios del administrador aún no vistos por el supervisor/a (un aviso por cambio). */
function revisarCambiosIs() {
  const p = PropertiesService.getScriptProperties();
  const desde = p.getProperty('IS_DESDE') || new Date().toISOString();
  const avisados = JSON.parse(p.getProperty('IS_AVISADOS') || '[]');
  let sups = null;
  consultarIs_('programa', 'adm.visto', false).forEach(function (x) {
    const a = x.adm || {}, clave = x.id + '|' + a.at;
    if (!a.at || a.at <= desde || avisados.indexOf(clave) >= 0) return;
    if (!sups) { sups = {}; listarIs_('supervisores').forEach(function (s) { sups[s.id] = s; }); }
    const s = sups[x.sup] || {};
    avisados.push(clave);
    if (!s.mail) return;
    telegramIs_([s.mail], '✏️ <b>Inspección de Servicio</b> · ' + hIs_(a.byN || 'El administrador') + ' ' + (a.nuevo ? 'agendó una visita' : 'modificó una visita') + ' de su programa\n\n' +
      '<b>Centro:</b> ' + hIs_(x.ins) + ' (' + hIs_(x.cli) + ')\n<b>Fecha:</b> ' + fechaIs_(x.fec) + ' ' + hIs_(x.hor || '') +
      (a.det ? '\n<b>Detalle:</b> ' + hIs_(a.det) : '') + (a.mot ? '\n<b>Motivo:</b> ' + hIs_(a.mot) : '') +
      '\n\nRevíselo en Programa de visitas.');
  });
  p.setProperty('IS_AVISADOS', JSON.stringify(avisados.slice(-300)));
}

/* ---------- Telegram (bot y vínculos del Buzón SST, en AvisosBuzon.gs) ---------- */
function telegramIs_(correos, html) {
  if (typeof tgEnviarA_ !== 'function') return 0;
  try { return tgEnviarA_(correos, html, { text: 'Abrir Inspección de Servicio', url: IS_APP }); } catch (e) { console.warn('Telegram: ' + e); return 0; }
}
function hIs_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fechaIs_(d) { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : String(d || '-'); }

/* ---------- Firestore REST (solo lectura) ---------- */
function pedirIs_(url, opciones) {
  return UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }, opciones || {}));
}
function consultarIs_(col, campo, valor) {
  const v = typeof valor === 'boolean' ? { booleanValue: valor } : { stringValue: String(valor) };
  const q = { structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: v } }, limit: 2000 } };
  const r = pedirIs_(IS_BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(q) });
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText()).filter(function (x) { return x.document; }).map(function (x) { return planoIs_(x.document.fields); });
}
function listarIs_(col) {
  const q = { structuredQuery: { from: [{ collectionId: col }], limit: 2000 } };
  const r = pedirIs_(IS_BASE + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(q) });
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText()).filter(function (x) { return x.document; }).map(function (x) { return planoIs_(x.document.fields); });
}
function valorIs_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valorIs_);
  if ('mapValue' in v) return planoIs_(v.mapValue.fields);
  return null;
}
function planoIs_(f) { const o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = valorIs_(f[k]); }); return o; }
