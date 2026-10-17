// ============================================================================
// ARCHIVO: media/clean.js
// RESPONSABILIDAD: overlay principal del Limpiador tribal (solo UI).
//   - Barra de disco (usado/libre) + barra de liberación por categorías.
//   - Tarjetas por categoría con «Ver» (revisión paginada en cleanlist.js).
//   - Las acciones viven en cleanact.js (escanear / limpiar / duplicados).
//   API: window.TribalClean.open(deps)
// ============================================================================
window.TribalClean = (function () {
    'use strict';

    var D = window.TribalCleanData;
    var ov = null, deps = null, busy = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null;
    }

    function say(t) {
        var st = ov && ov.querySelector('#cln-st');
        if (st) st.textContent = t;
    }

    // -------------------------------------------------- barras de espacio ---
    function paintDisk() {
        var i = D.state.info;
        if (!i || !i.total) return;
        var used = i.total - i.free;
        var pct = Math.round(used * 100 / i.total);
        ov.querySelector('#cln-diskfill').style.width = pct + '%';
        ov.querySelector('#cln-disktxt').textContent =
            D.fmt(used) + ' usados · ' + D.fmt(i.free) + ' libres de ' +
            D.fmt(i.total) + ' (' + pct + '%)';
    }

    // barra de liberación: suma de las categorías marcadas + caché propia
    function paintFree() {
        var bytes = 0, n = 0;
        ov.querySelectorAll('.cln-cat input:checked').forEach(function (c) {
            var id = c.dataset.cat;
            if (id === 'own') { bytes += D.state.cacheBytes; n += 1; return; }
            D.picked(id).forEach(function (it) { bytes += it.size; n++; });
        });
        var pct = D.state.info && D.state.info.total
            ? Math.min(100, bytes * 100 / D.state.info.total) : 0;
        ov.querySelector('#cln-freefill').style.width = pct + '%';
        ov.querySelector('#cln-freetxt').textContent = n
            ? 'Se liberarían ' + D.fmt(bytes) + ' (' + n + ' elementos)'
            : 'Marca categorías para ver cuánto se libera';
        ov.querySelector('#cln-del').disabled = !n || busy;
    }

    function paintCats() {
        var host = ov.querySelector('#cln-cats');
        var html = D.cats.map(function (c) {
            var its = D.picked(c.id);
            var bytes = its.reduce(function (a, it) { return a + it.size; }, 0);
            return '<label class="cln-cat">' +
                '<input type="checkbox" data-cat="' + c.id + '"' +
                (its.length ? ' checked' : ' disabled') + '>' +
                '<span class="cln-cat-i">' + c.icon + '</span>' +
                '<span class="cln-cat-t"><b>' + esc(c.name) + '</b>' +
                '<i>' + esc(c.desc) + '</i></span>' +
                '<span class="cln-cat-n">' + (its.length
                    ? its.length + ' · ' + D.fmt(bytes)
                    : '—') + '</span>' +
                '<button type="button" class="cln-view" data-view="' + c.id + '"' +
                (its.length ? '' : ' disabled') + '>Ver</button>' +
            '</label>';
        }).join('');
        html += '<label class="cln-cat cln-own">' +
            '<input type="checkbox" data-cat="own"' +
            (D.state.cacheBytes ? ' checked' : ' disabled') + '>' +
            '<span class="cln-cat-i">🍪</span>' +
            '<span class="cln-cat-t"><b>Caché y cookies de la app</b>' +
            '<i>WebView + cookies propias (las de Chrome son inaccesibles)</i></span>' +
            '<span class="cln-cat-n">' +
            (D.state.cacheBytes ? D.fmt(D.state.cacheBytes) : '—') + '</span>' +
            '<span class="cln-view"></span></label>';
        host.innerHTML = html;
        paintFree();
    }

    // contexto que las acciones (cleanact.js) necesitan para operar
    function ctx() {
        return {
            ov: ov, deps: deps, say: say,
            paintDisk: paintDisk, paintFree: paintFree, paintCats: paintCats,
            isBusy: function () { return busy; },
            setBusy: function (b) { busy = b; }
        };
    }

    // ------------------------------------------------------------ apertura --
    function open(d) {
        close();
        deps = d;
        if (!D.plug()) {
            (d.toast || function () {})('El limpiador solo existe en el APK');
            return;
        }
        ov = document.createElement('div');
        ov.className = 'tribal-overlay';
        ov.innerHTML =
            '<div class="tribal-dialog tscan-dialog cln-dialog">' +
                '<h4><i class="bi bi-stars"></i> Limpiador tribal</h4>' +
                '<div class="cln-bar"><div class="cln-fill" id="cln-diskfill"></div></div>' +
                '<div class="cln-bartxt" id="cln-disktxt">Midiendo el disco…</div>' +
                '<div class="cln-bar cln-barfree"><div class="cln-fill" id="cln-freefill"></div></div>' +
                '<div class="cln-bartxt" id="cln-freetxt">Analiza para ver qué se puede liberar</div>' +
                '<div class="cln-cats" id="cln-cats"></div>' +
                '<div class="tscan-status" id="cln-st"></div>' +
                '<div class="tribal-dialog-actions">' +
                    '<button class="tribal-btn" id="cln-close">Cerrar</button>' +
                    '<button class="tribal-btn" id="cln-dup">👯 Duplicados</button>' +
                    '<button class="tribal-btn" id="cln-go">' +
                        '<i class="bi bi-search"></i> Analizar</button>' +
                    '<button class="tribal-btn danger" id="cln-del" disabled>' +
                        '🗑 Limpiar</button>' +
                '</div>' +
            '</div>';
        (deps.mount || document.body).appendChild(ov);
        ov.addEventListener('click', function (e) { if (e.target === ov && !busy) close(); });
        ov.querySelector('#cln-close').addEventListener('click', function () {
            if (busy) D.cancel(); else close();
        });
        ov.querySelector('#cln-go').addEventListener('click', function () {
            if (!busy) window.TribalCleanAct.scan(ctx());
        });
        ov.querySelector('#cln-del').addEventListener('click', function () {
            if (!busy) window.TribalCleanAct.del(ctx());
        });
        ov.querySelector('#cln-dup').addEventListener('click', function () {
            if (!busy) window.TribalCleanAct.dups(ctx());
        });
        ov.querySelector('#cln-cats').addEventListener('change', paintFree);
        ov.querySelector('#cln-cats').addEventListener('click', function (e) {
            var v = e.target.closest('.cln-view[data-view]');
            if (!v || v.disabled) return;
            e.preventDefault(); e.stopPropagation();
            var c = D.cats.filter(function (x) { return x.id === v.dataset.view; })[0];
            if (c) window.TribalCleanList.open(c, D.state.found[c.id], deps);
        });
        D.storageInfo().then(function (i) {
            if (i) { paintDisk(); say('Listo — toca «Analizar» para buscar basura.'); }
            else say('No se pudo medir el disco.');
        });
        paintCats();
    }

    return { open: open, close: close };
})();
