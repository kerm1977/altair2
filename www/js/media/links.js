// ============================================================================
// ARCHIVO: media/links.js
// RESPONSABILIDAD: libretilla/agenda de hipervínculos de TRIBALs — núcleo.
//   - Persistencia localStorage 'tribu_links' (cats + links con fav/icon)
//   - Categorías predefinidas + crear/renombrar/eliminar
//   - open(): monta la página completa y cablea los eventos (linksact.js)
//   - La UI (HTML) vive en linksui.js
// ============================================================================
window.TribalLinks = (function () {
    'use strict';
    var LS = 'tribu_links';
    var ov = null, deps = null;
    var st = { editId: null, pickId: null, query: '', page: 0 };
    var DEFAULT_CATS = ['General', 'Noticieros', 'Deportes', 'Tecnología'];
    var UI = function () { return window.TribalLinksUI; };

    // ------------------------------------------------------------ datos ----
    function db() {
        try { return JSON.parse(localStorage.getItem(LS) || '{}'); }
        catch (e) { return {}; }
    }
    function save(d) {
        try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {}
    }
    function cats() {
        var d = db(), c = d.cats;
        if (!c || !c.length) {
            c = DEFAULT_CATS.map(function (n, i) { return { id: 'cat_' + i, name: n }; });
            d.cats = c; save(d);
        }
        return c;
    }
    function links() { return db().links || []; }
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
                     '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function normUrl(u, name) {
        u = String(u || '').trim();
        // solo nombre → genera un hipervínculo de búsqueda automático
        if (!u) return 'https://www.google.com/search?q=' +
                      encodeURIComponent(name || '');
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        return u;
    }
    function hostOf(u) {
        try { return new URL(u).hostname; } catch (e) { return ''; }
    }
    function favicon(u) {
        var h = hostOf(u);
        return h ? 'https://www.google.com/s2/favicons?sz=64&domain=' +
                   encodeURIComponent(h) : '';
    }
    function uid() {
        return 'lnk_' + Date.now().toString(36) +
               Math.random().toString(36).slice(2, 6);
    }
    function findLink(id) {
        return links().filter(function (x) { return x.id === id; })[0];
    }
    function render() {
        st.page = UI().renderList(ov, links(), cats(), st.query, st.page);
    }
    function refreshCats(sel) {
        // si no se indica categoría, conservar la que el usuario ya eligió:
        // reescribir el <select> resetea la selección y "borraba" la info
        if (sel === undefined && ov) {
            var el = ov.querySelector('#lk-cat');
            sel = el ? el.value : undefined;
        }
        UI().fillCats(ov, cats(), sel);
        UI().catRows(ov, cats());
    }

    // ------------------------------------------------------------- open ----
    function open(S) {
        deps = S;
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = document.createElement('div');
        ov.className = 'tribal-overlay tribal-p2p-ov';
        ov.innerHTML = UI().panelHtml();
        (S.mount || document.body).appendChild(ov);
        st.editId = null; st.pickId = null; st.query = ''; st.page = 0;

        var act = window.TribalLinksAct.create(ov, deps, st, {
            db: db, save: save, cats: cats, links: links,
            esc: esc, normUrl: normUrl, findLink: findLink,
            render: render, refreshCats: refreshCats
        });

        refreshCats();
        render();
        ov.querySelector('#lk-close').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('#lk-add').addEventListener('click', act.addOrSave);
        ov.querySelector('#lk-addcat').addEventListener('click', act.addCat);
        ov.querySelector('#lk-q').addEventListener('input', function () {
            st.query = this.value.trim(); st.page = 0; render();
        });
        var urlIn = ov.querySelector('#lk-url');
        urlIn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') act.addOrSave();
        });
        // URL obligatoriamente en minúsculas mientras se escribe
        urlIn.addEventListener('input', function () {
            var low = this.value.toLowerCase();
            if (low !== this.value) this.value = low;
        });
        ov.querySelector('#lk-icon').addEventListener('change', act.onIconFile);
        ov.querySelector('#lk-list').addEventListener('click', act.onListClick);
        ov.querySelector('#lk-cats').addEventListener('click', act.onCatsClick);
        // renombrar con Enter dentro de la fila de categoría
        ov.querySelector('#lk-cats').addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var row = e.target.closest('.lk-catrow');
            if (row) row.querySelector('[data-catsave]').click();
        });
        ov.querySelector('#lk-prev').addEventListener('click', function () {
            st.page--; render();
        });
        ov.querySelector('#lk-next').addEventListener('click', function () {
            st.page++; render();
        });
    }
    function close() {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        ov = null; st.editId = null; st.pickId = null;
    }

    // API interna para linksui.js
    return {
        open: open, close: close,
        esc: esc, hostOf: hostOf, favicon: favicon
    };
})();
