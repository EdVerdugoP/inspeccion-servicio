/* GlobalClean · Capa de compatibilidad para operar fuera de claude.ai
 * Implementa window.claude.use('db' | 'user' | 'downloads') sobre Firebase (Auth + Firestore),
 * para que la app original funcione sin cambios en su lógica.
 * Debe cargarse ANTES del script principal de la app (después de firebase-config.js).
 */
(function () {
  'use strict';
  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var CFG = window.GC_FIREBASE_CONFIG || {};
  var ADMINS = (window.GC_ADMIN_EMAILS || []).map(function (e) { return String(e).toLowerCase(); });
  var fb = null;          // módulos de Firebase
  var fs = null;          // instancia Firestore
  var auth = null;
  var session = null;     // {user, email, rol, admin}
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });

  /* ---------- Utilidades ---------- */
  function codeOf(e) { return String((e && e.code) || '').replace(/^firestore\//, '').replace(/^auth\//, '').replace(/-/g, '_'); }
  function wrapErr(e) { var x = new Error((e && e.message) || String(e)); x.code = codeOf(e); x.cause = e; return x; }
  function el(tag, attrs, html) { var n = document.createElement(tag); for (var k in (attrs || {})) n.setAttribute(k, attrs[k]); if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Envoltorios con la forma que espera la app ---------- */
  function docSnap(s) {
    var ex = s.exists();
    return { id: s.id, exists: ex, data: function () { return ex ? s.data() : undefined; } };
  }
  function querySnap(s) {
    return { size: s.size, empty: s.empty, docs: s.docs.map(function (d) { return { id: d.id, exists: true, data: function () { return d.data(); } }; }) };
  }
  function DocRef(ref) {
    return {
      id: ref.id,
      get: function () { return fb.getDoc(ref).then(docSnap, function (e) { throw wrapErr(e); }); },
      set: function (data) { return fb.setDoc(ref, data).catch(function (e) { throw wrapErr(e); }); },
      // update con fusión profunda: equivale al comportamiento de la base de claude.ai y no falla si el documento no existe
      update: function (data) { return fb.setDoc(ref, data, { merge: true }).catch(function (e) { throw wrapErr(e); }); },
      delete: function () { return fb.deleteDoc(ref).catch(function (e) { throw wrapErr(e); }); },
      onSnapshot: function (cb, err) {
        return fb.onSnapshot(ref, function (s) { cb(docSnap(s)); }, function (e) { if (err) err(wrapErr(e)); });
      }
    };
  }
  function Query(q) {
    return {
      get: function () { return fb.getDocs(q).then(querySnap, function (e) { throw wrapErr(e); }); },
      where: function (f, op, v) { return Query(fb.query(q, fb.where(f, op, v))); },
      orderBy: function (f, dir) { return Query(fb.query(q, fb.orderBy(f, dir || 'asc'))); },
      limit: function (n) { return Query(fb.query(q, fb.limit(n))); },
      onSnapshot: function (cb, err) {
        return fb.onSnapshot(q, function (s) { cb(querySnap(s)); }, function (e) { if (err) err(wrapErr(e)); });
      }
    };
  }
  function Collection(path) {
    var c = fb.collection(fs, path);
    var q = Query(c);
    q.doc = function (id) { return DocRef(id ? fb.doc(c, String(id)) : fb.doc(c)); };
    q.add = function (data) { return fb.addDoc(c, data).then(function (r) { return DocRef(r); }); };
    return q;
  }
  var DB = {
    collection: function (path) { return Collection(path); },
    doc: function (path) { return DocRef(fb.doc(fs, path)); }
  };
  var USER = {
    me: function () { return Promise.resolve({ id: session.user.uid, name: session.user.displayName || session.email, email: session.email }); },
    id: function () { return Promise.resolve(session.user.uid); },
    isOwner: function () { return Promise.resolve(session.admin); },
    canEdit: function () { return Promise.resolve(session.admin); }
  };
  var DOWNLOADS = {
    save: function (o) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(o.data instanceof Blob ? o.data : new Blob([o.data]));
      a.download = o.filename || 'archivo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return Promise.resolve();
    }
  };

  window.claude = {
    use: function (name) {
      if (name === 'downloads') return Promise.resolve(DOWNLOADS);
      return ready.then(function () {
        if (name === 'db') return DB;
        if (name === 'user') return USER;
        return null;
      });
    }
  };

  /* ---------- Pantalla de acceso ---------- */
  var css = '' +
    '#gcAuth{position:fixed;inset:0;z-index:9999;background:#F2F6F6;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Source Sans 3","Segoe UI",system-ui,sans-serif;color:#0B2E3D}' +
    '#gcAuth .bx{background:#fff;border:1px solid #CBDADD;border-radius:12px;max-width:380px;width:100%;padding:28px 24px;box-shadow:0 8px 28px rgba(11,46,61,.10)}' +
    '#gcAuth h1{font-family:"Barlow Semi Condensed",Arial,sans-serif;font-size:24px;margin:0 0 2px}' +
    '#gcAuth p{margin:0 0 16px;color:#557079;font-size:14px;line-height:1.45}' +
    '#gcAuth label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}' +
    '#gcAuth input{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #CBDADD;border-radius:8px;padding:8px 12px;font:inherit;font-size:16px}' +
    '#gcAuth button{width:100%;min-height:44px;border-radius:8px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;margin-top:12px;border:1px solid #0B2E3D}' +
    '#gcAuth .pri{background:#0B2E3D;color:#fff}#gcAuth .sec{background:#fff;color:#0B2E3D}' +
    '#gcAuth .lnk{background:none;border:0;color:#0E7C86;font-weight:600;min-height:auto;margin-top:10px;font-size:14px;text-decoration:underline}' +
    '#gcAuth .or{display:flex;align-items:center;gap:8px;color:#557079;font-size:12px;margin:16px 0 0}#gcAuth .or:before,#gcAuth .or:after{content:"";flex:1;border-top:1px solid #CBDADD}' +
    '#gcAuth .msg{margin-top:12px;font-size:14px;padding:10px 12px;border-radius:8px;display:none}#gcAuth .msg.on{display:block}' +
    '#gcAuth .msg.err{background:#FDECEC;color:#8A1C1C}#gcAuth .msg.ok{background:#E6F4EA;color:#1E5631}' +
    '#gcUser{position:fixed;right:12px;bottom:12px;z-index:9000;font-family:"Source Sans 3","Segoe UI",system-ui,sans-serif}' +
    '#gcUser>button{width:44px;height:44px;border-radius:50%;border:1px solid #CBDADD;background:#fff;color:#0B2E3D;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(11,46,61,.15)}' +
    '#gcUser .mn{position:absolute;right:0;bottom:52px;background:#fff;border:1px solid #CBDADD;border-radius:10px;min-width:240px;padding:8px;box-shadow:0 8px 28px rgba(11,46,61,.18);display:none}#gcUser .mn.on{display:block}' +
    '#gcUser .mn div{padding:8px 10px;font-size:13px;color:#557079;word-break:break-all}#gcUser .mn b{color:#0B2E3D;display:block;font-size:14px}' +
    '#gcUser .mn button{display:block;width:100%;text-align:left;background:none;border:0;padding:10px;border-radius:6px;font:inherit;font-size:14px;color:#0B2E3D;cursor:pointer}#gcUser .mn button:hover{background:#E7EFF0}' +
    '#gcUsr{position:fixed;inset:0;z-index:9500;background:rgba(11,46,61,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Source Sans 3","Segoe UI",system-ui,sans-serif;color:#0B2E3D}' +
    '#gcUsr .bx{background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:85vh;overflow:auto;padding:20px}' +
    '#gcUsr h2{font-family:"Barlow Semi Condensed",Arial,sans-serif;margin:0 0 4px;font-size:22px}#gcUsr p{color:#557079;font-size:13px;margin:0 0 12px}' +
    '#gcUsr .row{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #E7EFF0;font-size:14px}#gcUsr .row span{flex:1;word-break:break-all}' +
    '#gcUsr input,#gcUsr select{min-height:40px;border:1px solid #CBDADD;border-radius:8px;padding:6px 10px;font:inherit}#gcUsr input{flex:1;min-width:0}' +
    '#gcUsr button{min-height:40px;border-radius:8px;border:1px solid #0B2E3D;background:#0B2E3D;color:#fff;font:inherit;font-weight:700;padding:0 14px;cursor:pointer}' +
    '#gcUsr button.x{background:#fff;color:#8A1C1C;border-color:#CBDADD}#gcUsr .ft{display:flex;justify-content:flex-end;margin-top:14px}#gcUsr .ft button{background:#fff;color:#0B2E3D}';

  function mountCss() { var s = el('style'); s.textContent = css; document.head.appendChild(s); }

  var box;
  function showAuth(html) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { showAuth(html); }); return; }
    if (!box) { box = el('div', { id: 'gcAuth', role: 'dialog', 'aria-modal': 'true' }); document.body.appendChild(box); }
    box.innerHTML = '<div class="bx">' + html + '</div>';
    box.style.display = 'flex';
  }
  function hideAuth() { if (box) box.style.display = 'none'; }
  function msg(t, kind) { var m = box && box.querySelector('.msg'); if (!m) return; m.className = 'msg on ' + (kind || 'err'); m.textContent = t; }
  function authErr(e) {
    var c = codeOf(e);
    var M = {
      invalid_credential: 'Correo o contraseña incorrectos.', wrong_password: 'Correo o contraseña incorrectos.', user_not_found: 'No existe una cuenta con ese correo.',
      invalid_email: 'El correo no es válido.', email_already_in_use: 'Ya existe una cuenta con ese correo. Use "Ingresar".', weak_password: 'La contraseña debe tener al menos 6 caracteres.',
      too_many_requests: 'Demasiados intentos. Espere unos minutos.', popup_closed_by_user: 'Se cerró la ventana de Google antes de terminar.', network_request_failed: 'Sin conexión a Internet.',
      operation_not_allowed: 'Este método de ingreso no está habilitado en Firebase.', unauthorized_domain: 'Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).'
    };
    return M[c] || ('No se pudo ingresar (' + (c || 'error') + ').');
  }

  function loginView() {
    showAuth(
      '<h1>Inspección de Servicio</h1><p>GlobalClean · Ingrese con su cuenta autorizada.</p>' +
      '<button class="sec" id="gcG">Ingresar con Google</button>' +
      '<div class="or">o con correo</div>' +
      '<form id="gcF" novalidate><label for="gcE">Correo</label><input id="gcE" type="email" autocomplete="username" required>' +
      '<label for="gcP">Contraseña</label><input id="gcP" type="password" autocomplete="current-password" required>' +
      '<button class="pri" type="submit">Ingresar</button></form>' +
      '<button class="lnk" id="gcN">Crear cuenta con correo</button> <button class="lnk" id="gcR">Olvidé mi contraseña</button>' +
      '<div class="msg" role="status"></div>');
    box.querySelector('#gcG').onclick = function () {
      var p = new fb.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      fb.signInWithPopup(auth, p).catch(function (e) {
        if (codeOf(e) === 'popup_blocked') return fb.signInWithRedirect(auth, p);
        msg(authErr(e));
      });
    };
    box.querySelector('#gcF').onsubmit = function (ev) {
      ev.preventDefault();
      var e = box.querySelector('#gcE').value.trim(), p = box.querySelector('#gcP').value;
      if (!e || !p) return msg('Ingrese correo y contraseña.');
      fb.signInWithEmailAndPassword(auth, e, p).catch(function (er) { msg(authErr(er)); });
    };
    box.querySelector('#gcN').onclick = function () {
      var e = box.querySelector('#gcE').value.trim(), p = box.querySelector('#gcP').value;
      if (!e || p.length < 6) return msg('Escriba su correo y una contraseña de al menos 6 caracteres, y vuelva a presionar "Crear cuenta".');
      fb.createUserWithEmailAndPassword(auth, e, p).then(function (c) { return fb.sendEmailVerification(c.user); })
        .catch(function (er) { msg(authErr(er)); });
    };
    box.querySelector('#gcR').onclick = function () {
      var e = box.querySelector('#gcE').value.trim();
      if (!e) return msg('Escriba su correo y vuelva a presionar "Olvidé mi contraseña".');
      fb.sendPasswordResetEmail(auth, e).then(function () { msg('Le enviamos un correo para restablecer la contraseña.', 'ok'); }, function (er) { msg(authErr(er)); });
    };
  }
  function blockedView(title, text, extra) {
    showAuth('<h1>' + esc(title) + '</h1><p>' + text + '</p>' + (extra || '') +
      '<button class="sec" id="gcOut">Cerrar sesión</button><div class="msg" role="status"></div>');
    box.querySelector('#gcOut').onclick = function () { fb.signOut(auth).then(function () { location.reload(); }); };
  }

  /* ---------- Menú de usuario y gestión de accesos ---------- */
  function mountUserMenu() {
    var w = el('div', { id: 'gcUser' });
    var ini = (session.user.displayName || session.email || '?').trim().charAt(0).toUpperCase();
    w.innerHTML = '<div class="mn" role="menu"><div><b>' + esc(session.user.displayName || session.email) + '</b>' + esc(session.email) +
      '<br>Rol: ' + (session.admin ? 'Administrador' : 'Supervisor') + '</div>' +
      (session.admin ? '<button id="gcMU" role="menuitem">Gestionar accesos</button>' : '') +
      '<button id="gcMO" role="menuitem">Cerrar sesión</button></div><button aria-label="Cuenta" title="Cuenta">' + esc(ini) + '</button>';
    document.body.appendChild(w);
    var mn = w.querySelector('.mn');
    w.lastChild.onclick = function () { mn.classList.toggle('on'); };
    document.addEventListener('click', function (e) { if (!w.contains(e.target)) mn.classList.remove('on'); });
    w.querySelector('#gcMO').onclick = function () { fb.signOut(auth).then(function () { location.reload(); }); };
    if (session.admin) w.querySelector('#gcMU').onclick = function () { mn.classList.remove('on'); usersDialog(); };
  }
  function usersDialog() {
    var d = el('div', { id: 'gcUsr', role: 'dialog', 'aria-modal': 'true' });
    d.innerHTML = '<div class="bx"><h2>Accesos a la aplicación</h2><p>Solo los correos de esta lista pueden ingresar. Los supervisores registran y ven actas; los administradores además gestionan centros, supervisores, respaldos y protección de datos.</p>' +
      '<form id="gcUA" style="display:flex;gap:8px;flex-wrap:wrap"><input id="gcUE" type="email" placeholder="correo@ejemplo.cl" required><select id="gcUR"><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select><button type="submit">Agregar</button></form>' +
      '<div id="gcUL" style="margin-top:10px">Cargando…</div><div class="ft"><button id="gcUC">Cerrar</button></div></div>';
    document.body.appendChild(d);
    var col = fb.collection(fs, 'usuarios'), unsub = fb.onSnapshot(col, function (s) {
      var rows = s.docs.map(function (x) { return { email: x.id, rol: (x.data() || {}).rol || 'supervisor' }; }).sort(function (a, b) { return a.email.localeCompare(b.email); });
      ADMINS.forEach(function (a) { if (!rows.some(function (r) { return r.email === a; })) rows.unshift({ email: a, rol: 'admin', fijo: true }); });
      d.querySelector('#gcUL').innerHTML = rows.map(function (r) {
        return '<div class="row"><span>' + esc(r.email) + '</span><small>' + (r.rol === 'admin' ? 'Administrador' : 'Supervisor') + (r.fijo ? ' · propietario' : '') + '</small>' +
          (r.fijo || r.email === session.email ? '' : '<button class="x" data-del="' + esc(r.email) + '">Quitar</button>') + '</div>';
      }).join('') || '<p>Sin usuarios.</p>';
    }, function (e) { d.querySelector('#gcUL').textContent = 'No se pudo leer la lista (' + codeOf(e) + ').'; });
    d.querySelector('#gcUA').onsubmit = function (ev) {
      ev.preventDefault();
      var e = d.querySelector('#gcUE').value.trim().toLowerCase(), r = d.querySelector('#gcUR').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
      fb.setDoc(fb.doc(fs, 'usuarios', e), { rol: r, agregado: new Date().toISOString(), por: session.email }).then(function () { d.querySelector('#gcUE').value = ''; },
        function (er) { alertBox('No se pudo agregar: ' + codeOf(er)); });
    };
    d.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]'); if (!b) return;
      if (!confirm('¿Quitar el acceso de ' + b.getAttribute('data-del') + '?')) return;
      fb.deleteDoc(fb.doc(fs, 'usuarios', b.getAttribute('data-del'))).catch(function (er) { alertBox('No se pudo quitar: ' + codeOf(er)); });
    });
    d.querySelector('#gcUC').onclick = function () { unsub(); d.remove(); };
  }
  function alertBox(t) { try { window.alert(t); } catch (e) { console.error(t); } }

  /* ---------- Arranque ---------- */
  function configured() { return CFG.apiKey && CFG.apiKey !== 'PEGAR_AQUI' && CFG.projectId && CFG.projectId !== 'PEGAR_AQUI'; }

  async function start() {
    mountCss();
    if (!configured()) {
      showAuth('<h1>Falta configurar Firebase</h1><p>Edite el archivo <b>firebase-config.js</b> con los datos de su proyecto de Firebase y vuelva a publicar el sitio.</p>');
      return;
    }
    showAuth('<h1>Inspección de Servicio</h1><p>Conectando…</p>');
    try {
      var m = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
      fb = Object.assign({}, m[0], m[1], m[2]);
    } catch (e) {
      showAuth('<h1>Sin conexión</h1><p>No se pudo cargar Firebase. Revise su conexión a Internet y recargue la página.</p>');
      return;
    }
    var app = fb.initializeApp(CFG);
    auth = fb.getAuth(app);
    try { await fb.setPersistence(auth, fb.browserLocalPersistence); } catch (e) { }
    try {
      fs = fb.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
    } catch (e) {
      fs = fb.initializeFirestore(app, { ignoreUndefinedProperties: true });
    }
    try { await fb.getRedirectResult(auth); } catch (e) { }

    fb.onAuthStateChanged(auth, async function (u) {
      if (session) { if (!u) location.reload(); return; }
      if (!u) return loginView();
      var email = String(u.email || '').toLowerCase();
      var isGoogle = (u.providerData || []).some(function (p) { return p.providerId === 'google.com'; });
      if (!u.emailVerified && !isGoogle) {
        blockedView('Verifique su correo', 'Enviamos un enlace de verificación a <b>' + esc(email) + '</b>. Ábralo y luego presione "Ya verifiqué".',
          '<button class="pri" id="gcV">Ya verifiqué</button><button class="lnk" id="gcVR">Reenviar correo</button>');
        box.querySelector('#gcV').onclick = function () { u.reload().then(function () { location.reload(); }); };
        box.querySelector('#gcVR').onclick = function () { fb.sendEmailVerification(u).then(function () { msg('Correo reenviado.', 'ok'); }, function (e) { msg(authErr(e)); }); };
        return;
      }
      var rol = null;
      if (ADMINS.indexOf(email) >= 0) rol = 'admin';
      else {
        try { var s = await fb.getDoc(fb.doc(fs, 'usuarios', email)); if (s.exists()) rol = (s.data() || {}).rol || 'supervisor'; }
        catch (e) { if (codeOf(e) !== 'permission_denied') { blockedView('Sin conexión', 'No se pudo verificar su acceso. Revise su conexión y recargue la página.'); return; } }
      }
      if (!rol) {
        blockedView('Acceso no autorizado', 'La cuenta <b>' + esc(email) + '</b> no tiene acceso a esta aplicación. Pida al administrador que la agregue en "Gestionar accesos".');
        return;
      }
      session = { user: u, email: email, rol: rol, admin: rol === 'admin' };
      hideAuth();
      mountUserMenu();
      readyResolve();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
