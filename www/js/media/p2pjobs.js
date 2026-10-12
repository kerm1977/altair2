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
            return '<div class="tribal-p2p-frow">' +
                '<span class="tribal-p2p-fname">' + X.esc(f.name) + '</span>' +
                '<span class="tribal-p2p-fsize">' + X.hsize(f.length) + '</span>' +
                '<div class="tribal-p2p-bar sm"><i style="width:' + pct + '%"></i></div>' +
                '<span class="tribal-p2p-fpct">' + pct + '%</span>' +
                (X.isMediaName(f.name) ?
                    '<button class="tribal-btn tribal-btn-xs tr-play" data-fp="' +
                        X.esc(f.path) + '" data-id="' + j.id + '">' +
                        '<i class="bi bi-play-circle"></i></button>' : '') +
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

    // importa los archivos multimedia completados de un torrent a la tribu
    function importMedia(j, store, toast) {
        if (!store || !j.torrent) return;
        j.torrent.files.forEach(function (f) {
            if (!X.isMediaName(f.name)) return;
            f.getBlob(function (e, blob) {
                if (e || !blob) return;
                store.add(new File([blob], f.name, { type: blob.type }),
                          { source: 'p2p' }).then(function () {
                    if (toast) toast('«' + f.name + '» ya está en la tribu');
                }).catch(function () {});
            });
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
