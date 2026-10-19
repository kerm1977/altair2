// ============================================================================
// ARCHIVO: media/dlmini.js — barra mini de descarga + descarga en original
// RESPONSABILIDAD: píldora flotante que muestra el progreso de exportar un
// archivo a Descargas/TRIBALs. Vive fija arriba-centro; al entrar un elemento
// a fullscreen real (vinilo, stage de video) se re-ubica DENTRO de él para
// seguir visible — document.body queda oculto tras el fullscreen.
// API: TribalDlMini.begin(name) / feed(texto) / end(ok, msg)
//      saveOrig(meta, toast) — produce('orig') + saveToDevice, alimentando
//      la barra. La usan los botones discretos de los visores y la fila ⋮.
// ============================================================================
window.TribalDlMini = (function () {
    'use strict';
    var bar = null, fillEl, txtEl, jobs = 0, hideT = null;

    function host() { return document.fullscreenElement || document.body; }
    function move() { if (bar) host().appendChild(bar); }
    function ensure() {
        if (bar) return bar;
        bar = document.createElement('div');
        bar.className = 'dl-mini'; bar.hidden = true;
        bar.innerHTML =
            '<i class="bi bi-download"></i>' +
            '<div class="dl-mini-body"><span class="dl-mini-txt"></span>' +
            '<div class="dl-mini-track"><div class="dl-mini-fill"></div>' +
            '</div></div>';
        host().appendChild(bar);
        txtEl = bar.querySelector('.dl-mini-txt');
        fillEl = bar.querySelector('.dl-mini-fill');
        document.addEventListener('fullscreenchange', move);
        return bar;
    }

    function pctOf(t) {
        var x = /(\d{1,3})\s*%/.exec(String(t || ''));
        return x ? Math.min(100, +x[1]) : null;
    }

    function begin(name) {
        ensure();
        jobs++;
        clearTimeout(hideT);
        bar.classList.remove('ok', 'err');
        bar.hidden = false;
        txtEl.textContent = '⬇ ' + (name || 'archivo');
        fillEl.style.width = '8%';
    }
    function feed(t) {
        if (!bar || bar.hidden) return;
        txtEl.textContent = t;
        var p = pctOf(t);
        fillEl.style.width = (p != null ? Math.max(8, p) : 55) + '%';
    }
    function end(ok, msg) {
        jobs = Math.max(0, jobs - 1);
        if (!bar || jobs > 0) return;
        bar.classList.add(ok ? 'ok' : 'err');
        fillEl.style.width = '100%';
        txtEl.textContent = msg ||
            (ok ? '✔ Guardado en Descargas' : '✖ No se pudo descargar');
        hideT = setTimeout(function () {
            bar.hidden = true;
            bar.classList.remove('ok', 'err');
        }, 2600);
    }

    // el flujo completo del botón discreto: formato ORIGINAL, sin opciones
    function saveOrig(m, toast) {
        if (!m || !window.TribalDownld)
            return Promise.reject(new Error('sin módulo de descarga'));
        begin(m.name || 'archivo');
        var base = (m.name || 'archivo').replace(/\.[^.]+$/, '');
        return TribalDownld.produce(m, 'orig', feed).then(function (out) {
            feed('Guardando en Descargas…');
            return TribalDownld.saveToDevice(out.blob, base + out.ext);
        }).then(function () {
            end(true);
            if (toast) toast('⬇ Guardado en Descargas');
        }).catch(function (e) {
            end(false, '✖ ' + String((e && e.message) || e || 'error'));
        });
    }

    return { begin: begin, feed: feed, end: end, saveOrig: saveOrig };
})();
