// ============================================================================
// ARCHIVO: media/tabfavs.js
// RESPONSABILIDAD: barra de accesos 100% personalizable.
//   - TODOS los accesos son movibles: los 5 filtros de fábrica (Todo, Música,
//     Videos, Fotos, Colecciones) y las 12 acciones del menú ⋮.
//   - Long-press (~550 ms) en un ítem del ⋮ → "☆ Fijar en la barra".
//   - Long-press en un ítem de la barra → "◀" "★ Al menú" "▶" → ordenar
//     a la izquierda/derecha o devolverlo al menú.
//   - Persistente en localStorage ('tribu_bar_order'); migra los favoritos
//     de la versión anterior ('tribu_fav_actions').
// ============================================================================
window.Sono.register('tabfavs', function (S) {
    'use strict';
    var $ = S.$;
    var KEY = 'tribu_bar_order', OLDKEY = 'tribu_fav_actions';
    var tabs = S.tabs, viewMenu = $('view-menu'), viewMore = $('view-more');
    if (!tabs || !viewMenu || !viewMore) return;

    // catálogo completo de accesos movibles. tab:true → su elemento canónico
    // es el propio botón de filtro; el resto → botón vm-* del menú ⋮.
    var MAX_BAR = 6; // la barra admite máximo 6 íconos («Todos» incluido)
    var ACTIONS = [
        { id: 'tab-all',    tab: true, icon: 'bi-stars',                 title: 'Todo' },
        { id: 'tab-audio',  tab: true, icon: 'bi-music-note-beamed',     title: 'Música' },
        { id: 'tab-video',  tab: true, icon: 'bi-camera-video',          title: 'Videos' },
        { id: 'tab-image',  tab: true, icon: 'bi-image',                 title: 'Fotos' },
        { id: 'tab-cols',   tab: true, icon: 'bi-folder2',               title: 'Colecciones' },
        { id: 'vm-vnotes',  icon: 'bi-mic-fill',                         title: 'Notas de audio' },
        { id: 'vm-zip',     icon: 'bi-file-zip',                         title: 'Comprimir' },
        { id: 'vm-stats',   icon: 'bi-bar-chart',                        title: 'Estadísticas' },
        { id: 'vm-slide',   icon: 'bi-collection-play',                  title: 'Slideshow' },
        { id: 'vm-newcol',  icon: 'bi-folder-plus',                      title: 'Nueva colección' },
        { id: 'vm-batch',   icon: 'bi-input-cursor-text',                title: 'Renombrar' },
        { id: 'vm-undo',    icon: 'bi-arrow-counterclockwise',           title: 'Deshacer' },
        { id: 'vm-btchat',  icon: 'bi-bluetooth',                        title: 'Chat Bluetooth' },
        { id: 'vm-btmgr',   icon: 'bi-broadcast-pin',                    title: 'Administrador BT' },
        { id: 'vm-remote',  icon: 'bi-controller',                       title: 'Control remoto' },
        { id: 'vm-ftp',     icon: 'bi-hdd-network-fill',                 title: 'Servidor de archivos' },
        { id: 'vm-scan',    icon: 'bi-binoculars',                       title: 'Escanear dispositivo' },
        { id: 'vm-clean',   icon: 'bi-stars',                            title: 'Limpiador' },
        { id: 'vm-fx',      icon: 'bi-currency-exchange',                title: 'Divisas' },
        { id: 'vm-doc',     icon: 'bi-book-half',                        title: 'Libros y notas' },
        { id: 'vm-notes',   icon: 'bi-journal-richtext',                 title: 'Bloc de notas' },
        { id: 'vm-links',   icon: 'bi-link-45deg',                       title: 'Enlaces' },
        { id: 'vm-perms',   icon: 'bi-shield-lock',                      title: 'Permisos' },
        { id: 'vm-revoke',  icon: 'bi-shield-x',                         title: 'Revocar permisos' }
    ];
    function actionFor(id) {
        for (var i = 0; i < ACTIONS.length; i++) {
            if (ACTIONS[i].id === id) return ACTIONS[i];
        }
        return null;
    }
    var DEFAULT_BAR = ACTIONS.filter(function (a) { return a.tab; })
        .map(function (a) { return a.id; });

    // ---------------------------------------------------------------- estado
    function load() {
        var bar = null;
        try { bar = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
        if (!bar) {
            // primera vez con este sistema o migración de favoritos viejos
            bar = DEFAULT_BAR.slice();
            try {
                JSON.parse(localStorage.getItem(OLDKEY) || '[]').forEach(function (id) {
                    if (bar.indexOf(id) < 0) bar.push(id);
                });
            } catch (e) {}
            save(bar);
        }
        return bar.filter(function (id) { return actionFor(id); });
    }
    function save(a) {
        // «Todo» es sagrado: mientras esté en la barra va SIEMPRE primero —
        // cualquier orden que lo deje atrás se normaliza aquí
        var ti = a.indexOf('tab-all');
        if (ti > 0) { a.splice(ti, 1); a.unshift('tab-all'); }
        localStorage.setItem(KEY, JSON.stringify(a));
    }
    function inBar(id) { return load().indexOf(id) >= 0; }
    function move(id, dir) {
        var bar = load(), i = bar.indexOf(id), j = i + dir;
        if (i < 0 || j < 0 || j >= bar.length) return false;
        // nadie (ni «todo») puede quedar a la izquierda de «todo»
        if (id === 'tab-all' && dir < 0) return false;
        if (id !== 'tab-all' && bar[0] === 'tab-all' && j === 0) return false;
        bar.splice(i, 1);
        bar.splice(j, 0, id);
        save(bar);
        return true;
    }
    function toggle(id) {
        var bar = load(), i = bar.indexOf(id);
        if (i >= 0) {
            if (id === 'tab-all') {   // «Todos» es intocable: nunca sale
                if (S.showToast) S.showToast('«Todos» siempre queda en la barra');
                return false;
            }
            bar.splice(i, 1);
        } else {
            if (bar.length >= MAX_BAR) {
                if (S.showToast) S.showToast('La barra admite máximo ' + MAX_BAR +
                    ' íconos — quita uno primero');
                return false;
            }
            bar.push(id);
        }
        save(bar);
        return true;
    }

    // ------------------------------------------- filas del ⋮ para los filtros
    // un filtro que sale de la barra sigue accesible como fila del menú —
    // su click re-dispara el click del botón original (misma lógica).
    var tabRows = {};
    (function () {
        var anchor = $('vm-stats');
        ACTIONS.filter(function (a) { return a.tab; }).forEach(function (a) {
            var b = document.createElement('button');
            b.id = 'vm-' + a.id; // vm-tab-all, vm-tab-audio…
            b.dataset.tab = a.id;
            b.innerHTML = '<i class="bi ' + a.icon + '"></i>' + a.title;
            b.addEventListener('click', function () {
                viewMenu.hidden = true;
                var t = $(a.id);
                if (t) t.click();
            });
            viewMenu.insertBefore(b, anchor);
            tabRows[a.id] = b;
        });
    })();

    // ------------------------------------------- chincheta ☆ en cada fila ⋮
    // En el celular el long-press muere (pointercancel del WebView antes de
    // los 550 ms): la chincheta fija/suelta con UN toque, siempre visible.
    function decorRows() {
        ACTIONS.forEach(function (a) {
            var row = a.tab ? tabRows[a.id] : $(a.id);
            if (!row || row.querySelector('.vm-pin')) return;
            var p = document.createElement('span');
            p.className = 'vm-pin' + (a.id === 'tab-all' ? ' lock' : '');
            p.setAttribute('data-pin', a.id);
            p.title = a.id === 'tab-all'
                ? '«Todos» siempre queda en la barra'
                : 'Fijar / quitar de la barra';
            p.innerHTML = '<i class="bi ' +
                (a.id === 'tab-all' ? 'bi-lock-fill' : 'bi-pin-angle') + '"></i>';
            row.appendChild(p);
        });
    }
    // captura: llega ANTES que el click propio de la fila → no se ejecuta
    // la acción ni se cierra el menú al tocar la chincheta
    viewMenu.addEventListener('click', function (e) {
        var p = e.target.closest && e.target.closest('.vm-pin');
        if (!p || !viewMenu.contains(p)) return;
        e.stopPropagation();
        e.preventDefault();
        var id = p.getAttribute('data-pin');
        if (id === 'tab-all') {
            if (S.showToast) S.showToast('«Todos» siempre queda en la barra');
            return;
        }
        if (toggle(id)) {
            renderBar();
            if (S.showToast) S.showToast(inBar(id) ?
                '📌 Fijado en la barra' : 'Vuelve al menú ⋮');
        }
    }, true);

    // ------------------------------------------------- íconos proxy de la barra
    // las acciones vm-* viven en el ⋮; en la barra se representan con un
    // ícono que re-dispara el click del botón original.
    var proxies = {};
    function proxyFor(a) {
        if (proxies[a.id]) return proxies[a.id];
        var b = document.createElement('button');
        b.className = 'tribal-tab tribal-ico tribal-fav';
        b.title = a.title;
        b.dataset.fav = a.id;
        b.innerHTML = '<i class="bi ' + a.icon + '"></i>';
        b.addEventListener('click', function (e) {
            // sin esto la burbuja llega al listener de filtros y rompería
            // el tab activo (dataset.filter undefined)
            e.stopPropagation();
            var src = $(a.id);
            if (src) src.click();
        });
        proxies[a.id] = b;
        return b;
    }

    // ----------------------------------------------------------- render barra
    function renderBar() {
        var bar = load();
        bar.forEach(function (id) {
            var a = actionFor(id);
            var el = a.tab ? $(id) : proxyFor(a);
            if (el) {
                el.classList.remove('fav-hidden');
                tabs.insertBefore(el, viewMore); // DOM order = orden guardado
            }
        });
        // filtros que salieron de la barra
        ACTIONS.forEach(function (a) {
            if (!a.tab) return;
            var t = $(a.id);
            if (t && bar.indexOf(a.id) < 0) t.classList.add('fav-hidden');
        });
        // proxies de acciones que salieron de la barra
        Object.keys(proxies).forEach(function (id) {
            if (bar.indexOf(id) < 0) proxies[id].classList.add('fav-hidden');
        });
        // espejo en el ⋮: la fila queda visible y su chincheta marca estado —
        // así desde el menú también se pueden devolver íconos a la barra
        ACTIONS.forEach(function (a) {
            var row = a.tab ? tabRows[a.id] : $(a.id);
            if (!row) return;
            var pinned = bar.indexOf(a.id) >= 0;
            row.classList.toggle('fav-pinned', pinned);
            var pin = row.querySelector('.vm-pin');
            if (pin && a.id !== 'tab-all') {
                pin.classList.toggle('on', pinned);
                var ic = pin.querySelector('i');
                if (ic) ic.className = 'bi ' +
                    (pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle');
            }
        });
    }

    // ----------------------------------------------------- píldora contextual
    var pop = document.createElement('div');
    pop.id = 'fav-pop';
    pop.hidden = true;
    document.body.appendChild(pop);

    var lpFired = false; // el click que sigue al long-press no debe ejecutarse

    function placePop(el) {
        var r = el.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.left,
            window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
    }
    // buttons: [{html, cb, keep}] — keep:true deja la píldora abierta
    // (para mover ◀/▶ varias posiciones sin volver a hacer long-press)
    function showPop(el, buttons) {
        pop.innerHTML = '';
        buttons.forEach(function (b) {
            var btn = document.createElement('button');
            btn.className = 'fp-act';
            btn.innerHTML = b.html;
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                b.cb();
                // la píldora es FIJA: aunque el ítem se mueva detrás, ella
                // se queda donde apareció → el dedo siempre cae en la misma
                // opción (sin esto ◀◀ acababa tocando "Al menú" por error)
                if (!b.keep) pop.hidden = true;
            });
            pop.appendChild(btn);
        });
        pop.hidden = false;
        placePop(el);
    }
    document.addEventListener('pointerdown', function (e) {
        if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
    }, true);
    // tragar el click posterior al long-press (excepto sobre la píldora).
    // OJO: hay WebViews que NO emiten el click tras el long-press → lpFired
    // quedaba pegado y se tragaba taps legítimos (movimientos "erráticos").
    // Dos salvavidas: el tap en la píldora también lo limpia, y un timer
    // de 1.2 s lo suelta si el click nunca llegó.
    document.addEventListener('click', function (e) {
        if (!lpFired) return;
        if (pop.contains(e.target)) { lpFired = false; return; }
        lpFired = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);

    // ----------------------------------------------------- long-press ~550 ms
    var lpT = null, lpX = 0, lpY = 0;
    document.addEventListener('pointerdown', function (e) {
        var barEl = e.target.closest('#media-tabs .tribal-tab');
        var menuEl = e.target.closest('#view-menu button');
        var el = barEl || menuEl, id = null, pinned = false;
        if (barEl && !barEl.classList.contains('fav-hidden')) {
            id = barEl.dataset.fav || barEl.id;
            pinned = true;
        } else if (menuEl) {
            id = menuEl.dataset.tab || menuEl.id;
        }
        if (!el || !id || !actionFor(id)) return;
        lpX = e.clientX; lpY = e.clientY;
        lpT = setTimeout(function () {
            lpT = null;
            lpFired = true;
            setTimeout(function () { lpFired = false; }, 1200);
            if (id === 'tab-all') {
                // «Todos» es fijo: ni lo movemos ni sale de la barra
                showPop(el, [{ html: '<i class="bi bi-lock-fill"></i> «Todos» es fijo',
                    cb: function () {} }]);
            } else if (pinned) {
                showPop(el, [
                    { html: '<i class="bi bi-chevron-left"></i>', keep: true,
                      cb: function () {
                          if (move(id, -1)) renderBar();
                      } },
                    { html: '<i class="bi bi-star-fill"></i> Al menú',
                      cb: function () {
                          toggle(id); renderBar();
                          if (S.showToast) S.showToast('Vuelve al menú ⋮');
                      } },
                    { html: '<i class="bi bi-chevron-right"></i>', keep: true,
                      cb: function () {
                          if (move(id, 1)) renderBar();
                      } }
                ]);
            } else {
                showPop(el, [
                    { html: '<i class="bi bi-star"></i> Fijar en la barra',
                      cb: function () {
                          toggle(id); renderBar();
                          if (S.showToast) S.showToast('Fijado en la barra');
                      } }
                ]);
            }
        }, 550);
    }, true);
    ['pointerup', 'pointercancel'].forEach(function (ev) {
        document.addEventListener(ev, function () {
            if (lpT) { clearTimeout(lpT); lpT = null; }
        }, true);
    });
    document.addEventListener('pointermove', function (e) {
        if (lpT && (Math.abs(e.clientX - lpX) > 10 ||
                    Math.abs(e.clientY - lpY) > 10)) {
            clearTimeout(lpT); lpT = null;
        }
    }, true);
    // el long-press en estos botones nunca abre el menú del WebView
    document.addEventListener('contextmenu', function (e) {
        if (e.target.closest('#media-tabs .tribal-tab, #view-menu button')) {
            e.preventDefault();
        }
    });

    decorRows();
    renderBar();
});
