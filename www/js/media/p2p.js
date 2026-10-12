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
        'wss://tracker.files.fm:7073/announce',
        'wss://tracker.magnetoo.io',
        'wss://tracker.webtorrent.dev',
        'wss://tracker.btorrent.xyz'
    ];

    // ---- trackers vivos autoactualizables ----------------------------------
    // ngosang/trackerslist publica la lista de trackers WS vivos (se
    // actualiza cada hora). Se cachea 12 h en localStorage; si el fetch
    // falla quedan DEFAULT_TRACKERS + los extras del usuario de reserva.
    var TRACKERS_URL = 'https://raw.githubusercontent.com/ngosang/' +
        'trackerslist/master/trackers_all_ws.txt';
    var TRK_LS = 'tribu_p2p_trk';
    var liveTrackers = [];
    try {
        var _tc = JSON.parse(localStorage.getItem(TRK_LS) || '{}');
        if (_tc.list && _tc.list.length) liveTrackers = _tc.list;
    } catch (e) {}
    function refreshTrackers(force) {
        var c = {};
        try { c = JSON.parse(localStorage.getItem(TRK_LS) || '{}'); } catch (e) {}
        if (!force && c.ts && Date.now() - c.ts < 43200000) return;   // 12 h
        if (!window.fetch) return;
        fetch(TRACKERS_URL).then(function (r) {
            if (!r.ok) throw 0;
            return r.text();
        }).then(function (t) {
            var list = t.split(/\s+/).filter(function (u) {
                return /^wss?:\/\//.test(u);
            }).slice(0, 24);
            if (!list.length) return;
            liveTrackers = list;
            try {
                localStorage.setItem(TRK_LS,
                    JSON.stringify({ ts: Date.now(), list: list }));
            } catch (e) {}
            // los torrents vivos anuncian en los trackers nuevos ya mismo
            jobs.forEach(function (j) { reannounce(j.torrent); });
        }).catch(function () {});
    }

    // WebTorrent en navegador/WebView solo habla trackers wss://: los
    // udp:// y http:// que siembran los buscadores nunca conectan.
    function announceList() {
        var seen = {};
        return DEFAULT_TRACKERS.concat(liveTrackers, extraTrackers)
            .filter(function (u) {
                if (!/^wss?:\/\//.test(u) || seen[u]) return false;
                seen[u] = 1;
                return true;
            });
    }

    // pide peers al canal de trackers de un torrent vivo (re-anuncio)
    function reannounce(t) {
        if (!t || t.destroyed) return;
        var tr = t.tracker ||
                 (t._discovery && t._discovery.tracker) ||
                 (t.discovery && t.discovery.tracker);
        try { if (tr && tr.announce) tr.announce(); } catch (e) {}
    }

    // servidores STUN: sin buen NAT traversal WebRTC no conecta con nadie
    var ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];
    // el magnet SIEMPRE debe llevar los tr= wss, aunque ya traiga otros
    // (http/udp): si no, anuncia en trackers muertos → 0 peers →
    // se queda eternamente en 'Obteniendo datos…'
    function withTrackers(m) {
        if (!/^magnet:/.test(m)) m = 'magnet:?xt=urn:btih:' + m;
        var add = announceList().filter(function (u) {
            return m.indexOf('tr=' + encodeURIComponent(u)) < 0;
        });
        if (!add.length) return m;
        var sep = m.indexOf('?') >= 0 ? '&' : '?';
        return m + sep + add.map(function (u) {
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
        try {
            client = new WebTorrent({ maxConns: 55,
                tracker: { rtcConfig: { iceServers: ICE_SERVERS } } });
            refreshTrackers();                        // trae trackers vivos
        } catch (e) { client = null; return null; }
        return client;
    }

    // re-añade el magnet al cliente si el job quedó sin torrent vivo —
    // autocuración: un job 'downloading' sin torrent nunca descarga
    function revive(j) {
        if (j.torrent || !j.magnet) return;
        var c = ensureClient();
        if (!c) return;
        try {
            wireTorrent(j, c.add(withTrackers(j.magnet),
                { announce: announceList() }));
        } catch (e) { j.status = 'error'; j.error = String(e); }
    }

    // un 'metadata' estancado (sin peers) no debe ocupar un slot para
    // siempre: pasado el margen deja de contar y otros jobs arrancan
    var META_STALL = 60000;
    function activeCount() {
        var now = Date.now();
        return jobs.filter(function (j) {
            if (j.status === 'downloading') return true;
            if (j.status === 'metadata')
                return now - (j.metaSince || j.addedAt) < META_STALL;
            return false;
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
        // curar jobs sin torrent vivo (restore fallido, add rechazado…):
        // sin esto quedaban 'downloading' eternamente sin hacer nada
        jobs.forEach(function (j) {
            if (!j.torrent && allowed &&
                (j.status === 'queued' || j.status === 'downloading' ||
                 j.status === 'metadata')) revive(j);
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
        if (j.status !== 'seed' && j.status !== 'paused') {
            j.status = 'metadata';
            j.metaSince = Date.now();
        }
        // 'ready' llega tras metadata; si client.add devolvió un torrent
        // ya conocido, 'metadata' ya disparó y no volverá → onMeta ahora
        function onMeta() {
            j.name = t.name || j.name;
            j.files = t.files.map(function (f) {
                return { name: f.name, length: f.length, path: f.path };
            });
            if (j.status === 'metadata') j.status = 'downloading';
            if (j.status === 'paused') pauseFiles(j);
            save(); emit('change');
        }
        t.on('metadata', onMeta);
        t.on('ready', onMeta);
        if (t.ready || (t.files && t.files.length)) onMeta();
        t.on('download', function () { emit('change'); });
        t.on('upload', function () { emit('change'); });
        t.on('wire', function () { emit('change'); });
        t.on('done', function () {
            j.status = 'done';
            save(); emit('change');
            if (toast) toast('«' + (j.name || 'Torrent') + '» descargado');
            if (window.TribalP2PJobs) TribalP2PJobs.import(j, store, toast);
            emit('done', j);
            pump();
        });
        t.on('error', function (e) {
            j.error = String(e && e.message || e);
            j.status = 'error';
            save(); emit('change');
        });
        // si la metadata no llega en un margen razonable el torrent
        // sigue intentando, pero avisamos para poder re-anunciar
        setTimeout(function () {
            if (j.status === 'metadata' && toast)
                toast('«' + (j.name || 'Torrent') +
                      '» sigue sin peers — re-anunciando solo');
        }, 45000);
        // re-anuncio agresivo: los trackers contestan intervalos de ~15
        // min — eterno para un swarm web chico. Mientras no haya peers
        // el motor re-anuncia solo cada 30 s; se apaga al terminar.
        clearInterval(j._ann);
        j._ann = setInterval(function () {
            if (!j.torrent || j.torrent.destroyed || j.torrent.done ||
                j.status === 'error') { clearInterval(j._ann); return; }
            if (j.torrent.numPeers > 0 || j.status === 'paused' ||
                j.status === 'netwait') return;
            reannounce(j.torrent);
        }, 30000);
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
        if (!c) {
            j.status = 'error'; j.error = 'WebTorrent no disponible';
            if (toast) toast('WebTorrent no está disponible');
        } else {
            try {
                var t = c.add(magnet, { announce: announceList() });
                wireTorrent(j, t);
                if (toast) toast('Torrent añadido — obteniendo datos…');
            } catch (e) {
                j.status = 'error'; j.error = String(e);
                if (toast) toast('No se pudo añadir el torrent');
            }
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
        // solo wss:// sirve: udp/http jamás anuncian desde una WebView
        if (!/^wss?:\/\//.test(u) || extraTrackers.indexOf(u) >= 0) return;
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
            clearInterval(j._ann);
            if (j.torrent) try { j.torrent.destroy(); } catch (e) {}
            jobs.splice(i, 1);
            if (toast) toast('«' + (j.name || 'Torrent') + '» eliminado');
            save(); emit('change'); pump();
        },
        reconnect: function (id) {
            var j = find(id); if (!j || !j.magnet) return;
            var st = j.status;
            if (j.torrent) try { j.torrent.destroy(); } catch (e) {}
            j.torrent = null; j.status = st === 'paused' ? 'paused' : 'queued';
            var c = ensureClient();
            refreshTrackers(true);                    // trackers frescos ya
            if (c) wireTorrent(j, c.add(withTrackers(j.magnet),
                { announce: announceList() }));
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
            // siembra única con la config de qBittorrent (p2pqbit.js):
            // ~78 motores 'site' + APIs YTS/Snowfl + todos sus trackers
            if (window.TribalP2PQBIT) window.TribalP2PQBIT.seed();
            refreshTrackers();
            (d.jobs || []).forEach(function (r) {
                if (jobs.some(function (j) { return j.id === r.id; })) return;
                var j = { id: r.id, magnet: r.magnet, name: r.name,
                          torrent: null, status: r.status || 'queued',
                          addedAt: r.addedAt || Date.now(), files: [] };
                jobs.push(j);
                var c = ensureClient();
                if (c && j.magnet) {
                    try {
                        wireTorrent(j, c.add(withTrackers(j.magnet),
                            { announce: announceList() }));
                    } catch (e) { j.status = 'error'; j.error = String(e); }
                }
            });
            pump();
        },

        // stats()/fileStats() viven en p2pcfg.js (solo leen el torrent)
    };
})();
