// ============================================================================
// ARCHIVO: media/p2pextra.js
// RESPONSABILIDAD: utilidades del módulo P2P de TRIBALs.
//   - Formato de tamaños/velocidades, salud del enjambre
//   - Buscador (TribalP2P.search agrega todos los motores activos)
//   - Render de motores, trackers y archivos por torrent
//   - Lista de archivos propios para sembrar + subida desde el dispositivo
// ============================================================================
window.TribalP2PExtra = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function hsize(b) {
        b = b || 0;
        var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
        while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
        return (i ? b.toFixed(1) : Math.round(b)) + ' ' + u[i];
    }
    function hspd(b) { return hsize(b) + '/s'; }
    function health(st) {
        if (!st) return '<i class="bi bi-question-circle"></i> —';
        var p = st.peers || 0;
        if (p >= 8) return '<i class="bi bi-heart-fill tr-ok"></i> ' + p + ' sanísimo';
        if (p >= 3) return '<i class="bi bi-heart-half tr-mid"></i> ' + p + ' sano';
        if (p >= 1) return '<i class="bi bi-heart tr-low"></i> ' + p + ' débil';
        return '<i class="bi bi-heartbreak tr-bad"></i> sin peers';
    }
    function isMediaName(n) {
        var e = String(n || '').split('.').pop().toLowerCase();
        return ['mp3','wav','ogg','m4a','aac','flac','opus','mp4','webm','mkv','mov','avi',
                '3gp','jpg','jpeg','png','gif','webp','bmp','heic'].indexOf(e) >= 0;
    }

    // --- buscador ---
    function search(box, q, toast) {
        var sites = TribalP2P.engines().filter(function (e) {
            return e.on && e.kind === 'site';
        });
        box.innerHTML = '<div class="tribal-empty-mini"><i class="bi bi-hourglass-split"></i>' +
            '<p>Buscando…</p></div>';
        TribalP2P.search(q, function (err, rows) {
            var siteChips = sites.map(function (e) {
                return '<a class="tribal-btn tribal-btn-xs tr-site" target="_blank" ' +
                    'rel="noopener" href="' + esc(e.url.replace('%q',
                    encodeURIComponent(q))) + '"><i class="bi bi-box-arrow-up-right"></i> ' +
                    esc(e.name) + '</a>';
            }).join('');
            if (err && !sites.length) {
                var names = err.engines && err.engines.length
                    ? ' (' + err.engines.join(', ') + ')' : '';
                box.innerHTML = '<div class="tribal-empty-mini"><i class="bi bi-wifi-off"></i>' +
                    '<p>Sin conexión con los motores' + esc(names) + '.</p>' +
                    '<p class="ie-hint">En la web los motores sin CORS no responden ' +
                    '(en el APK sí, vía red nativa). Prueba los motores en ⚙ o agrega otros.</p></div>';
                return;
            }
            var hits = (rows || []).slice(0, 25).map(function (r) {
                return '<div class="tribal-p2p-hit" title="Doble clic = descargar">' +
                    '<span class="tribal-p2p-hit-n">' + esc(r.name) + '</span>' +
                    '<span class="tribal-p2p-hit-m">' + hsize(r.size) +
                        ' · <i class="bi bi-person-fill"></i>' + r.seeders +
                        ' · ' + esc(r.engine || '') + '</span>' +
                    '<button class="tribal-btn tribal-btn-xs' +
                        (r.seeders >= 5 ? ' tr-magnet-ok' : '') +
                        '" data-magnet="' + esc(r.magnet) +
                        '" title="Agregar a descargas' +
                        (r.seeders >= 5 ? ' · semillero sano' : '') + '">' +
                        '<i class="bi bi-magnet-fill"></i></button></div>';
            }).join('');
            box.innerHTML =
                (siteChips ? '<div class="tribal-p2p-sites">' + siteChips + '</div>' : '') +
                (hits || '<div class="tribal-empty-mini"><i class="bi bi-search"></i>' +
                    '<p>Sin resultados para «' + esc(q) + '»</p></div>');
        });
    }

    // -------------------------------------------------------- motores / trackers
    function renderEngines(box) {
        box.innerHTML = TribalP2P.engines().map(function (e, i) {
            // el motor fijo (predeterminado) no se quita ni se desactiva
            var del = e.fixed
                ? '<span class="tr-probe tr-ok" title="Motor predeterminado">' +
                    '<i class="bi bi-pin-angle-fill"></i></span>'
                : '<button class="tribal-ctrl tr-danger" data-eng-del="' + i + '"' +
                    ' title="Quitar motor"><i class="bi bi-trash3"></i></button>';
            return '<div class="tribal-p2p-track">' +
                '<label class="tr-eng"><input type="checkbox" data-eng-tgl="' + i + '"' +
                    (e.fixed ? ' checked disabled' : (e.on ? ' checked' : '')) + '> ' +
                    esc(e.name) +
                    (e.fixed ? ' <em>predeterminado</em>'
                             : ' <em>' + (e.kind === 'site' ? 'sitio'
                                          : (e.kind || 'api').toUpperCase()) +
                               '</em>') +
                    '</label>' +
                '<span class="tr-probe" data-eng="' + i + '"></span>' +
                del + '</div>';
        }).join('') || '<div class="tribal-empty-mini"><p>Sin motores</p></div>';
    }

    function renderTrackers(box) {
        box.innerHTML = TribalP2P.trackers().map(function (u, i) {
            return '<div class="tribal-p2p-track">' +
                '<span class="tr-url">' + esc(u) + '</span>' +
                '<span class="tr-probe" data-trk="' + i + '"></span>' +
                '<button class="tribal-ctrl tr-danger" data-trk-del="' + esc(u) + '"' +
                    ' title="Quitar tracker"><i class="bi bi-trash3"></i></button></div>';
        }).join('') || '<div class="tribal-empty-mini"><p>Sin trackers propios ' +
            '(se usan los de WebTorrent por defecto)</p></div>';
    }

    function probeInto(el, url) {
        el.className = 'tr-probe tr-probing';
        el.textContent = 'probando…';
        TribalP2P.probeTracker(url, function (ok, ms, why) {
            el.className = 'tr-probe ' + (ok ? 'tr-ok' : 'tr-bad');
            el.textContent = ok ? ('vivo · ' + ms + 'ms') : (why || 'caído');
        });
    }
    function probeEngineInto(el, e) {
        el.className = 'tr-probe tr-probing';
        el.textContent = 'probando…';
        TribalP2P.probeEngine(e, function (ok, ms, why) {
            el.className = 'tr-probe ' + (ok ? 'tr-ok' : 'tr-bad');
            el.textContent = ok ? ('vivo · ' + ms + 'ms') : (why || 'caído');
        });
    }

    // --------------------------------------------------- constructores UI --
    function acc(ico, title, body) {
        return '<details class="tribal-acc" name="tpacc"><summary><i class="bi ' +
            ico + '"></i> ' + title + '</summary>' + body + '</details>';
    }

    function panelHtml() {
        var slots = '';
        for (var i = 1; i <= TribalP2P.maxLimit; i++)
            slots += '<option' + (i === TribalP2P.maxLimit ? ' selected' : '') +
                     '>' + i + '</option>';
        return '<div class="tribal-p2p">' +
            '<div class="tribal-p2p-head"><i class="bi bi-diagram-3"></i>' +
                '<strong>P2P · Torrents</strong>' +
                '<button class="tribal-ctrl" id="tp-close"><i class="bi bi-x-lg"></i></button></div>' +
            '<div class="tribal-p2p-magnet">' +
                '<input id="tp-magnet" type="text" placeholder="Pega un magnet y baja al instante…">' +
                '<button class="tribal-btn tribal-btn-icon" id="tp-test" ' +
                    'title="Torrent de prueba · Sintel (dominio público)">' +
                    '<i class="bi bi-bug"></i></button>' +
                '<button class="tribal-btn tribal-btn-icon" id="tp-add" title="Descargar">' +
                    '<i class="bi bi-magnet"></i></button></div>' +
            acc('bi-search', 'Buscador',
                '<div class="tribal-p2p-search">' +
                    '<input id="tp-q" type="text" placeholder="Buscar en los motores…">' +
                    '<button class="tribal-btn tribal-btn-icon" id="tp-go" title="Buscar">' +
                        '<i class="bi bi-search"></i></button>' +
                '</div><div id="tp-results"></div>') +
            acc('bi-gear', 'Motores de búsqueda',
                '<div id="tp-engines"></div>' +
                '<div class="tribal-p2p-vform">' +
                    '<input id="tp-eng-name" type="text" placeholder="Nombre del motor">' +
                    '<input id="tp-eng-url" type="text" placeholder="URL con %q (ej: https://sitio/buscar?q=%q)">' +
                    '<select id="tp-eng-kind"><option value="api">API (JSON)</option>' +
                        '<option value="rss">RSS / feed</option>' +
                        '<option value="scrape">Scrape (magnet en página)</option>' +
                        '<option value="site">Sitio web</option></select>' +
                    '<textarea id="tp-eng-bulk" rows="4" ' +
                        'placeholder="o pega varios motores — uno por línea:&#10;MiMotor|https://sitio/api?q=%q&#10;o solo la URL con %q (nombre automático)"></textarea>' +
                    '<button class="tribal-btn" id="tp-eng-add"><i class="bi bi-plus-lg"></i> Agregar motores</button>' +
                    '<button class="tribal-btn" id="tp-eng-file">' +
                        '<i class="bi bi-filetype-txt"></i> Importar lista .txt</button>' +
                    '<input type="file" id="tp-eng-file-input" accept=".txt,text/plain" hidden>' +
                    '<button class="tribal-btn" id="tp-eng-test">' +
                        '<i class="bi bi-activity"></i> Probar todos</button></div>') +
            acc('bi-broadcast', 'Trackers',
                '<div id="tp-trackers"></div>' +
                '<div class="tribal-p2p-vform">' +
                    '<textarea id="tp-tracker-bulk" rows="5" ' +
                        'placeholder="Pega varios trackers aquí — uno por línea:&#10;wss://tracker.openwebtorrent.com&#10;wss://tracker.btorrent.xyz&#10;udp://tracker.opentrackr.org:1337"></textarea>' +
                    '<input id="tp-tracker" type="text" placeholder="o un solo tracker (wss/http/udp)">' +
                    '<button class="tribal-btn" id="tp-trk-add"><i class="bi bi-plus-lg"></i> Agregar trackers</button>' +
                    '<button class="tribal-btn" id="tp-trk-file">' +
                        '<i class="bi bi-filetype-txt"></i> Importar lista .txt</button>' +
                    '<input type="file" id="tp-trk-file-input" accept=".txt,text/plain" hidden>' +
                    '<button class="tribal-btn" id="tp-trk-test">' +
                        '<i class="bi bi-activity"></i> Probar todos</button></div>') +
            acc('bi-terminal', 'Consola',
                '<div class="tribal-p2p-consola" id="tp-console">' +
                    '<div class="tribal-empty-mini"><p>Sin eventos aún — ' +
                    'aquí aparece todo lo del motor</p></div></div>' +
                '<div class="tribal-p2p-consola-btns">' +
                    '<button class="tribal-btn tribal-btn-xs" id="tp-log-copy">' +
                        '<i class="bi bi-clipboard"></i> Copiar</button>' +
                    '<button class="tribal-btn tribal-btn-xs" id="tp-log-clear">' +
                        '<i class="bi bi-eraser"></i> Limpiar</button></div>') +
            acc('bi-upload', 'Sembrar',
                '<button class="tribal-btn tribal-btn-xs" id="tp-seedfile-btn">' +
                    '<i class="bi bi-folder-plus"></i> Subir archivo del dispositivo</button>' +
                '<input type="file" id="tp-seedfile" hidden>' +
                '<div id="tp-seedlist" class="tribal-p2p-seeds"></div>') +
            '<div class="tribal-p2p-slots"><label>Descargas simultáneas</label>' +
                '<select id="tp-max">' + slots + '</select>' +
                '<label>Red</label><select id="tp-net">' +
                    '<option value="any">Wi-Fi + datos</option>' +
                    '<option value="wifi">Solo Wi-Fi</option>' +
                    '<option value="data">Solo datos</option>' +
                '</select></div>' +
            '<div id="tp-jobs"></div></div>';
    }
    return { esc: esc, hsize: hsize, hspd: hspd, health: health,
             isMediaName: isMediaName, search: search,
             renderEngines: renderEngines, renderTrackers: renderTrackers,
             probeInto: probeInto, probeEngineInto: probeEngineInto,
             acc: acc, panelHtml: panelHtml };
})();
