// ============================================================================
// ARCHIVO: media/p2pjobs.js
// RESPONSABILIDAD: constructores de tarjetas de torrent del módulo P2P.
//   - fileRows: progreso por archivo dentro de un torrent
//   - jobHtml: tarjeta completa de un torrent (barra, velocidades, salud,
//     acordeón exclusivo de archivos, botones de control)
//   - importMedia: importa archivos completados a la tribu
//   - fillSeed: lista de archivos propios para sembrar
//   Depende de TribalP2PExtra (formato) y TribalP2P (stats).
// ============================================================================
window.TribalP2PJobs = (function () {
    'use strict';
    var X = window.TribalP2PExtra;

    function fileRows(j) {
        var fs = TribalP2P.fileStats(j);
        if (!fs.length) return '<p class="tribal-p2p-err">Esperando metadata…</p>';
        return fs.map(function (f) {
            var pct = Math.round((f.progress || 0) * 100);
            var pr = f.prio == null ? 4 : f.prio;
            var ptxt = pr === 0 ? 'OFF' : pr >= 7 ? 'ALTA'
                     : pr <= 2 ? 'BAJA' : 'MEDIA';
            return '<div class="tribal-p2p-frow' + (pr === 0 ? ' tp-foff' : '') + '">' +
                '<span class="tribal-p2p-fname">' + X.esc(f.name) + '</span>' +
                '<span class="tribal-p2p-fctl">' +
                    '<button class="tribal-ctrl tp-fprio' +
                        (pr === 0 ? ' tp-off' : pr >= 7 ? ' tp-hi'
                            : pr <= 2 ? ' tp-lo' : '') +
                        '" data-tp="fprio" data-id="' + j.id + '" data-fi="' +
                        f.i + '" data-cur="' + pr +
                        '" title="Prioridad · clic para cambiar">' + ptxt +
                        '</button>' +
                    '<button class="tribal-ctrl" data-tp="fpause" data-id="' +
                        j.id + '" data-fi="' + f.i + '" data-cur="' + pr +
                        '" title="' + (pr === 0 ? 'Reanudar archivo'
                                                : 'Pausar archivo') + '">' +
                        '<i class="bi bi-' + (pr === 0 ? 'play' : 'pause') +
                        '-fill"></i></button>' +
                    (X.isMediaName(f.name) ?
                        '<button class="tribal-btn tribal-btn-xs tr-play" data-fp="' +
                            X.esc(f.path) + '" data-id="' + j.id + '">' +
                            '<i class="bi bi-play-circle"></i></button>' : '') +
                '</span>' +
                '<span class="tribal-p2p-fsize">' + X.hsize(f.length) + '</span>' +
                '<span class="tribal-p2p-fpct">' + pct + '%</span>' +
                '<div class="tribal-p2p-bar sm"><i style="width:' + pct + '%"></i></div>' +
            '</div>';
        }).join('');
    }

    function jobHtml(j, stLabel) {
        var st = TribalP2P.stats(j) || {};
        var pct = Math.round((st.progress || 0) * 100);
        var paused = j.status === 'paused';
        var nFiles = j.torrent && j.torrent.files ? j.torrent.files.length : 0;
        var btns =
            (j.status === 'done' || j.status === 'seed' ? '' :
             '<button class="tribal-ctrl" data-tp="pause" data-id="' + j.id +
                '" title="' + (paused ? 'Reanudar' : 'Pausar') + '">' +
                '<i class="bi bi-' + (paused ? 'play' : 'pause') + '-fill"></i></button>') +
            '<button class="tribal-ctrl" data-tp="recon" data-id="' +
                j.id + '" title="Reconectar">' +
                '<i class="bi bi-arrow-repeat"></i></button>' +
            '<button class="tribal-ctrl" data-tp="force" data-id="' +
                j.id + '" title="Forzar comunicaciones">' +
                '<i class="bi bi-broadcast"></i></button>' +
            '<button class="tribal-ctrl" data-tp="magnet" data-id="' + j.id +
                '" title="Copiar magnet"><i class="bi bi-magnet"></i></button>' +
            '<button class="tribal-ctrl tr-danger" data-tp="del" data-id="' + j.id +
                '" title="Eliminar torrent"><i class="bi bi-trash3"></i></button>';
        var filesAcc = nFiles ?
            '<details class="tribal-acc sm tp-files" name="tpfiles" data-for="' + j.id + '">' +
            '<summary><i class="bi bi-folder2-open"></i> ' + nFiles +
                ' archivo' + (nFiles > 1 ? 's' : '') + '</summary>' +
            '<div class="tribal-p2p-flist">' + fileRows(j) + '</div></details>' : '';
        // magnet visible: ver el URI completo + copiar / compartir a otro cliente
        var magAcc = j.magnet ?
            '<details class="tp-magnet" data-for="' + j.id + '"><summary>' +
                '<i class="bi bi-link-45deg"></i> Magnet</summary>' +
                '<textarea class="tp-magtext" readonly rows="3">' +
                    X.esc(j.magnet) + '</textarea>' +
                '<div class="tribal-p2p-btns">' +
                '<button class="tribal-btn tribal-btn-xs" data-tp="magnet" data-id="' +
                    j.id + '"><i class="bi bi-clipboard"></i> Copiar</button>' +
                '<button class="tribal-btn tribal-btn-xs" data-tp="share" data-id="' +
                    j.id + '"><i class="bi bi-share"></i> Compartir</button>' +
                '</div></details>' : '';
        return '<div class="tribal-p2p-job' + (j.status === 'done' ? ' done' : '') + '">' +
            '<div class="tribal-p2p-row">' +
                '<span class="tribal-p2p-name">' +
                    X.esc(j.name || 'Obteniendo nombre…') + '</span>' +
                '<span class="tribal-p2p-st st-' + j.status + '">' +
                    stLabel(j.status) + '</span></div>' +
            '<div class="tribal-p2p-bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="tribal-p2p-meta">' +
                '<span>' + pct + '% · ' + X.hsize(st.downloaded) + '</span>' +
                '<span><i class="bi bi-arrow-down"></i>' + X.hspd(st.down) +
                    ' · <i class="bi bi-arrow-up"></i>' + X.hspd(st.up) + '</span>' +
                '<span>' + X.health(st) + '</span></div>' +
            (j.error ? '<div class="tribal-p2p-err">' + X.esc(j.error) + '</div>' : '') +
            filesAcc + magAcc +
            '<div class="tribal-p2p-btns">' + btns + '</div></div>';
    }

    // importa TODOS los archivos completados del torrent a la tribu
    // (música, videos, docs, lo que sea) marcados info.p2p → la biblioteca
    // los muestra bajo «Descargados por torrents» / «<tipo> por torrents»
    function importMedia(j, store, toast) {
        if (!store || !j.torrent) return Promise.resolve(0);
        var jobs = (j.torrent.files || []).map(function (f) {
            return new Promise(function (res) {
                f.getBlob(function (e, blob) {
                    if (e || !blob) return res(0);
                    store.add(new File([blob], f.name,
                              { type: blob.type || '' })).then(function (m) {
                        if (m && store.updateInfo)
                            return store.updateInfo(m.id, { p2p: 1 })
                                .then(function () { res(1); },
                                      function () { res(1); });
                        res(1);
                    }).catch(function () { res(0); });
                });
            });
        });
        return Promise.all(jobs).then(function (r) {
            var n = 0; r.forEach(function (x) { n += x; });
            if (toast && n)
                toast(n + ' archivo(s) del torrent ya en la tribu');
            return n;
        });
    }

    function fillSeed(box, items) {
        items = (items || []).slice(0, 30);   // TODO tipo es sembrable
        box.innerHTML = items.length ? items.map(function (m) {
            return '<div class="tribal-p2p-hit"><span class="tribal-p2p-hit-n">' +
                X.esc(m.name) + '</span><button class="tribal-btn tribal-btn-xs" ' +
                'data-seed="' + m.id + '"><i class="bi bi-upload"></i> Sembrar</button></div>';
        }).join('') : '<div class="tribal-empty-mini"><p>Sin archivos para sembrar</p></div>';
    }

    return { fileRows: fileRows, jobHtml: jobHtml,
             import: importMedia, fillSeed: fillSeed };
})();
