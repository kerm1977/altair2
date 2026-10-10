// ============================================================================
// ARCHIVO: media/p2p.js
// RESPONSABILIDAD: motor P2P de TRIBALs sobre WebTorrent (vendor/webtorrent.min.js)
//   - Cola de descargas persistente (localStorage tribu_p2p)
//   - Máx. simultáneas configurable 1–4 · pausa/reanudar/detener/forzar
//   - Sembrar archivos propios (tribu o dispositivo) · importa al MediaStore
//   - Motores/trackers/buscador/stats en p2pcfg.js — peers WebRTC solamente
// ============================================================================
window.TribalP2P = (function () {
    'use strict';

    var LS_KEY = 'tribu_p2p';
    var client = null;
    var jobs = [];            // {id, magnet, name, torrent, status, addedAt, files[]}
    var maxSlots = 4;
    var netPolicy = 'any';    // 'any' | 'wifi' | 'data'
    var listeners = { change: [], done: [] };
    var store = null, toast = null;
    var MAX_LIMIT = 4;

    // motores de búsqueda independientes: kind 'api' (JSON; el formato de
    // respuesta se autodetecta) o 'site' (la URL abre con %q sustituido)
    var DEFAULT_ENGINES = [
        { name: 'Apibay', url: 'https://apibay.org/q.php?q=%q',
          kind: 'api', on: true },
        { name: 'SolidTorrents', url: 'https://solidtorrents.to/api/v1/search?q=%q',
          kind: 'api', on: true, fixed: true },
        { name: 'TorrentsCSV', url: 'https://torrents-csv.com/service/search?q=%q',
          kind: 'api', on: true }
    ];
    var engines = DEFAULT_ENGINES.slice();
    var extraTrackers = [];

    // trackers WebRTC por defecto: WebTorrent solo habla wss:// en el
    // navegador/WebView. Sin ellos el cliente no anuncia a nadie → 0 peers.
    var DEFAULT_TRACKERS = [
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.webtorrent.dev',
        'wss://tracker.btorrent.xyz',
        'wss://tracker.fastcast.nz'
    ];
    function announceList() {
        return DEFAULT_TRACKERS.concat(extraTrackers);
    }
    // el magnet que guardamos debe llevar sus tr= (los de los buscadores
    // vienen pelados: solo xt + dn)
    function withTrackers(m) {
        if (!/^magnet:/.test(m)) m = 'magnet:?xt=urn:btih:' + m;
        if (/[?&]tr=/.test(m)) return m;
        var sep = m.indexOf('?') >= 0 ? '&' : '?';
        return m + sep + announceList().map(function (u) {
            return 'tr=' + encodeURIComponent(u);
        }).join('&');
    }

    function emit(k, a) {
        (listeners[k] || []).forEach(function (f) { try { f(a); } catch (e) {} });
    }
    function save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                max: maxSlots,
                net: netPolicy,
                engines: engines,
                trackers: extraTrackers,
                jobs: jobs.map(function (j) {
                    return { id: j.id, magnet: j.magnet, name: j.name,
                             status: j.status === 'seed' ? 'seed' :
                                     (j.status === 'paused' ? 'paused' : 'queued'),
                             addedAt: j.addedAt };
                })
            }));
        } catch (e) {}
    }
    function load() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
        catch (e) { return {}; }
    }

    function ensureClient() {
        if (client) return client;
        if (!window.WebTorrent) return null;
        client = new WebTorrent({ maxConns: 40 });
        return client;
    }

    function activeCount() {
        return jobs.filter(function (j) {
            return j.status === 'downloading' || j.status === 'metadata';
        }).length;
    }

    // ---- política de red: descargar en Wi-Fi / datos / ambos ----------------
    // navigator.connection.type: 'wifi'|'cellular'|… (Android WebView lo da)
    function netKind() {
        var c = navigator.connection || navigator.webkitConnection ||
                navigator.mozConnection;
        if (!c) return 'unknown';
        var t = c.type || '';
        if (t === 'wifi' || t === 'ethernet') return 'wifi';
        if (t === 'cellular' || t === 'bluetooth' || t === 'wimax') return 'data';
        return 'unknown';
    }
    function netAllowed() {
        if (netPolicy === 'any') return true;
        var k = netKind();
        if (k === 'unknown') return true;   // sin API fiable → no bloquear
        return k === netPolicy;
    }
    var _conn = navigator.connection || navigator.webkitConnection ||
                navigator.mozConnection;
    if (_conn && _conn.addEventListener)
        _conn.addEventListener('change', pump);

    function pump() {
        var allowed = netAllowed();
        jobs.forEach(function (j) {
            // la red dejó de ser la permitida → congelar descargas activas
            if (!allowed &&
                (j.status === 'downloading' || j.status === 'metadata')) {
                pauseFiles(j);
                j.status = 'netwait';
            }
            // volvió la red permitida → reencolar
            if (allowed && j.status === 'netwait') j.status = 'queued';
        });
        var next = jobs.find(function (j) { return j.status === 'queued'; });
        while (allowed && next && activeCount() < maxSlots) {
            next.status = 'downloading';
            resumeFiles(next);
            next = jobs.find(function (j) { return j.status === 'queued'; });
        }
        emit('change');
    }

    function resumeFiles(j) {
        if (j.torrent) j.torrent.files.forEach(function (f) { f.select(); });
    }
    function pauseFiles(j) {
        if (j.torrent) j.torrent.files.forEach(function (f) { f.deselect(); });
    }

    function wireTorrent(j, t) {
        j.torrent = t;
        j.name = j.name || t.name || 'Sin nombre';
        j.infoHash = t.infoHash;
        j.magnet = j.magnet || t.magnetURI;
        j.status = j.status === 'seed' ? 'seed' :
                   (j.status === 'paused' ? 'paused' : 'metadata');
        t.on('metadata', function () {
            j.name = t.name || j.name;
            j.files = t.files.map(function (f) {
                return { name: f.name, length: f.length, path: f.path };
            });
            if (j.status === 'metadata') j.status = 'downloading';
            if (j.status === 'paused') pauseFiles(j);
            save(); emit('change');
        });
        t.on('download', function () { emit('change'); });
        t.on('upload', function () { emit('change'); });
        t.on('wire', function () { emit('change'); });
        t.on('done', function () {
            j.status = 'done';
            save(); emit('change');
            if (window.TribalP2PJobs) TribalP2PJobs.import(j, store, toast);
            emit('done', j);
            pump();
        });
        t.on('error', function (e) {
            j.error = String(e && e.message || e);
            j.status = 'error';
            save(); emit('change');
        });
        save(); emit('change');
    }

    function add(magnet) {
        magnet = String(magnet || '').trim();
        if (!magnet) return null;
        if (!/^magnet:|^[a-fA-F0-9]{40}$|^[-_a-zA-Z0-9]{32}$/.test(magnet)) {
            if (toast) toast('Magnet no válido');
            return null;
        }
        magnet = withTrackers(magnet);
        if (jobs.some(function (j) {
            return j.magnet === magnet || (j.infoHash && magnet.indexOf(j.infoHash) >= 0);
        })) { if (toast) toast('Ese torrent ya está en la lista'); return null; }
        var j = { id: 'p2p-' + Date.now().toString(36) +
                        Math.random().toString(36).slice(2, 6),
                  magnet: magnet, name: null, torrent: null,
                  status: 'queued', addedAt: Date.now(), files: [] };
        jobs.push(j);
        var c = ensureClient();
        if (!c) { j.status = 'error'; j.error = 'WebTorrent no disponible'; }
        else {
            try {
                var t = c.add(magnet, { announce: announceList() });
                wireTorrent(j, t);
            } catch (e) { j.status = 'error'; j.error = String(e); }
        }
        pump(); save(); emit('change');
        return j;
    }

    function seed(meta, blobOrFile) {
        var c = ensureClient();
        if (!c) return null;
        var file = blobOrFile instanceof File ? blobOrFile :
            new File([blobOrFile], meta.name,
                     { type: meta.mime || blobOrFile.type || 'application/octet-stream' });
        var t;
        try { t = c.seed(file, { announce: announceList(), name: meta.name }); }
        catch (e) { if (toast) toast('No se pudo sembrar'); return null; }
        var j = { id: 'p2p-' + Date.now().toString(36) +
                        Math.random().toString(36).slice(2, 6),
                  magnet: t.magnetURI, name: meta.name, torrent: t,
                  status: 'seed', addedAt: Date.now(), files: [] };
        jobs.push(j);
        t.on('wire', function () { emit('change'); });
        t.on('upload', function () { emit('change'); });
        save(); emit('change');
        return j;
    }

    function trackers() {
        return extraTrackers.slice();
    }
    function addTracker(u) {
        u = String(u || '').trim();
        if (!u || extraTrackers.indexOf(u) >= 0) return;
        extraTrackers.push(u);
        save();
    }

    function find(id) {
        return jobs.find(function (j) { return j.id === id || j.infoHash === id; });
    }

    return {
        on: function (k, f) { (listeners[k] = listeners[k] || []).push(f); },
        bind: function (s, t) { store = s; toast = t; },

        add: add, seed: seed,
        jobs: function () { return jobs; },
        client: ensureClient,

        setMax: function (n) {
            maxSlots = Math.max(1, Math.min(MAX_LIMIT, n | 0 || 1));
            save(); pump();
        },
        getMax: function () { return maxSlots; },
        maxLimit: MAX_LIMIT,

        setNet: function (p) {
            netPolicy = (p === 'wifi' || p === 'data') ? p : 'any';
            save(); pump();
        },
        getNet: function () { return netPolicy; },
        netAllowed: netAllowed,
        netKind: netKind,

        pause: function (id) {
            var j = find(id); if (!j) return;
            pauseFiles(j); j.status = 'paused'; save(); emit('change'); pump();
        },
        resume: function (id) {
            var j = find(id); if (!j) return;
            j.status = 'queued'; save(); pump();
        },
        remove: function (id) {
            var i = jobs.findIndex(function (j) { return j.id === id || j.infoHash === id; });
            if (i < 0) return;
            var j = jobs[i];
            if (j.torrent) try { j.torrent.destroy(); } catch (e) {}
            jobs.splice(i, 1);
            save(); emit('change'); pump();
        },
        reconnect: function (id) {
            var j = find(id); if (!j || !j.magnet) return;
            var st = j.status;
            if (j.torrent) try { j.torrent.destroy(); } catch (e) {}
            j.torrent = null; j.status = st === 'paused' ? 'paused' : 'queued';
            var c = ensureClient();
            if (c) wireTorrent(j, c.add(j.magnet, { announce: announceList() }));
            pump();
        },

        // fuerza comunicación SIN destruir el torrent: re-anuncia en todos
        // los trackers y pide peers otra vez. Si no hay canal vivo → reconectar.
        forceComm: function (id) {
            var j = find(id); if (!j) return false;
            var t = j.torrent, nudged = false;
            if (t) {
                // canal de trackers del torrent (bittorrent-tracker Client)
                var tr = t.tracker ||
                         (t._discovery && t._discovery.tracker) ||
                         (t.discovery && t.discovery.tracker);
                if (tr && tr.announce) {
                    try { tr.announce(); nudged = true; } catch (e) {}
                }
                if (tr && tr.scrape) {
                    try { tr.scrape(); } catch (e) {}
                }
                // despertar los wires dormidos: re-interesar pide handshakes
                try {
                    if (t._amInterested !== undefined && t.files && t.files.length)
                        t.files.forEach(function (f) {
                            if (!f.done) f.select();
                        });
                } catch (e) {}
            }
            if (!nudged && j.magnet) {
                // no había canal de trackers → reconexión dura
                var st = j.status;
                if (t) try { t.destroy(); } catch (e) {}
                j.torrent = null;
                j.status = st === 'paused' ? 'paused' : 'queued';
                var c = ensureClient();
                if (c) wireTorrent(j, c.add(j.magnet, { announce: announceList() }));
            }
            emit('change'); pump();
            return nudged;
        },

        trackers: trackers,
        addTracker: addTracker,

        // acceso interno para p2pcfg.js (motores/trackers/buscador)
        _: {
            getEngines: function () { return engines; },
            getTrackers: function () { return extraTrackers; },
            save: save, emit: emit,
            ensureClient: ensureClient, find: find,
            jobs: function () { return jobs; }
        },

        restore: function () {
            var d = load();
            if (d.max) maxSlots = Math.max(1, Math.min(MAX_LIMIT, d.max));
            if (d.net === 'wifi' || d.net === 'data') netPolicy = d.net;
            if (d.engines && d.engines.length) engines = d.engines;
            // migración: inyectar motores nuevos por defecto que falten
            DEFAULT_ENGINES.forEach(function (e) {
                var cur = engines.filter(function (x) { return x.url === e.url; })[0];
                if (!cur) engines.push(e);
                else if (e.fixed) { cur.fixed = true; cur.on = true; }
            });
            if (d.trackers) extraTrackers = d.trackers;
            (d.jobs || []).forEach(function (r) {
                if (jobs.some(function (j) { return j.id === r.id; })) return;
                var j = { id: r.id, magnet: r.magnet, name: r.name,
                          torrent: null, status: r.status || 'queued',
                          addedAt: r.addedAt || Date.now(), files: [] };
                jobs.push(j);
                var c = ensureClient();
                if (c && j.magnet) {
                    try { wireTorrent(j, c.add(j.magnet, { announce: announceList() })); }
                    catch (e) { j.status = 'error'; j.error = String(e); }
                }
            });
            pump();
        },

        // stats()/fileStats() viven en p2pcfg.js (solo leen el torrent)
    };
})();
