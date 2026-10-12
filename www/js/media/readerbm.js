// ============================================================================
// ARCHIVO: media/readerbm.js
// RESPONSABILIDAD: marcador de lectura de TRIBALs (long-press ~1 s).
//   - Mantener pulsada la página guarda el punto exacto donde se suspende
//     la lectura; la cinta 🔖 de la barra lo indica y al tocarla se quita
//   - Persiste en meta.info.bm via store.updateInfo (IndexedDB/Filesystem,
//     NO localStorage) — además del guardado automático de posición
//   API: TribalReaderBm.{bind, sync}
// ============================================================================
window.TribalReaderBm = (function () {
    'use strict';

    function fx() { return window.TribalReaderFx; }

    // ¿es esta la misma hoja marcada?  txt/pdf compara página, epub cfi
    function samePlace(a, b) {
        if (!a || !b) return false;
        if (a.page != null && b.page != null) return a.page === b.page;
        if (a.cfi != null && b.cfi != null) return a.cfi === b.cfi;
        return false;
    }

    // sync(ui, meta, now): la cinta 🔖 solo aparece cuando ESTAMOS en la
    // hoja marcada — en otra página se oculta (now = estado actual)
    function sync(ui, meta, now) {
        var rib = ui.el.querySelector('#tr-bm');
        var bm = fx().info(meta).bm;
        var here = !!(bm && now && samePlace(bm, now));
        if (rib) {
            rib.hidden = !here;
            rib.title = bm ? ('Marcador: ' + (bm.txt || '')) : '';
        }
    }

    // getState() devuelve la posición actual + etiqueta, ej.
    //   { page: 5, txt: 'Pág. 5 / 120' }   (txt/pdf)
    //   { cfi: 'epubcfi(...)', txt: '…' }  (epub)
    function bind(ui, meta, deps, getState) {
        function fire(el) {
            // si el long-press inició una selección de texto, no es marcador
            var doc = el.ownerDocument || document;
            var sel = doc.getSelection && doc.getSelection();
            if (sel && !sel.isCollapsed && String(sel).length) return;
            var st = getState();
            if (!st) return;
            fx().info(meta).bm = st;
            fx().save(meta, deps);
            if (navigator.vibrate) navigator.vibrate(30);
            deps.toast('🔖 Marcador puesto — la lectura retoma aquí');
            sync(ui, meta, st);
        }
        function attachTo(el) {
            if (!el) return;
            var t = null, sx = 0, sy = 0;
            el.addEventListener('pointerdown', function (e) {
                sx = e.clientX; sy = e.clientY;
                t = setTimeout(function () { fire(el); }, 1000);
            });
            el.addEventListener('pointermove', function (e) {
                if (t && (Math.abs(e.clientX - sx) > 12 ||
                          Math.abs(e.clientY - sy) > 12)) {
                    clearTimeout(t); t = null;
                }
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
                el.addEventListener(ev, function () {
                    clearTimeout(t); t = null;
                });
            });
        }
        attachTo(ui.el.querySelector('.tribal-reader-body'));
        var rib = ui.el.querySelector('#tr-bm');
        if (rib) rib.addEventListener('click', function () {
            delete fx().info(meta).bm;
            fx().save(meta, deps);
            sync(ui, meta, getState());
            deps.toast('Marcador quitado');
        });
        sync(ui, meta, getState());
        // attachTo se devuelve: epub lo reusa dentro del iframe por sección
        return { attachTo: attachTo };
    }

    return { bind: bind, sync: sync };
})();
