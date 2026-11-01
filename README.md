# Inspección de Servicio · GlobalClean (versión independiente)

App web de actas de inspección del servicio de aseo (ISO 9001), publicada en Internet sin depender de claude.ai.

- **Hosting:** Cloudflare Pages (gratis), publica la carpeta `site/` de este repositorio.
- **Base de datos e inicio de sesión:** Firebase (plan gratuito Spark): Authentication + Cloud Firestore.
- **Código:** `site/index.html` es la misma app del artefacto. `site/gc-firebase-adapter.js` la conecta a Firebase sin cambiar su lógica.

## Estructura

```
firestore.rules              Reglas de seguridad (se pegan en la consola de Firebase)
site/index.html              La aplicación
site/gc-firebase-adapter.js  Conexión a Firebase, pantalla de ingreso y gestión de accesos
site/firebase-config.js      Datos del proyecto Firebase (completar)
site/_headers                Cabeceras de seguridad para Cloudflare Pages
```

---

## Paso 1 · Firebase (≈15 min)

1. Entre a <https://console.firebase.google.com> y abra su proyecto (o cree uno; **no** active Google Analytics, no hace falta).
2. **Registrar la app web:** ⚙ *Configuración del proyecto* → *General* → *Tus apps* → ícono `</>` → nombre "Inspección de Servicio" → *Registrar app* (sin Firebase Hosting).
   Copie el bloque `firebaseConfig` que aparece (apiKey, authDomain, projectId, …).
3. **Inicio de sesión:** *Compilación → Authentication → Comenzar*. En *Método de acceso*, habilite:
   - **Google** (elija su correo de asistencia y guarde).
   - **Correo electrónico/contraseña** (solo el primer interruptor).
4. **Base de datos:** *Compilación → Firestore Database → Crear base de datos*.
   - Ubicación: **southamerica-east1 (São Paulo)**, la más cercana a Chile. *No se puede cambiar después.*
   - Modo: **producción**.
5. **Reglas:** en Firestore → pestaña *Reglas*, borre todo, pegue el contenido de `firestore.rules` y presione **Publicar**.
6. Edite `site/firebase-config.js` y reemplace cada `PEGAR_AQUI` con los valores copiados en el punto 2.
   Si el administrador no es `ed.verdugo.penaloza@gmail.com`, cambie ese correo **en los dos archivos** (`firebase-config.js` y `firestore.rules`) y vuelva a publicar las reglas.

> Los valores de `firebaseConfig` no son secretos (identifican el proyecto). La seguridad la dan el inicio de sesión y las reglas.

## Paso 2 · GitHub (≈5 min)

1. En <https://github.com/new> cree un repositorio **privado** llamado `inspeccion-servicio`.
2. En el repositorio vacío: *uploading an existing file* → arrastre **el contenido** de esta carpeta (el archivo `firestore.rules`, `README.md` y la carpeta `site`) → *Commit changes*.

## Paso 3 · Cloudflare Pages (≈5 min)

1. En <https://dash.cloudflare.com> → *Workers & Pages* → *Create* → pestaña **Pages** → *Connect to Git*.
2. Autorice GitHub y elija `inspeccion-servicio`.
3. Configuración de compilación:
   - *Framework preset:* **None**
   - *Build command:* (vacío)
   - *Build output directory:* **`site`**
4. *Save and Deploy*. Al terminar le dará una dirección como `https://inspeccion-servicio.pages.dev`.

## Paso 4 · Autorizar el dominio en Firebase

Firebase → *Authentication* → *Configuración* → *Dominios autorizados* → *Agregar dominio* → `inspeccion-servicio.pages.dev` (y más adelante su dominio propio, por ejemplo `inspeccion.globalcleanapps.cl`).
Sin esto, el botón "Ingresar con Google" muestra un error de dominio.

## Paso 5 · Migrar los datos desde claude.ai

1. Abra la app actual en claude.ai → **Configuración → Descargar respaldo** (archivo `Respaldo_Inspeccion_Servicio_AAAA-MM-DD.json`). Guárdelo: es su respaldo de seguridad.
2. Abra la nueva dirección, ingrese con su cuenta de administrador → **Configuración → Restaurar respaldo** → elija ese archivo.
3. Verifique que estén los centros, el logo y las actas. El acta de ejemplo (Clínica Los Aromos) puede eliminarla.

La restauración solo **agrega** lo que falta; no borra nada. El artefacto de claude.ai queda intacto hasta que usted decida retirarlo.

## Paso 6 · Dar acceso a los supervisores

Botón redondo con su inicial (abajo a la derecha) → **Gestionar accesos** → escriba el correo → *Supervisor* o *Administrador* → *Agregar*.
El supervisor entra con Google (si su correo es Gmail o Google Workspace) o crea una contraseña con "Crear cuenta con correo" y confirma el enlace que le llega por correo.

| Rol | Puede |
|---|---|
| Supervisor | Crear y editar actas, ver historial e indicadores, descargar PDF/Excel. Eliminar solo sus borradores. |
| Administrador | Todo lo anterior, más centros, supervisores, marca, respaldos, Ley 21.719 y accesos. |

---

## Actualizar la app

Edite los archivos en GitHub (o súbalos de nuevo). Cloudflare publica automáticamente cada cambio en 1–2 minutos.

## Respaldos

Descargue un respaldo mensual desde **Configuración → Descargar respaldo** y guárdelo fuera de Firebase (por ejemplo, en la carpeta de respaldos de la empresa).

## Límites del plan gratuito (referencia)

Firestore Spark: 1 GiB de datos, 50.000 lecturas y 20.000 escrituras por día. Para el uso actual (decenas de actas al mes) sobra con creces. Si algún día se acerca al límite, la app sigue funcionando al día siguiente; nada se cobra sin que usted active el plan de pago.

## Funcionamiento sin señal

La app guarda una copia local en el navegador. Si el supervisor pierde la señal con la app ya abierta, puede seguir trabajando: el indicador mostrará "Guardando…" y los cambios se envían solos cuando vuelve la conexión. Lo que no funciona sin señal es abrir o recargar la página desde cero.

## Avisos por Telegram (Programa de visitas)

`apps-script/AvisosServicio.gs` (proyecto «Avisos Buzón SST», cuenta de respaldos) envía por Telegram, con el bot @GCAvisosBot: a las 18:00 las visitas de mañana a cada supervisor/a y un resumen (mañana + atrasadas) al administrador; y cada 15 minutos los cambios del administrador al supervisor/a afectado. Usa el correo de la ficha del supervisor/a. Las personas se vinculan en el panel del Buzón › Configuración › Avisos por Telegram. Instalar con `instalarIs`; probar con `probarIs`.
