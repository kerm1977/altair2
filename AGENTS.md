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

## Íconos dentro de círculos (play, ⋮, kind) — REGLA FIJA

`bootstrap-icons.css` pone `vertical-align: -.125em` en `::before` →
el glifo queda bajo dentro de círculos (visible sobre todo en Firefox).
NUNCA usar `display:inline-block`/`block` en el `<i>` de un botón
circular. La regla blindada (media-extras.css) es:

```css
.btn-circular i {
    display: inline-flex;
    align-items: center; justify-content: center;
    line-height: 1;
}
.btn-circular i::before { vertical-align: initial; }
```

El `<i>` flex convierte el `::before` en flex item y el centrado es
exacto en PC/móvil/Firefox. El triángulo `bi-play-fill` además lleva
`transform: translate(1px,0)` porque su glifo está ópticamente a la
izquierda.

## Subsistemas blindados recientes (no regresar)

- **Secciones por tipo** — `sections.js` agrupa (Todo/orden del usuario,
  Música + "Mis grabaciones", búsqueda); `render.js` pinta un stream
  separador+items; separadores `.tribal-kind-sep` con hr centrados.
- **Colapso de secciones** — tap en el título de sección colapsa su
  grupo; long-press (~550ms) en `#sec-order` colapsa/expande TODO.
  Estado en `tribu_sec_collapsed`. Sin botones extra en el separador.
- **Orden de secciones** — botón `#sec-order` junto a `#view-switch`
  abre el panel `.sec-panel` (flechas ▲▼). Orden en `tribu_sec_order`
  (default image,audio,video,doc,other; 'grab' va pegado tras 'audio').
- **Buscador inteligente** — `smartsearch.js` (`S.buildMatcher`):
  nombre/metadatos/tipo/ext/colección/duración/tamaño; soporta
  `3:45`, `>1:00`, `<90s`, `>10mb`, `tipo:x ext:y col:z`.
- **Grabador de notas persistente** — `vnotes.js` + `vnotesav.js` +
  `vndraft.js`: autoguardado en IndexedDB (ranuras `__vn_*`) +
  localStorage `tribu_vn_draft`; auto-pausa al ocultar la app;
  restaurar = seguir/guardar/eliminar (triple confirmación); retomar
  fusiona por decode+paste→wav (NUNCA concatenar blobs webm crudos —
  cada sesión trae su propio header y se corrompe).
