# TRIBALs — reglas del proyecto

## Preview del player (REGLA FIJA — NUNCA CAMBIAR)

- El servidor de preview es **http://localhost:8787** sirviendo `www/`.
- La vista del player es **`http://localhost:8787/media.html`**.
- **NUNCA** abrir un puerto nuevo ni apuntar la preview a otro puerto,
  a la raíz `/` ni a `index.html`. Siempre `/media.html` en `:8787`.
- Si el servidor no responde, levantar `python -m http.server 8787`
  (o el equivalente) en `www/` — el puerto es siempre 8787.

## Build

- APK: `scripts\build.bat` → `apks\app-debug.apk`
- Sintaxis JS: `node --check <archivo>` (los módulos son ES5-compatible)

## Identidad y contenido empaquetado

- La app se llama **TRIBALs** (`application-label` del APK), paquete `com.altair.app`.
- `index.html` redirige a `media.html` — el arranque del APK es el player.
- Música semilla: `C:\Users\MINIOS\Music\musica de la tribu` → se copia a
  `www/builtin/` (+ `builtin/manifest.json`). `js/media/seed.js` la registra
  como colección "musica de la tribu" en el primer arranque (flag
  `tribu_builtin_seed_v1`). Los metas llevan `builtin: 'builtin/<archivo>'`
  y se reproducen directo del asset — nunca copiar el blob al store.
- Tras cambiar el contenido de la carpeta: regenerar `manifest.json` y
  subir la versión del flag en seed.js para re-sembrar.

## Barra de accesos personalizable — SECCIÓN BLINDADA

`www/js/media/tabfavs.js` + su CSS en `media-extras.css` + markup en
`media.html` (orden `tribu_bar_order`, Todo siempre primero, píldora
fija al reordenar). **PROHIBIDO modificar esta sección** salvo orden
explícita del usuario — ni refactor, ni "mejoras", ni tocarla al añadir
entradas nuevas al menú de opciones. Las nuevas herramientas se integran
solo agregando su botón al menú ⋮ y un módulo aparte.

### Tamaños FIJOS de los botones (no tocar NUNCA)

- PC y móvil: círculos de **46×46 px**, `border-radius: 50%`.
- Móvil (≤640px): `flex: 0 0 46px`, `justify-content: space-evenly`,
  ícono `1.05rem`. **Sin `aspect-ratio` ni `flex-basis` porcentual** —
  eso fue lo que los hizo ovalar y luego gigantizar.
- Ícono en PC: `1.15rem`.
