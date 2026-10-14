// ============================================================================
// ARCHIVO: media/p2pnative.js
// RESPONSABILIDAD: puente JS ↔ motor torrent NATIVO (TribalTorrentPlugin =
//   libtorrent real: TCP/UDP/DHT/PEX, el swarm completo).
//   - ok: true solo dentro de la APK (el plugin Java existe)
//   - poll(): consulta stats cada 1.2 s y avisa a los suscriptores
//   - torrentProxy/fileProxy: imitan los objetos de WebTorrent para que
//     p2pjobs.js (barras, botón play) y player.js (renderTo/getBlobURL)
//     trabajen idéntico sin saber que el motor es nativo
//   API: ok, add, pause, resume, remove, reannounce, onPoll, torrentProxy,
//        sync, has
// ============================================================================
window.TribalP2PNative = (function () {
    'use strict';
    var TT = window.Capacitor && Capacitor.Plugins &&
             Capacitor.Plugins.TribalTorrent;
    var ok = !!(TT && Capacitor.isNativePlatform &&
                Capacitor.isNativePlatform());
    var cache = {};        // id → últimas stats del list() nativo
    var subs = [];

    var dhtNodes = 0, dhtOn = false;
    function poll() {
        if (!ok) return;
        TT.list().then(function (r) {
            (r.torrents || []).forEach(function (t) { cache[t.id] = t; });
            dhtNodes = r.dht || 0;
            dhtOn = !!r.dhtOn;
            subs.forEach(function (f) { try { f(); } catch (e) {} });
        }).catch(function () {});
    }
    if (ok) setInterval(poll, 1200);

    function fileUrl(abs) {
        return window.Capacitor.convertFileSrc('file://' + abs);
    }

    // imita un WebTorrent File: player.js usa renderTo()/getBlobURL();
    // p2pjobs.import usa getBlob()
    function fileProxy(nid, f) {
        var p = {
            name: f.name, path: f.path, length: f.size, i: f.i,
            progress: f.progress, downloaded: f.downloaded,
            done: f.progress >= 1,
            prio: f.prio == null ? 4 : f.prio,
            select: function () {}, deselect: function () {},
            getBlobURL: function (cb) {
                TT.fileUri({ id: nid, index: f.i }).then(function (r) {
                    cb(null, fileUrl(r.path));
                }).catch(function (e) { cb(e || new Error('sin archivo')); });
            },
            getBlob: function (cb) {
                p.getBlobURL(function (e, u) {
                    if (e || !u) return cb(e || new Error('sin url'));
                    fetch(u).then(function (r) { return r.blob(); })
                        .then(function (b) { cb(null, b); })
                        .catch(cb);
                });
            },
            renderTo: function (el, o) {
                p.getBlobURL(function (e, u) {
                    if (e || !u) return;
                    el.src = u;
                    if (!o || o.autoplay !== false)
                        el.play().catch(function () {});
                });
            }
        };
        return p;
    }

    // imita el objeto torrent de WebTorrent: stats() lee sus campos;
    // destroy() lo saca del motor nativo
    function torrentProxy(j) {
        return {
            name: null, infoHash: j.nid, progress: 0,
            downloadSpeed: 0, uploadSpeed: 0, numPeers: 0,
            downloaded: 0, uploaded: 0, done: false, destroyed: false,
            files: [],
            destroy: function () {
                this.destroyed = true;
                TT.remove({ id: j.nid }).catch(function () {});
            }
        };
    }

    // copia las stats nativas al proxy del job. Devuelve true SOLO en el
    // momento en que el torrent pasa a completo (para importar una vez)
    function sync(j) {
        var s = j.nid && cache[j.nid];
        if (!s || !j.torrent) return false;
        var t = j.torrent;
        if (s.name) { t.name = s.name; j.name = s.name; }
        t.progress = s.progress || 0;
        t.downloadSpeed = s.down || 0;
        t.uploadSpeed = s.up || 0;
        t.numPeers = s.peers || 0;
        t.downloaded = s.downloaded || 0;
        t.uploaded = s.uploaded || 0;
        if (s.files && s.files.length)
            t.files = s.files.map(function (f) { return fileProxy(j.nid, f); });
        var was = t.done;
        t.done = !!s.done;
        return !was && t.done;
    }

    return {
        ok: ok,
        add: function (magnet, trackers) {
            return TT.add({ magnet: magnet, trackers: trackers || [] });
        },
        dht: function () { return { on: dhtOn, nodes: dhtNodes }; },
        pause: function (id) { return TT.pause({ id: id }); },
        resume: function (id) { return TT.resume({ id: id }); },
        remove: function (id) { return TT.remove({ id: id }); },
        reannounce: function (id) { return TT.reannounce({ id: id }); },
        setFilePriority: function (id, i, prio) {
            return TT.setFilePriority({ id: id, index: i, prio: prio });
        },
        seedFile: function (path, trackers) {
            return TT.seedFile({ path: path, trackers: trackers || [] });
        },
        onPoll: function (f) { subs.push(f); },
        torrentProxy: torrentProxy,
        sync: sync,
        has: function (id) { return !!cache[id]; }
    };
})();
