// ============================================================================
// ARCHIVO: media/tabfavs.js
// RESPONSABILIDAD: accesos favoritos personalizables en la barra de filtros.
//   - Long-press (~550 ms) sobre cualquier botón del menú ⋮ → "☆ Colocar en
//     favoritos" → se fija como ícono junto a Todo/Música/Videos/Fotos/
//     Colecciones y desaparece del menú.
//   - Long-press sobre un ícono fijado → "★ Quitar de favoritos" → vuelve
//     a vivir solo en el menú ⋮.
//   - Persistente en localStorage ('tribu_fav_actions').
// ============================================================================
window.Sono.register('tabfavs', function (S) {
    'use strict';
    var $ = S.$;
    var KEY = 'tribu_fav_actions';
    var favsBox = $('tab-favs'), viewMenu = $('view-menu');
    if (!favsBox || !viewMenu) return;

    // acciones fijables: id del botón en el ⋮ → ícono + nombre corto.
    // El ícono fijado solo re-dispara el click del botón original → toda la
    // lógica (slideshow, p2p, chat, libros…) queda en un solo lugar.
    var ACTIONS = [
        { vm: 'vm-stats',  icon: 'bi-bar-chart',            title: 'Estadísticas' },
        { vm: 'vm-slide',  icon: 'bi-collection-play',      title: 'Slideshow' },
        { vm: 'vm-newcol', icon: 'bi-folder-plus',          title: 'Nueva colección' },
        { vm: 'vm-batch',  icon: 'bi-input-cursor-text',    title: 'Renombrar' },
        { vm: 'vm-undo',   icon: 'bi-arrow-counterclockwise', title: 'Deshacer' },
        { vm: 'vm-btchat', icon: 'bi-bluetooth',            title: 'Chat Bluetooth' },
        { vm: 'vm-doc',    icon: 'bi-book-half',            title: 'Libros' },
        { vm: 'vm-files',  icon: 'bi-folder2-open',         title: 'Archivos' },
        { vm: 'vm-p2p',    icon: 'bi-diagram-3',            title: 'P2P Torrents' },
        { vm: 'vm-links',  icon: 'bi-link-45deg',           title: 'Enlaces' },
        { vm: 'vm-perms',  icon: 'bi-shield-lock',          title: 'Permisos' },
        { vm: 'vm-revoke', icon: 'bi-shield-x',             title: 'Revocar permisos' }
    ];
    function actionFor(vmId) {
        for (var i = 0; i < ACTIONS.length; i++) {
            if (ACTIONS[i].vm === vmId) return ACTIONS[i];
        }
        return null;
    }

    function load() {
        try {
            var a = JSON.parse(localStorage.getItem(KEY) || '[]');
            return a.filter(function (id) { return actionFor(id); });
        } catch (e) { return []; }
    }
    function save(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
    function isFav(id) { return load().indexOf(id) >= 0; }
    function toggleFav(id) {
        var favs = load(), i = favs.indexOf(id);
        if (i >= 0) favs.splice(i, 1); else favs.push(id);
        save(favs);
        renderFavs();
    }

    // íconos fijados + espejo de visibilidad dentro del ⋮
    function renderFavs() {
        var favs = load();
        favsBox.innerHTML = '';
        favs.forEach(function (id) {
            var a = actionFor(id);
            var b = document.createElement('button');
            b.className = 'tribal-tab tribal-ico tribal-fav';
            b.title = a.title;
            b.dataset.vm = id;
            b.innerHTML = '<i class="bi ' + a.icon + '"></i>';
            b.addEventListener('click', function (e) {
                // sin esto la burbuja llega al listener de filtros y
                // rompería el tab activo (dataset.filter undefined)
                e.stopPropagation();
                var vm = $(id);
                if (vm) vm.click();
            });
            favsBox.appendChild(b);
        });
        ACTIONS.forEach(function (a) {
            var vm = $(a.vm);
            if (vm) vm.classList.toggle('fav-pinned', isFav(a.vm));
        });
    }

    // ------------------------------------------------- píldora contextual
    var pop = document.createElement('div');
    pop.id = 'fav-pop';
    pop.hidden = true;
    document.body.appendChild(pop);

    var lpFired = false; // el click que sigue al long-press no debe ejecutarse

    function showPop(el, label, cb) {
        var r = el.getBoundingClientRect();
        pop.innerHTML = label;
        pop.hidden = false;
        pop.style.left = Math.max(8, Math.min(r.left,
            window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
        pop.onclick = function () {
            pop.hidden = true;
            cb();
        };
    }
    document.addEventListener('pointerdown', function (e) {
        if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
    }, true);
    // tragar el click posterior al long-press (en captura, antes que todo) —
    // pero el tap sobre la propia píldora sí debe pasar
    document.addEventListener('click', function (e) {
        if (!lpFired) return;
        if (pop.contains(e.target)) return;
        lpFired = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);

    // ----------------------------------------------------- long-press ~550ms
    var lpT = null, lpX = 0, lpY = 0;
    document.addEventListener('pointerdown', function (e) {
        var menuBtn = e.target.closest('#view-menu button[id^="vm-"]');
        var favBtn = e.target.closest('.tribal-fav');
        var el = menuBtn || favBtn;
        if (!el || (menuBtn && !actionFor(el.id))) return;
        lpX = e.clientX; lpY = e.clientY;
        lpT = setTimeout(function () {
            lpT = null;
            lpFired = true;
            if (favBtn) {
                showPop(favBtn, '<i class="bi bi-star-fill"></i> Quitar de favoritos',
                    function () {
                        toggleFav(favBtn.dataset.vm);
                        if (S.showToast) S.showToast('Quitado de favoritos');
                    });
            } else {
                showPop(menuBtn, isFav(menuBtn.id)
                    ? '<i class="bi bi-star-fill"></i> Quitar de favoritos'
                    : '<i class="bi bi-star"></i> Colocar en favoritos',
                    function () {
                        toggleFav(menuBtn.id);
                        if (S.showToast) {
                            S.showToast(isFav(menuBtn.id)
                                ? 'Fijado en la barra' : 'Vuelve al menú ⋮');
                        }
                    });
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
        if (e.target.closest('#view-menu button[id^="vm-"], .tribal-fav')) {
            e.preventDefault();
        }
    });

    renderFavs();
});
