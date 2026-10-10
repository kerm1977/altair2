// ============================================================================
// ARCHIVO: media/linksui.js
// RESPONSABILIDAD: HTML/render de la libretilla de enlaces (links.js).
//   - panelHtml: página completa con acordeón "Nuevo enlace" que contiene
//     el formulario + gestión de categorías + buscador
//   - fillCats: <select> de categorías · catRows: renombrar/eliminar cats
//   - renderList: enlaces agrupados por categoría, paginados de 10 en 10
// ============================================================================
window.TribalLinksUI = (function () {
    'use strict';
    var PAGE = 10;

    function esc(s) { return window.TribalLinks.esc(s); }

    function panelHtml() {
        return '<div class="tribal-p2p tribal-links">' +
        '<div class="tribal-p2p-head">' +
            '<button class="tribal-ctrl lk-back" id="lk-close" title="Volver">' +
                '<i class="bi bi-arrow-left"></i><span>Volver</span></button>' +
            '<i class="bi bi-link-45deg"></i>' +
            '<strong>Libretilla de enlaces</strong>' +
        '</div>' +
        '<div class="lk-body">' +
            '<details class="tribal-acc lk-acc">' +
                '<summary><i class="bi bi-plus-circle"></i> ' +
                    'Nuevo enlace · categorías · buscar</summary>' +
                '<div class="lk-form">' +
                    '<input id="lk-name" class="tribal-input" ' +
                        'placeholder="Nombre — ej. CD Hoy">' +
                    '<input id="lk-url" class="tribal-input" ' +
                        'placeholder="URL en minúsculas — ej. crhoy.com" ' +
                        'inputmode="url" autocapitalize="none" ' +
                        'autocorrect="off" spellcheck="false">' +
                    '<div class="lk-row">' +
                        '<select id="lk-cat" class="tribal-select"></select>' +
                        '<button class="tribal-btn tribal-btn-xs" id="lk-add">' +
                            '<i class="bi bi-check-lg"></i> Guardar enlace</button>' +
                    '</div>' +
                    '<div class="lk-row">' +
                        '<input id="lk-newcat" class="tribal-input" ' +
                            'placeholder="Nueva categoría…">' +
                        '<button class="tribal-btn tribal-btn-xs" id="lk-addcat">' +
                            '<i class="bi bi-folder-plus"></i> Crear</button>' +
                    '</div>' +
                    '<div class="lk-cats" id="lk-cats"></div>' +
                    '<input id="lk-q" class="tribal-input" ' +
                        'placeholder="Buscar enlace o categoría…">' +
                '</div>' +
            '</details>' +
            '<div class="lk-list" id="lk-list"></div>' +
            '<div class="lk-pager" id="lk-pager" hidden>' +
                '<button class="tribal-btn tribal-btn-xs" id="lk-prev">' +
                    '<i class="bi bi-chevron-left"></i></button>' +
                '<span id="lk-pginfo"></span>' +
                '<button class="tribal-btn tribal-btn-xs" id="lk-next">' +
                    '<i class="bi bi-chevron-right"></i></button>' +
            '</div>' +
        '</div>' +
        '<input type="file" id="lk-icon" accept="image/*" hidden>' +
        '</div>';
    }

    function fillCats(ov, cats, sel) {
        ov.querySelector('#lk-cat').innerHTML = cats.map(function (c) {
            return '<option value="' + c.id + '"' +
                (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('');
    }

    // filas de gestión de categorías dentro del acordeón (renombrar/borrar)
    function catRows(ov, cats) {
        ov.querySelector('#lk-cats').innerHTML = cats.length ? cats.map(function (c) {
            return '<div class="lk-catrow" data-cat="' + c.id + '">' +
                '<input class="tribal-input lk-catname" value="' + esc(c.name) +
                    '" title="Editar y Enter para renombrar">' +
                '<button class="tribal-ctrl" data-catsave="' + c.id +
                    '" title="Renombrar"><i class="bi bi-check-lg"></i></button>' +
                '<button class="tribal-ctrl tr-danger" data-catdel="' + c.id +
                    '" title="Eliminar categoría"><i class="bi bi-trash3"></i></button>' +
            '</div>';
        }).join('') : '';
    }

    function linkIcon(l) {
        var src = l.icon || window.TribalLinks.favicon(l.url);
        var letter = esc((l.name || '?').charAt(0).toUpperCase());
        return src
            ? '<img class="lk-ico" src="' + esc(src) + '" alt="" ' +
              'onerror="this.outerHTML=\'<span class=&quot;lk-ico lk-letter&quot;>' +
              letter + '</span>\'">'
            : '<span class="lk-ico lk-letter">' + letter + '</span>';
    }

    function rowHtml(l) {
        return '<div class="lk-item" data-id="' + l.id + '">' +
            '<span class="lk-icow">' + linkIcon(l) +
                (l.fav ? '<i class="bi bi-heart-fill lk-fav-badge"></i>' : '') +
            '</span>' +
            '<div class="lk-info" data-open="' + l.id + '" title="Abrir enlace">' +
                '<p>' + esc(l.name) + '</p>' +
                '<span>' + esc(window.TribalLinks.hostOf(l.url) || l.url) + '</span>' +
            '</div>' +
            '<button class="tribal-ctrl" data-menu="' + l.id +
                '" title="Opciones"><i class="bi bi-three-dots"></i></button>' +
            '<button class="tribal-ctrl tr-danger" data-del="' + l.id +
                '" title="Eliminar"><i class="bi bi-trash3"></i></button>' +
            '<div class="lk-menu" data-box="m-' + l.id + '" hidden>' +
                '<button data-sh="wa:' + l.id + '">' +
                    '<i class="bi bi-whatsapp"></i> WhatsApp</button>' +
                '<button data-sh="mail:' + l.id + '">' +
                    '<i class="bi bi-envelope"></i> Correo</button>' +
                '<button data-sh="copy:' + l.id + '">' +
                    '<i class="bi bi-clipboard"></i> Copiar enlace</button>' +
                '<button data-sh="sys:' + l.id + '">' +
                    '<i class="bi bi-share"></i> Compartir…</button>' +
                '<button data-fav="' + l.id + '">' +
                    '<i class="bi ' + (l.fav ? 'bi-heart-fill' : 'bi-heart') +
                    '"></i> ' + (l.fav ? 'Quitar favorito' : 'Favorito') + '</button>' +
                '<button data-edit="' + l.id + '">' +
                    '<i class="bi bi-pencil"></i> Editar</button>' +
                '<button data-img="' + l.id + '">' +
                    '<i class="bi bi-image"></i> Imagen propia</button>' +
            '</div>' +
        '</div>';
    }

    // enlaces agrupados por categoría, paginados de 10 en 10
    function renderList(ov, ls, cats, query, page) {
        var box = ov.querySelector('#lk-list');
        var pager = ov.querySelector('#lk-pager');
        var q = (query || '').toLowerCase();
        var shown = ls.filter(function (l) {
            if (!q) return true;
            var c = cats.filter(function (x) { return x.id === l.cat; })[0];
            return (l.name || '').toLowerCase().indexOf(q) >= 0 ||
                   (l.url || '').toLowerCase().indexOf(q) >= 0 ||
                   (c && c.name.toLowerCase().indexOf(q) >= 0);
        });
        if (!shown.length) {
            pager.hidden = true;
            box.innerHTML = '<div class="tribal-empty-mini"><i class="bi bi-link-45deg"></i>' +
                '<p>' + (q ? 'Nada con «' + esc(query) + '»' :
                    'Sin enlaces. Despliega «Nuevo enlace» para agregar.') +
                '</p></div>';
            return page;
        }
        // lista plana: favoritos duplicados al frente, luego por categoría
        var flat = [];
        shown.filter(function (l) { return l.fav; }).forEach(function (l) {
            flat.push({ l: l, g: '♥ Favoritos', gf: true });
        });
        cats.forEach(function (c) {
            shown.forEach(function (l) {
                if (l.cat === c.id) flat.push({ l: l, g: c.name });
            });
        });
        shown.forEach(function (l) {
            if (!cats.some(function (c) { return c.id === l.cat; }))
                flat.push({ l: l, g: 'Otros' });
        });

        var pages = Math.max(1, Math.ceil(flat.length / PAGE));
        page = Math.max(0, Math.min(pages - 1, page || 0));
        var slice = flat.slice(page * PAGE, page * PAGE + PAGE);

        var html = '', lastG = null;
        slice.forEach(function (en) {
            if (en.g !== lastG) {
                lastG = en.g;
                html += '<div class="lk-cat' + (en.gf ? ' lk-cat-fav' : '') + '">' +
                        esc(en.g) + '</div><hr class="lk-hr">';
            }
            html += rowHtml(en.l);
        });
        box.innerHTML = html;

        pager.hidden = flat.length <= PAGE;
        ov.querySelector('#lk-pginfo').textContent =
            'Pág ' + (page + 1) + '/' + pages + ' · ' + flat.length + ' enlace(s)';
        ov.querySelector('#lk-prev').disabled = page <= 0;
        ov.querySelector('#lk-next').disabled = page >= pages - 1;
        return page;
    }

    return { panelHtml: panelHtml, fillCats: fillCats, catRows: catRows,
             renderList: renderList, PAGE: PAGE };
})();
