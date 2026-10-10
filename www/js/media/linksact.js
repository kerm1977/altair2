// ============================================================================
// ARCHIVO: media/linksact.js
// RESPONSABILIDAD: acciones y eventos de la libretilla de enlaces.
//   - create(ov, deps, st, api) → handlers ligados: agregar/editar enlace,
//     crear categoría, menú ⋮ (compartir/favorito/editar/imagen), pager,
//     gestión de categorías (renombrar/eliminar), imagen propia
//   - st = {editId, pickId, query, page} · api = helpers de links.js
// ============================================================================
window.TribalLinksAct = (function () {
    'use strict';

    function create(ov, deps, st, api) {
        var UI = window.TribalLinksUI;

        function findCat(id) {
            return api.cats().filter(function (c) { return c.id === id; })[0];
        }
        function closeMenus() {
            ov.querySelectorAll('.lk-menu').forEach(function (m) { m.hidden = true; });
        }
        function toggleMenu(id) {
            var box = ov.querySelector('[data-box="m-' + id + '"]');
            var wasOpen = box && !box.hidden;
            closeMenus();
            if (box && !wasOpen) box.hidden = false;
        }

        // ------------------------------------------------------ enlaces ----
        function addOrSave() {
            var name = ov.querySelector('#lk-name').value.trim();
            var url = ov.querySelector('#lk-url').value.trim().toLowerCase();
            var cat = ov.querySelector('#lk-cat').value;
            if (!name) { deps.toast('Ponle un nombre al enlace'); return; }
            var d = api.db(); d.links = d.links || [];
            if (st.editId) {
                // ojo: mutar sobre d.links (findLink relee otra copia del LS)
                var l = d.links.filter(function (x) { return x.id === st.editId; })[0];
                if (l) { l.name = name; l.url = api.normUrl(url, name); l.cat = cat; }
                st.editId = null;
                deps.toast('Enlace actualizado');
            } else {
                d.links.push({ id: 'lnk_' + Date.now().toString(36) +
                    Math.random().toString(36).slice(2, 6),
                    name: name, url: api.normUrl(url, name),
                    cat: cat, icon: null, fav: false, at: Date.now() });
                deps.toast('Enlace guardado');
                st.page = 1e9;   // saltar a la página donde cayó el nuevo
            }
            api.save(d);
            ov.querySelector('#lk-name').value = '';
            ov.querySelector('#lk-url').value = '';
            api.render();
            // guardado → contraer el acordeón «Nuevo enlace · categorías · buscar»
            var acc = ov.querySelector('.lk-acc');
            if (acc) acc.open = false;
        }

        function openLink(l) {
            var w = window.open(l.url, '_blank', 'noopener');
            if (!w) location.href = l.url;
        }

        // ------------------------------------------------------ compartir --
        function share(l) {
            var P = window.Capacitor && window.Capacitor.Plugins;
            if (P && P.Share && P.Share.share) {
                P.Share.share({ title: l.name, text: l.name, url: l.url,
                                dialogTitle: 'Compartir enlace' }).catch(function () {});
            } else if (navigator.share) {
                navigator.share({ title: l.name, url: l.url }).catch(function () {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(l.url)
                    .then(function () { deps.toast('Enlace copiado'); });
            }
        }
        function shareBy(kind, l) {
            var enc = encodeURIComponent;
            if (kind === 'wa')
                return void window.open('https://wa.me/?text=' +
                    enc(l.name + ' — ' + l.url), '_blank');
            if (kind === 'mail')
                return void (location.href = 'mailto:?subject=' + enc(l.name) +
                    '&body=' + enc(l.url));
            if (kind === 'copy') {
                if (navigator.clipboard)
                    navigator.clipboard.writeText(l.url)
                        .then(function () { deps.toast('Enlace copiado'); });
                return;
            }
            share(l);   // 'sys' → hoja nativa / Web Share / portapapeles
        }

        // -------------------------------------------------- imagen propia --
        function onIconFile() {
            var f = ov.querySelector('#lk-icon').files[0];
            ov.querySelector('#lk-icon').value = '';
            if (!f) return;
            var img = new Image();
            img.onload = function () {
                var c = document.createElement('canvas');
                c.width = c.height = 64;
                var s = Math.min(img.width, img.height);
                c.getContext('2d').drawImage(
                    img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 64, 64);
                var d = api.db();
                var l = (d.links || []).filter(function (x) { return x.id === st.pickId; })[0];
                if (l) { l.icon = c.toDataURL('image/png'); api.save(d); api.render(); }
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(f);
        }

        // ---------------------------------------------------- categorías ---
        function addCat() {
            var n = ov.querySelector('#lk-newcat').value.trim();
            if (!n) return;
            var d = api.db();
            (d.cats = d.cats || api.cats()).push({
                id: 'cat_' + Date.now().toString(36), name: n });
            api.save(d);
            ov.querySelector('#lk-newcat').value = '';
            api.refreshCats(d.cats[d.cats.length - 1].id);
            api.render();
            deps.toast('Categoría «' + n + '» creada');
        }
        function onCatsClick(e) {
            var sv = e.target.closest('[data-catsave]');
            if (sv) {
                var c = findCat(sv.dataset.catsave);
                var row = sv.closest('.lk-catrow');
                var name = row && row.querySelector('.lk-catname').value.trim();
                if (!c || !name) return;
                var d = api.db();
                var i = d.cats.findIndex(function (x) { return x.id === c.id; });
                if (i >= 0) {
                    d.cats[i].name = name;
                    api.save(d);
                    api.refreshCats(c.id);
                    api.render();
                    deps.toast('Categoría renombrada a «' + name + '»');
                }
                return;
            }
            var dl = e.target.closest('[data-catdel]');
            if (!dl) return;
            var c2 = findCat(dl.dataset.catdel);
            if (!c2) return;
            var n = api.links().filter(function (l) { return l.cat === c2.id; }).length;
            deps.confirm('Eliminar categoría',
                '¿Borrar la categoría «' + c2.name + '»?' +
                (n ? ' Sus ' + n + ' enlace(s) pasan a «Otros».' : ''),
                'Eliminar', function () {
                    var d2 = api.db();
                    d2.cats = (d2.cats || []).filter(function (x) { return x.id !== c2.id; });
                    api.save(d2);
                    api.refreshCats();
                    api.render();
                    deps.toast('Categoría eliminada');
                });
        }

        // --------------------------------------------------- lista clics ---
        function onListClick(e) {
            var t = e.target;
            var mn = t.closest('[data-menu]');
            if (mn) { toggleMenu(mn.dataset.menu); return; }
            var sh = t.closest('[data-sh]');
            if (sh) {
                closeMenus();
                var p = sh.dataset.sh.split(':');
                var lsh = api.findLink(p.slice(1).join(':'));
                if (lsh) shareBy(p[0], lsh);
                return;
            }
            if (!t.closest('.lk-menu')) closeMenus();

            var fv = t.closest('[data-fav]');
            if (fv) {
                var d0 = api.db(), ls0 = d0.links || [];
                var ix = ls0.findIndex(function (x) { return x.id === fv.dataset.fav; });
                if (ix >= 0) {
                    ls0[ix].fav = !ls0[ix].fav;
                    api.save(d0); api.render();
                    deps.toast(ls0[ix].fav ? '♥ En favoritos' : 'Fuera de favoritos');
                }
                return;
            }
            var open = t.closest('[data-open]');
            if (open) {
                var l0 = api.findLink(open.dataset.open);
                if (l0) openLink(l0);
                return;
            }
            var im = t.closest('[data-img]');
            if (im) {
                closeMenus();
                var l2 = api.findLink(im.dataset.img);
                if (l2) { st.pickId = l2.id; ov.querySelector('#lk-icon').click(); }
                return;
            }
            var ed = t.closest('[data-edit]');
            if (ed) {
                var l3 = api.findLink(ed.dataset.edit);
                if (!l3) return;
                closeMenus();
                st.editId = l3.id;
                ov.querySelector('#lk-name').value = l3.name;
                ov.querySelector('#lk-url').value = l3.url;
                api.refreshCats(l3.cat);
                ov.querySelector('#lk-add').innerHTML =
                    '<i class="bi bi-check-lg"></i> Guardar enlace';
                var acc = ov.querySelector('.lk-acc');
                if (acc && !acc.open) acc.open = true;
                ov.querySelector('#lk-name').focus();
                return;
            }
            var dl = t.closest('[data-del]');
            if (dl) {
                var l4 = api.findLink(dl.dataset.del);
                if (!l4) return;
                deps.confirm('Eliminar enlace',
                    '¿Borrar «' + l4.name + '» de la libretilla?', 'Eliminar',
                    function () {
                        var d = api.db();
                        d.links = (d.links || []).filter(function (x) {
                            return x.id !== l4.id; });
                        api.save(d); api.render();
                        deps.toast('Enlace eliminado');
                    });
            }
        }

        return {
            addOrSave: addOrSave, addCat: addCat, onIconFile: onIconFile,
            onCatsClick: onCatsClick, onListClick: onListClick
        };
    }

    return { create: create };
})();
