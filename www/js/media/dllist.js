// ============================================================================
// ARCHIVO: media/dllist.js — pinta la cola activa + el historial de descargas
// RESPONSABILIDAD: filas con ícono por tipo, nombre, estado (en cola /
// descargando % / ✔ tamaño / ✖ error), ruta en modo revisión, botón de
// borrado de 3 pasos (🗑 → ¿Eliminar? → Borrar definitivamente) y paginación
// de 20 por página. Sin estado propio — todo llega por render().
// API: TribalDlList.render(el, {queue, running, items, page, review, dir})
// ============================================================================
window.TribalDlList = (function () {
    'use strict';
    var PAGE = 20;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function mb(n) { return n > 0 ? (n / 1048576).toFixed(1) + ' MB' : ''; }
    function when(ts) {
        if (!ts) return '';
        var d = new Date(ts);
        return ('0' + d.getDate()).slice(-2) + '/' +
               ('0' + (d.getMonth() + 1)).slice(-2) + ' ' +
               ('0' + d.getHours()).slice(-2) + ':' +
               ('0' + d.getMinutes()).slice(-2);
    }
    // acepta 'a'|'v' o booleano "esAudio"
    function icon(k) {
        return (k === 'a' || k === true)
            ? 'bi-music-note-beamed' : 'bi-camera-video-fill';
    }

    // fila de la cola viva (pendiente o bajando ahora)
    function qRow(j, isRun, pct, line) {
        var st = isRun
            ? '<b class="dg-run">' + (pct >= 0 ? pct.toFixed(0) + '%' : '…') +
              '</b><small>' + esc(line || 'descargando…') + '</small>'
            : '<b class="dg-wait">en cola</b>';
        return '<div class="dg-row dg-qrow' + (isRun ? ' on' : '') + '">' +
            '<i class="bi ' + icon(j.audio) + '"></i>' +
            '<div class="dg-rtxt"><b>' + esc(j.url.length > 60
                ? j.url.slice(0, 60) + '…' : j.url) + '</b>' +
            st + '</div></div>';
    }

    // fila del historial (persistente) — review=true muestra la ruta real
    function hRow(e, review) {
        var st = e.status === 'ok'
            ? '<b class="dg-ok">✔ ' + mb(e.size) + '</b>'
            : '<b class="dg-bad">✖ ' + esc(e.err || 'falló') + '</b>';
        return '<div class="dg-row" data-id="' + e.id + '">' +
            '<i class="bi ' + icon(e.kind === 'a') + '"></i>' +
            '<div class="dg-rtxt"><b>' + esc(e.name) + '</b>' +
            '<small>' + when(e.ts) + (review && e.path
                ? ' · ' + esc(e.path) : '') + '</small>' + st + '</div>' +
            '<button class="dg-del" data-id="' + e.id +
            '" data-step="0" title="Eliminar">' +
            '<i class="bi bi-trash3"></i></button>' + '</div>';
    }

    function pagerHtml(total, page) {
        var pages = Math.ceil(total / PAGE);
        if (pages <= 1) return '';
        return '<div class="dg-pager">' +
            '<button class="dg-pg" data-pg="-1" ' +
                (page === 0 ? 'disabled' : '') + '>‹</button>' +
            '<span>' + (page + 1) + ' / ' + pages + '</span>' +
            '<button class="dg-pg" data-pg="1" ' +
                (page >= pages - 1 ? 'disabled' : '') + '>›</button>' +
            '</div>';
    }

    function render(el, o) {
        if (!el) return;
        var html = '';
        if (o.dir) {
            html += '<div class="dg-dir">📁 ' + esc(o.dir) + '</div>';
        }
        // cola viva: la que corre primero, luego pendientes
        if (o.running) html += qRow(o.running, true, o.pct, o.line);
        (o.queue || []).forEach(function (j) { html += qRow(j, false); });
        if ((o.running || (o.queue && o.queue.length)) && o.items.length) {
            html += '<div class="dg-hr"></div>';
        }
        var slice = (o.items || []).slice(o.page * PAGE, (o.page + 1) * PAGE);
        if (!slice.length && !o.running && !(o.queue && o.queue.length)) {
            html += '<div class="dg-empty">Sin descargas todavía — ' +
                'pega un enlace arriba.</div>';
        }
        slice.forEach(function (e) { html += hRow(e, o.review); });
        html += pagerHtml((o.items || []).length, o.page);
        el.innerHTML = html;
    }

    // markup de la página completa (header, buscador, toggle, botones, lista)
    function pageHtml() {
        return '<div class="fx-page dg-page"><div class="fx-head">' +
            '<button type="button" class="fx-back dg-x" ' +
            'aria-label="Volver">‹</button><b>⬇ Descargas</b>' +
            '<button type="button" class="fx-fetch dg-rev">' +
            '📂 Mis descargas</button></div>' +
            '<div class="dg-urlbox">' +
            '<input class="dg-url" type="url" inputmode="url" ' +
            'placeholder="https:// — YouTube, TikTok, X, Facebook…" ' +
            'autocomplete="off">' +
            '<button class="dg-paste" title="Pegar enlace">' +
            '<i class="bi bi-clipboard"></i></button></div>' +
            '<label class="dg-plrow"><input type="checkbox" ' +
            'class="dg-pl"> <span>Descargar lista completa (playlist)</span>' +
            '</label>' +
            '<div class="dg-btns">' +
            '<button class="dg-vid"><i class="bi bi-camera-video-fill">' +
            '</i>Video MP4</button>' +
            '<button class="dg-aud"><i class="bi bi-music-note-beamed">' +
            '</i>Solo audio MP3</button></div>' +
            '<div class="dg-prog"><div class="dg-fill"></div></div>' +
            '<div class="dg-status"></div>' +
            '<div class="dg-tools">' +
            '<button type="button" class="dg-tool dg-conbtn">' +
            '▸ consola</button>' +
            '<button type="button" class="dg-tool dg-upd">' +
            '⟳ actualizar motor</button></div>' +
            '<div class="dg-console" hidden></div>' +
            '<div class="dg-list"></div>' +
            '<div class="fx-foot">yt-dlp en el teléfono · los archivos ' +
            'caen en la colección «descargas»</div></div>';
    }

    // consola de diagnóstico: cada línea cruda de yt-dlp (y nuestros
    // eventos) — tope 250 líneas, autoscroll al final
    function logWrite(el, line, cls) {
        if (!el) return;
        var d = document.createElement('div');
        d.className = 'dg-log' + (cls ? ' ' + cls : '');
        d.textContent = String(line);
        el.appendChild(d);
        while (el.children.length > 250) el.removeChild(el.firstChild);
        el.scrollTop = el.scrollHeight;
    }

    // borrado real tras los 3 pasos: archivo nativo + TODOS los metas de
    // la biblioteca que apunten a esa ruta (un duplicado inerte también
    // se va). Las filas de error solo salen del historial.
    function delExec(id, c) {
        var e = window.TribalDlLog.find(id);
        if (e && e.path && c.plug && c.plug()) {
            c.plug().dlDelete({ path: e.path }).catch(function () {});
        }
        var idx = (window.MediaStore && MediaStore._index)
            ? MediaStore._index() : [];
        var hits = 0;
        idx.forEach(function (m) {
            if (e && ((e.metaId && m.id === e.metaId) ||
                      (e.path && m.path === e.path))) {
                hits++;
                MediaStore.remove(m.id).then(function () {
                    if (c.reload) c.reload();
                });
            }
        });
        if (!hits && c.reload) c.reload();
        window.TribalDlLog.remove(id);
        if (c.toast) c.toast('descarga eliminada');
        if (c.repaint) c.repaint();
    }

    // máquina de borrado en 3 pasos: 🗑 → «¿Eliminar?» → «Borrar archivo» →
    // cb(id). Si pasan 3 s sin el siguiente toque, el botón se resetea.
    function del3(btn, cb, repaint) {
        var step = +btn.getAttribute('data-step') || 0;
        clearTimeout(btn._tm);
        if (step < 2) {
            btn.setAttribute('data-step', step + 1);
            btn.innerHTML = step === 0 ? '¿Eliminar?' : 'Borrar archivo';
            btn._tm = setTimeout(function () { repaint(); }, 3000);
        } else {
            cb(btn.getAttribute('data-id'));
        }
    }

    function mimeOf(name) {
        var x = (name.split('.').pop() || '').toLowerCase();
        return { mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm',
                 mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4',
                 ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav'
               }[x] || 'application/octet-stream';
    }

    return { PAGE: PAGE, render: render, del3: del3, mimeOf: mimeOf,
             pageHtml: pageHtml, logWrite: logWrite, delExec: delExec };
})();
