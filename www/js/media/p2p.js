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
    // Sonda real hoy: magnetoo/files.fm/peertube/novage responden;
    // webtorrent.dev, btorrent.xyz, sloppyta, loligirl — MUERTOS.
    var DEFAULT_TRACKERS = [
        'wss://tracker.openwebtorrent.com',
        'wss://open.ftorrent.com',
        'wss://tracker.magnetoo.io',
        'wss://tracker.files.fm:7073/announce',
        'wss://peertube.cpy.re/tracker/socket',
        'wss://tracker.novage.com.ua'
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
            log('Trackers vivos actualizados: ' + list.length);
            // los torrents vivos anuncian en los trackers nuevos ya mismo
            jobs.forEach(function (j) { reannounce(j.torrent); });
        }).catch(function (e) {
            log('Lista de trackers: sin red (' +
                (e && e.message || 'fetch falló') + ')');
        });
    }

    // ---- trackers del swarm REAL para el motor nativo ----------------------
    // En la APK libtorrent sí anuncia por udp/http/https (solo los ws:// se
    // descartan — no los entiende). ngosang/trackerslist publica la lista
    // completa de trackers vivos cada hora → la cacheamos 12 h. Así cada
    // torrent anuncia en TODOS los trackers, no solo en los wss.
    var ALL_TRK_URL = 'https://raw.githubusercontent.com/ngosang/' +
        'trackerslist/master/trackers_all.txt';
    var ALL_TRK_LS = 'tribu_p2p_trk_all';
    var allTrackers = [];
    // semilla de respaldo: trackers públicos conocidos vivos — el swarm
    // nativo anuncia en TODOS aunque la lista remota falle (sin red)
    var SWARM_SEED = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://exodus.desync.com:6969/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.moeking.me:6969/announce',
        'udp://explodie.org:6969/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://opentracker.i2p.rocks:6969/announce',
        'udp://open.tracker.cl:1337/announce',
        'udp://tracker.tiny-vps.com:6969/announce',
        'udp://tracker.beeimg.com:6969/announce',
        'udp://retracker.lanta-net.ru:2710/announce',
        'udp://www.torrent.eu.org:451/announce',
        'udp://tracker.theoks.net:6969/announce',
        'udp://tracker1.bt.moack.co.kr:80/announce',
        'udp://tracker.edkj.club:6969/announce',
        'udp://dumped.gay:6969/announce',
        'udp://tracker.johnrosen1.com:6969/announce',
        'udp://tracker.tryhackx.org:6969/announce',
        'udp://uploads.gamecoast.net:6969/announce',
        'udp://tracker.srv00.com:6969/announce',
        'udp://tracker.leech.ie:1337/announce',
        'udp://tracker.ccp.ovh:6969/announce',
        'udp://t.overflow.biz:6969/announce',
        'udp://retracker01-msk-virt.corbina.net:80/announce',
        'udp://bt2.archive.org:6969/announce',
        'udp://bt1.archive.org:6969/announce',
        'udp://9.rarbg.to:2870/announce',
        'udp://tracker.skyts.net:6969/announce',
        'udp://tracker.doko.moe:6969/announce',
        'udp://tracker-udp.gbitt.info:80/announce',
        'udp://concen.org:6969/announce',
        'udp://open.tracker.ink:6969/announce',
        'udp://ttk2.nbaonlineservice.com:6969/announce',
        'https://tracker.tamersunion.org:443/announce',
        'https://tracker.gbitt.info:443/announce',
        'https://tracker.nanoha.org:443/announce',
        'https://tracker.ghostchu-services.top:443/announce',
        'https://tr.ready4.icu:443/announce',
        'https://tracker.lilithraws.org:443/announce',
        'http://nyaa.tracker.wf:7777/announce',
        'http://tracker.ipv6tracker.org:80/announce',
        'http://t.nyaatracker.com:80/announce',
        'http://h4.trakx.nibba.trade:80/announce',
        'http://tracker.mywaifu.best:6969/announce'
    ];
    try {
        var _ac = JSON.parse(localStorage.getItem(ALL_TRK_LS) || '{}');
        if (_ac.list && _ac.list.length) allTrackers = _ac.list;
    } catch (e) {}
    function refreshAllTrackers(force) {
        var c = {};
        try { c = JSON.parse(localStorage.getItem(ALL_TRK_LS) || '{}'); }
        catch (e) {}
        if (!force && c.ts && Date.now() - c.ts < 43200000) return;   // 12 h
        if (!window.fetch) return;
        fetch(ALL_TRK_URL).then(function (r) {
            if (!r.ok) throw 0;
            return r.text();
        }).then(function (t) {
            var list = t.split(/\s+/).filter(function (u) {
                return /^(udp|https?):\/\//.test(u);
            }).slice(0, 100);
            if (!list.length) return;
            allTrackers = list;
            try {
                localStorage.setItem(ALL_TRK_LS,
                    JSON.stringify({ ts: Date.now(), list: list }));
            } catch (e) {}
            log('Trackers swarm (udp/http) actualizados: ' + list.length);
        }).catch(function () {});
    }
    // lista para inyectar al motor nativo: TODOS los udp/http/https vivos
    // (o la semilla si la lista aún no bajó) + los propios del usuario
    function nativeTrackers() {
        var seen = {};
        var base = allTrackers.length ? allTrackers : SWARM_SEED;
        return base.concat(extraTrackers).filter(function (u) {
            if (!/^(udp|https?):\/\//.test(u) || seen[u]) return false;
            seen[u] = 1;
            return true;
        });
    }
    // la lista viva (o la semilla) — para mostrarla en la sección Trackers
    function swarmTrackers() {
        return allTrackers.length ? allTrackers.slice() : SWARM_SEED.slice();
    }

    // WebTorrent en navegador/WebView solo habla trackers wss://: los
    // udp:// y http:// que siembran los buscadores nunca conectan.
    // ACOTADA: cada URL = una conexión WS por torrent — 30 trackers por
    // torrent es lo que rate-limitaba (HTTP 429) y llenaba la consola
    // de conexiones rechazadas. 3 fijos + 6 vivos + extras del usuario.
    function announceList() {
        var seen = {};
        return DEFAULT_TRACKERS.concat(liveTrackers.slice(0, 6), extraTrackers)
            .filter(function (u) {
                if (!/^wss?:\/\//.test(u) || seen[u]) return false;
                seen[u] = 1;
                return true;
            }).slice(0, 12);
    }

    // pide peers al canal de trackers de un torrent vivo (re-anuncio).
    // OJO: en bittorrent-tracker el método público es update() — announce()
    // NO existe → los re-anuncios anteriores eran un no-op silencioso y por
    // eso "Forzar"/el re-anuncio de 75 s nunca movía nada.
    function reannounce(t) {
        if (!t || t.destroyed) return;
        var tr = t.tracker ||
                 (t._discovery && t._discovery.tracker) ||
                 (t.discovery && t.discovery.tracker);
        if (!tr) return;
        try {
            if (tr.update) tr.update();
            else if (tr.announce) tr.announce();
        } catch (e) {}
    }

    // ---- motor NATIVO (libtorrent real): en la APK los torrents van por ----
    // TCP/UDP/DHT — el swarm completo. En la preview web cae a WebTorrent.
    function nativeOK() {
        var n = window.TribalP2PNative;
        return !!(n && n.ok);
    }
    function nativeStart(j) {
        log('Nativo: añadiendo ' + String(j.magnet).slice(0, 55) + '…');
        if (!allTrackers.length) refreshAllTrackers();
        var trs = nativeTrackers();
        window.TribalP2PNative.add(j.magnet, trs).then(function (r) {
            j.native = true;
            j.nid = r.id;
            j.torrent = window.TribalP2PNative.torrentProxy(j);
            log('Nativo: en sesión como ' + String(r.id).slice(0, 12) +
                '… con ' + trs.length + ' trackers swarm + DHT');
            if (j.status === 'paused') window.TribalP2PNative.pause(j.nid);
            else { j.status = 'metadata'; j.metaSince = Date.now(); }
            save(); emit('change'); pump();
        }).catch(function (e) {
            j.status = 'error';
            j.error = String(e && e.message || e);
            log('Nativo ERROR al añadir: ' + j.error);
            save(); emit('change');
        });
    }
    var _nativePollOn = false, _dhtLog = -1;
    function wireNativePoll() {
        if (!nativeOK() || _nativePollOn) return;
        _nativePollOn = true;
        window.TribalP2PNative.onPoll(function () {
            var dirty = false;
            // DHT en la consola: arranque del enjambre (nodos encontrados)
            var dh = window.TribalP2PNative.dht();
            if (dh && dh.nodes !== _dhtLog) {
                var was = _dhtLog; _dhtLog = dh.nodes;
                if (dh.nodes > 0 || was === 0)
                    log('DHT ' + (dh.on ? 'activo' : 'apagado') + ' · ' +
                        dh.nodes + ' nodos');
            }
            jobs.forEach(function (j) {
                if (!j.native) return;
                if (j.status === 'metadata' && j.torrent &&
                    j.torrent.files.length) {
                    j.status = 'downloading';
                    log('«' + j.name + '»: metadata ✓ → descargando ' +
                        j.torrent.numPeers + ' peers · ' +
                        j.torrent.files.length + ' archivos');
                }
                if (window.TribalP2PNative.sync(j)) {   // completó ahora
                    if (j.seeded) {
                        // siembra nativa: ya estaba completo — queda
                        // "Sembrando", sin reimportar a la tribu
                        j.status = 'seed';
                        log('«' + (j.name || 'Torrent') +
                            '» verificado → sembrando al swarm');
                        save(); emit('change');
                        return;
                    }
                    j.status = 'done';
                    log('«' + (j.name || 'Torrent') + '» COMPLETO ✓');
                    save();
                    if (toast) toast('«' + (j.name || 'Torrent') +
                                     '» descargado');
                    if (window.TribalP2PJobs)
                        TribalP2PJobs.import(j, store, toast)
                            .then(function () { emit('imported', j); });
                    emit('done', j);
                    pump();
                }
                dirty = true;
            });
            if (dirty) emit('change');
        });
    }

    // servidores STUN: sin buen NAT traversal WebRTC no conecta con nadie
    var ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];
    // magnet limpio: le quitamos TODOS los tr= — los trackers vivos se
    // pasan por la opción {announce} en cada add(). Así los magnets
    // guardados nunca arrastran trackers muertos ni duplican anuncios,
    // y cada arranque anuncia solo en la lista vigente.
    function withTrackers(m) {
        if (!/^magnet:/.test(m)) m = 'magnet:?xt=urn:btih:' + m;
        return m.split('&').filter(function (p) {
            return p.indexOf('tr=') !== 0;
        }).join('&');
    }

    // nombre de exhibición del magnet: los buscadores lo traen en dn= —
    // sin esto la tarjeta decía "Sin nombre" hasta que llegaba metadata
    function magnetName(m) {
        var dm = /[?&]dn=([^&]+)/.exec(m);
        if (!dm) return null;
        try {
            return decodeURIComponent(dm[1].replace(/\+/g, ' ')).trim() || null;
        } catch (e) { return dm[1]; }
    }

    function emit(k, a) {
        (listeners[k] || []).forEach(function (f) { try { f(a); } catch (e) {} });
    }

    // ---- consola del motor: anillo de eventos visible desde el panel ----
    var LOG = [];
    function log(msg) {
        var d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); };
        LOG.push({ t: p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' +
                      p2(d.getSeconds()), m: String(msg) });
        if (LOG.length > 400) LOG.shift();
        emit('log');
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
                             seeded: !!j.seeded,
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
        log('Reviviendo «' + (j.name || 'torrent') + '» (job sin motor)');
        if (nativeOK()) { wireNativePoll(); nativeStart(j); return; }
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
        if (j.native) { window.TribalP2PNative.resume(j.nid); return; }
        if (j.torrent) j.torrent.files.forEach(function (f) { f.select(); });
    }
    function pauseFiles(j) {
        if (j.native) { window.TribalP2PNative.pause(j.nid); return; }
        if (j.torrent) j.torrent.files.forEach(function (f) { f.deselect(); });
    }

    function wireTorrent(j, t) {
        j.torrent = t;
        j.name = j.name || t.name || 'Sin nombre';
        j.infoHash = t.infoHash;
        j.magnet = j.magnet || t.magnetURI;
        log('WebTorrent: añadido ' + String(j.infoHash || '').slice(0, 12) +
            '… con ' + announceList().length + ' trackers');
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
            log('«' + j.name + '»: metadata ✓ → ' + j.files.length +
                ' archivos');
            save(); emit('change');
        }
        t.on('metadata', onMeta);
        t.on('ready', onMeta);
        if (t.ready || (t.files && t.files.length)) onMeta();
        t.on('download', function () { emit('change'); });
        t.on('upload', function () { emit('change'); });
        // avisos no fatales (tracker rechazado, wire roto…) → consola:
        // sin esto los fallos de tracker eran invisibles y el torrent
        // parecía "no hacer nada"
        t.on('warning', function (e) {
            log('«' + (j.name || 'torrent') + '» aviso: ' +
                String(e && e.message || e).slice(0, 140));
        });
        t.on('wire', function () {
            emit('change');
            log('«' + (j.name || 'torrent') + '»: ' + t.numPeers +
                ' peer(s) conectados');
        });
        t.on('done', function () {
            j.status = 'done';
            log('«' + (j.name || 'Torrent') + '» COMPLETO ✓');
            save(); emit('change');
            if (toast) toast('«' + (j.name || 'Torrent') + '» descargado');
            if (window.TribalP2PJobs)
                TribalP2PJobs.import(j, store, toast)
                    .then(function () { emit('imported', j); });
            emit('done', j);
            pump();
        });
        t.on('error', function (e) {
            j.error = String(e && e.message || e);
            j.status = 'error';
            log('«' + (j.name || 'torrent') + '» ERROR: ' + j.error);
            save(); emit('change');
        });
        // si la metadata no llega en un margen razonable el torrent
        // sigue intentando, pero avisamos para poder re-anunciar
        setTimeout(function () {
            if (j.status !== 'metadata') return;
            var np = j.torrent ? j.torrent.numPeers : 0;
            log('«' + (j.name || 'torrent') + '»: 45 s sin metadata · ' + np +
                ' peer(s) ' + (np ? 'conectados' : '— swarm web invisible aún'));
            if (toast) toast('«' + (j.name || 'Torrent') +
                             '» sigue sin peers — re-anunciando solo');
        }, 45000);
        // re-anuncio con backoff: los trackers contestan intervalos de
        // ~15 min — eterno para un swarm web chico. Mientras no haya
        // peers el motor re-anuncia cada 75 s, máximo 8 veces (~10 min):
        // más rápido que eso = 429 de los trackers públicos.
        clearInterval(j._ann);
        j._annN = 0;
        j._ann = setInterval(function () {
            if (!j.torrent || j.torrent.destroyed || j.torrent.done ||
                j.status === 'error') { clearInterval(j._ann); return; }
            if (j.torrent.numPeers > 0 || j.status === 'paused' ||
                j.status === 'netwait') return;
            if (++j._annN > 8) { clearInterval(j._ann); return; }
            log('«' + (j.name || 'torrent') + '»: re-anuncio #' +
                j._annN + ' (0 peers)');
            reannounce(j.torrent);
        }, 75000);
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
                  magnet: magnet, name: magnetName(magnet), torrent: null,
                  status: 'queued', addedAt: Date.now(), files: [] };
        jobs.push(j);
        log('Magnet añadido: ' + magnet.slice(0, 70) +
            (magnet.length > 70 ? '…' : ''));
        if (nativeOK()) {                    // APK → libtorrent real
            wireNativePoll();
            nativeStart(j);
            if (toast) toast('Torrent añadido — obteniendo datos…');
            pump(); save(); emit('change');
            return j;
        }
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

    // siembra NATIVA (APK): copia el blob a files/tribu_torrents/ y crea el
    // .torrent real con libtorrent → siembra por TCP/UDP/DHT embebidos.
    // Devuelve el job ya (la tarjeta aparece de inmediato); el magnet se
    // rellena cuando el plugin termina de generar el torrent.
    function seed(meta, blobOrFile) {
        if (nativeOK()) {
            var j = { id: 'p2p-' + Date.now().toString(36) +
                            Math.random().toString(36).slice(2, 6),
                      magnet: '', name: meta.name, torrent: null,
                      status: 'seed', seeded: true,
                      addedAt: Date.now(), files: [] };
            jobs.push(j);
            save(); emit('change');
            var blob = blobOrFile instanceof Blob ? blobOrFile
                       : new Blob([blobOrFile]);
            var fname = String(meta.name || 'seed.bin')
                          .replace(/[\/\\:*?"<>|]/g, '_');
            var FS = window.Capacitor.Plugins.Filesystem;
            log('Siembra nativa: preparando «' + j.name + '»…');
            window.SonoStoreIO.fileToBase64(blob).then(function (b64) {
                return FS.writeFile({ path: 'tribu_torrents/' + fname, data: b64,
                                      directory: 'DATA', recursive: true });
            })
            .then(function () {
                return FS.getUri({ path: 'tribu_torrents/' + fname,
                                   directory: 'DATA' });
            }).then(function (u) {
                var abs = String(u.uri || '').replace(/^file:\/\//, '');
                return window.TribalP2PNative.seedFile(abs, nativeTrackers());
            }).then(function (r) {
                j.magnet = r.magnet; j.native = true; j.nid = r.id;
                j.torrent = window.TribalP2PNative.torrentProxy(j);
                wireNativePoll();
                log('Siembra «' + j.name + '»: btih ' +
                    String(r.id).slice(0, 12) + '… anunciando en ' +
                    nativeTrackers().length + ' trackers + DHT');
                if (navigator.clipboard && j.magnet)
                    navigator.clipboard.writeText(j.magnet)
                        .catch(function () {});
                save(); emit('change');
            }).catch(function (e) {
                j.status = 'error';
                j.error = String(e && e.message || e);
                log('Siembra nativa ERROR: ' + j.error);
                save(); emit('change');
            });
            return j;
        }
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
                  magnet: t.magnetURI || '', name: meta.name, torrent: t,
                  status: 'seed', seeded: true, addedAt: Date.now(), files: [] };
        jobs.push(j);
        function syncSeedMagnet() {
            if (!t.magnetURI && !t.infoHash) return;
            var base = t.magnetURI ||
                ('magnet:?xt=urn:btih:' + t.infoHash +
                 '&dn=' + encodeURIComponent(meta.name || 'seed'));
            var extraTr = nativeTrackers().slice(0, 15).map(function (u) {
                return 'tr=' + encodeURIComponent(u);
            }).join('&');
            j.magnet = extraTr ? (base + '&' + extraTr) : base;
            j.infoHash = t.infoHash;
            log('Siembra web lista: «' + j.name + '» · btih ' +
                String(t.infoHash || '').slice(0, 12) + '…');
            save(); emit('change');
        }
        if (t.infoHash || t.magnetURI) syncSeedMagnet();
        t.on('infoHash', syncSeedMagnet);
        t.on('ready', syncSeedMagnet);
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
        // nativo acepta udp/http/https/wss; web solo usa los ws —
        // guardamos todos: el motor nativo los anuncia de verdad
        if (!/^(udp|https?|wss?):\/\//.test(u) ||
            extraTrackers.indexOf(u) >= 0) return;
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
            log('Reconectando «' + (j.name || 'torrent') + '»…');
            if (j.torrent) try { j.torrent.destroy(); } catch (e) {}
            j.torrent = null; j.status = st === 'paused' ? 'paused' : 'queued';
            refreshTrackers(true);                    // trackers frescos ya
            if (nativeOK()) {
                j.native = false; j.nid = null;
                nativeStart(j);
            } else {
                var c = ensureClient();
                if (c) wireTorrent(j, c.add(withTrackers(j.magnet),
                    { announce: announceList() }));
            }
            pump();
        },

        // fuerza comunicación SIN destruir el torrent: re-anuncia en todos
        // los trackers y pide peers otra vez. Si no hay canal vivo → reconectar.
        forceComm: function (id) {
            var j = find(id); if (!j) return false;
            if (j.native) {
                if (j.nid) { window.TribalP2PNative.reannounce(j.nid); }
                else if (j.magnet) { j.status = 'queued'; nativeStart(j); }
                emit('change'); pump();
                return true;
            }
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

        // prioridad por archivo: 0 = no bajar (pausa del archivo),
        // 1 = baja, 4 = media, 7 = alta. Nativo → libtorrent real;
        // web → select/deselect del archivo en WebTorrent.
        setFilePrio: function (id, fi, prio) {
            var j = find(id); if (!j) return;
            prio = Math.max(0, Math.min(7, prio | 0));
            var f = j.torrent && j.torrent.files && j.torrent.files[fi];
            if (j.native && j.nid) {
                window.TribalP2PNative.setFilePriority(j.nid, fi, prio)
                    .catch(function () {});
                if (f) f.prio = prio;
                log('«' + (j.name || 'torrent') + '» archivo ' + fi +
                    ' → prioridad ' + prio);
            } else if (f) {
                f.prio = prio;
                try {
                    if (prio === 0) f.deselect();
                    else f.select();
                } catch (e) {}
            }
            emit('change');
        },

        trackers: trackers,
        addTracker: addTracker,
        swarmTrackers: swarmTrackers,
        refreshSwarm: function () { refreshAllTrackers(true); },

        // acceso interno para p2pcfg.js (motores/trackers/buscador)
        _: {
            getEngines: function () { return engines; },
            getTrackers: function () { return extraTrackers; },
            save: save, emit: emit,
            ensureClient: ensureClient, find: find,
            jobs: function () { return jobs; }
        },

        logs: function () { return LOG.slice(); },
        clearLog: function () { LOG.length = 0; emit('log'); },

        restore: function () {
            var d = load();
            if (d.jobs && d.jobs.length)
                log('Restaurando ' + d.jobs.length + ' torrent(s) ' +
                    (nativeOK() ? 'con motor nativo' : 'con WebTorrent'));
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
            // siembra versionada de motores + depuración de trackers
            // muertos (p2pqbit.js) — corre una vez por versión
            if (window.TribalP2PQBIT) window.TribalP2PQBIT.seed();
            refreshTrackers();
            refreshAllTrackers();
            if (nativeOK()) wireNativePoll();
            (d.jobs || []).forEach(function (r) {
                if (jobs.some(function (j) { return j.id === r.id; })) return;
                var j = { id: r.id, magnet: r.magnet, name: r.name,
                          torrent: null, status: r.status || 'queued',
                          seeded: !!r.seeded,
                          addedAt: r.addedAt || Date.now(), files: [] };
                jobs.push(j);
                if (nativeOK()) {
                    nativeStart(j);           // APK → libtorrent real
                    return;
                }
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
