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
