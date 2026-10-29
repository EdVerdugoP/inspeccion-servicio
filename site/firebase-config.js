/* Configuración de Firebase para Inspección de Servicio.
 * Pegue aquí los valores de su proyecto:
 * Consola de Firebase → ⚙ Configuración del proyecto → General → Tus apps → App web → "Configuración del SDK" (opción "Config").
 * Estos valores NO son secretos: identifican el proyecto. La seguridad la dan el inicio de sesión y las reglas de Firestore.
 */
window.GC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMCjUtXjsjAbFpq_pxXgbOU4tcoeCQ9RE",
  authDomain: "apps-gc-78118.firebaseapp.com",
  projectId: "apps-gc-78118",
  storageBucket: "apps-gc-78118.firebasestorage.app",
  messagingSenderId: "1055492160401",
  appId: "1:1055492160401:web:7868580b5b55342cf53830"
};

/* Administradores iniciales (propietario). Deben coincidir con la lista ADMIN_EMAILS de firestore.rules.
 * Los demás usuarios se agregan desde la app: menú de usuario → "Gestionar accesos". */
window.GC_ADMIN_EMAILS = ["ed.verdugo.penaloza@gmail.com"];
