// ============================================================================
// ARCHIVO: media/p2pcfg.js
// RESPONSABILIDAD: configuración del módulo P2P de TRIBALs.
//   Extiende TribalP2P con:
//   - Motores de búsqueda independientes (agregar/quitar/activar/probar)
//   - Gestión de trackers (agregar/quitar/probar con latencia)
//   - search(): consulta todos los motores 'api' activos y fusiona resultados
//   Todo persiste en localStorage (tribu_p2p) junto con la cola.
// ============================================================================
(function () {
    'use strict';
    var P = window.TribalP2P;
    if (!P || !P._) return;
    var _ = P._;

    // ---- trackers -----------------------------------------------------------
    P.removeTracker = function (u) {
        var t = _.getTrackers();
        var i = t.indexOf(u);
        if (i >= 0) { t.splice(i, 1); _.save(); }
    };

    // alta en bloque: lista de trackers (uno por línea); devuelve cuántos entraron
    P.addTrackers = function (text) {
        var t = _.getTrackers(), n = 0;
        String(text || '').split(/\r?\n|,|;/).forEach(function (u) {
            u = u.trim();
            if (u && t.indexOf(u) < 0) { t.push(u); n++; }
        });
        if (n) _.save();
        return n;
    };

    // probar un tracker o URL: vivo/muerto (y latencia)
    P.probeTracker = function (u, cb) {
        u = String(u || '').trim();
        if (/^wss?:|^https?:/.test(u)) {
            var t0 = Date.now();
            fetch(u.replace(/^ws/, 'http'), { mode: 'no-cors' })
                .then(function () { cb(true, Date.now() - t0); })
                .catch(function () { cb(false); });
        } else cb(false, null, 'UDP no se puede probar desde el navegador');
    };

    // ---- motores de búsqueda -------------------------------------------------
    P.engines = function () { return _.getEngines(); };

    P.addEngine = function (name, url, kind) {
        name = String(name || '').trim();
        url = String(url || '').trim();
        if (!name || !url || url.indexOf('%q') < 0) return false;
        var eng = _.getEngines();
        if (eng.some(function (e) { return e.url === url; })) return false;
        eng.push({ name: name, url: url,
                   kind: kind === 'site' ? 'site' : 'api', on: true });
        _.save();
        return true;
    };
    // alta en bloque: un motor por línea. Formatos:
    //   "Nombre|https://sitio/api?q=%q"  o  "https://sitio/api?q=%q" (nombre auto)
    P.addEngines = function (text, kind) {
        var eng = _.getEngines(), n = 0;
        String(text || '').split(/\r?\n/).forEach(function (ln) {
            ln = ln.trim();
            if (!ln) return;
            var name = '', url = ln;
            var p = ln.split('|');
            if (p.length > 1) { name = p[0].trim(); url = p.slice(1).join('|').trim(); }
            if (url.indexOf('%q') < 0) return;
            if (!name) {
                try { name = new URL(url).hostname; }
                catch (e) { name = url.slice(0, 24); }
            }
            if (eng.some(function (e) { return e.url === url; })) return;
            eng.push({ name: name, url: url,
                       kind: kind === 'site' ? 'site' : 'api', on: true });
            n++;
        });
        if (n) _.save();
        return n;
    };

    P.removeEngine = function (i) {
        var eng = _.getEngines();
        if (i >= 0 && i < eng.length && !eng[i].fixed) {
            eng.splice(i, 1); _.save();
        }
    };
    P.toggleEngine = function (i, on) {
        var eng = _.getEngines();
        // los motores fijos quedan siempre activos
        if (eng[i] && !eng[i].fixed) { eng[i].on = !!on; _.save(); }
    };

    // probe real de un motor: api → pide JSON de verdad; site → ping al host
    P.probeEngine = function (e, cb) {
        if (e.kind !== 'api')
            return P.probeTracker(e.url.replace('%q', 'x'), cb);
        var t0 = Date.now();
        P.fetchJson(e.url.replace('%q', 'test'))
            .then(function () { cb(true, Date.now() - t0); })
            .catch(function (ex) {
                cb(false, null, String((ex && ex.message) || ex));
            });
    };

    // JSON de un motor: en Android va por CapacitorHttp (nativo → sin CORS);
    // en web fetch directo con timeout (solo sirven motores con CORS abierto)
    P.fetchJson = function (url) {
        var CH = window.Capacitor && window.Capacitor.Plugins &&
                 window.Capacitor.Plugins.CapacitorHttp;
        if (CH && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform()) {
            return CH.get({
                url: url,
                headers: { Accept: 'application/json', 'User-Agent': 'TRIBALs/1.0' },
                responseType: 'json',
                connectTimeout: 12000, readTimeout: 12000
            }).then(function (r) {
                if (r.status >= 400) throw new Error('HTTP ' + r.status);
                var d = r.data;
                return typeof d === 'string' ? JSON.parse(d) : d;
            });
        }
        // web: fetch directo con timeout; si el motor no da CORS, reintenta
        // por relays de lectura encadenados (uno de ellos suele responder)
        var RELAYS = [
            // /get envuelve el JSON en {contents:"…"} — lo desenvuelvo
            function (u) { return 'https://api.allorigins.win/get?url=' +
                encodeURIComponent(u); },
            function (u) { return 'https://api.allorigins.win/raw?url=' +
                encodeURIComponent(u); },
            function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' +
                encodeURIComponent(u); }
        ];
        function get(u, ms) {
            return new Promise(function (rs, rj) {
                var ctrl = new AbortController();
                var t = setTimeout(function () { ctrl.abort(); }, ms);
                fetch(u, { signal: ctrl.signal })
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function (d) { clearTimeout(t); rs(d); })
                    .catch(function (e) { clearTimeout(t); rj(e); });
            });
        }
        function tryRelay(i, lastErr) {
            if (i >= RELAYS.length) throw lastErr;
            return get(RELAYS[i](url), 15000).catch(function (e) {
                return tryRelay(i + 1, e);
            });
        }
        return get(url, 12000).catch(function (e0) {
            return tryRelay(0, e0).then(function (d) {
                // desenvolver {contents:"…"} de allorigins /get si aplica
                if (d && typeof d.contents === 'string')
                    return JSON.parse(d.contents);
                return d;
            });
        });
    };

    // normaliza la respuesta de un motor según su forma:
    //   [ {info_hash…} ]            → formato apibay
    //   { results:[{infohash…}] }   → formato solidtorrents
    //   { torrents:[{infohash…}] }  → formato torrents-csv
    //   { data:{ movies:[…] } }     → formato yts
    function rowsOf(d) {
        var rows = [];
        if (Array.isArray(d)) {
            d.forEach(function (r) {
                if (!r || !r.info_hash || r.id === '0') return;
                rows.push({
                    name: r.name, size: +r.size || 0,
                    seeders: +r.seeders || 0,
                    magnet: 'magnet:?xt=urn:btih:' + r.info_hash +
                            '&dn=' + encodeURIComponent(r.name || '')
                });
            });
        } else if (d && Array.isArray(d.torrents)) {
            d.torrents.forEach(function (r) {
                var h = r.infohash || r.info_hash || r.hash;
                if (!h) return;
                rows.push({
                    name: r.name || r.title,
                    size: +(r.size_bytes || r.size) || 0,
                    seeders: +(r.seeders || r.seeds) || 0,
                    magnet: r.magnet_url ||
                            'magnet:?xt=urn:btih:' + h +
                            '&dn=' + encodeURIComponent(r.name || r.title || '')
                });
            });
        } else if (d && Array.isArray(d.results)) {
            d.results.forEach(function (r) {
                if (!r || !r.infohash) return;
                rows.push({
                    name: r.title, size: +r.size || 0,
                    seeders: +r.seeders || 0,
                    magnet: 'magnet:?xt=urn:btih:' + r.infohash +
                            '&dn=' + encodeURIComponent(r.title || '')
                });
            });
        } else if (d && d.data && Array.isArray(d.data.movies)) {
            d.data.movies.forEach(function (m) {
                var t = (m.torrents || [])[0];
                if (!t || !t.hash) return;
                rows.push({
                    name: m.title_long || m.title,
                    size: 0, seeders: +t.seeds || 0,
                    magnet: 'magnet:?xt=urn:btih:' + t.hash +
                            '&dn=' + encodeURIComponent(m.title_long || m.title || '')
                });
            });
        }
        return rows;
    }

    // busca en todos los motores 'api' activos; cb(err, results)
    // cada result: {name, size, seeders, magnet, engine}
    P.search = function (q, cb) {
        var apis = _.getEngines().filter(function (e) {
            return e.on && e.kind === 'api';
        });
        if (!apis.length) return cb(null, []);
        var left = apis.length, out = [], failed = [];
        apis.forEach(function (e) {
            P.fetchJson(e.url.replace('%q', encodeURIComponent(q)))
                .then(function (data) {
                    rowsOf(data).forEach(function (r) {
                        r.engine = e.name;
                        out.push(r);
                    });
                })
                .catch(function (ex) { failed.push(e.name); })
                .finally(function () {
                    if (--left === 0) {
                        var err = failed.length === apis.length
                            ? new Error('offline') : null;
                        if (err) err.engines = failed;
                        cb(err, out);
                    }
                });
        });
    };

    // ---- progreso del torrent y por archivo ----------------------------------
    P.stats = function (j) {
        var t = j.torrent;
        if (!t) return null;
        return {
            progress: t.progress, down: t.downloadSpeed, up: t.uploadSpeed,
            peers: t.numPeers, downloaded: t.downloaded, uploaded: t.uploaded,
            ratio: t.ratio, done: t.done, timeRemaining: t.timeRemaining
        };
    };

    // progreso por archivo dentro del torrent
    P.fileStats = function (j) {
        if (!j.torrent || !j.torrent.files) return [];
        return j.torrent.files.map(function (f) {
            return { name: f.name, path: f.path || f.name, length: f.length,
                     progress: f.progress || 0, downloaded: f.downloaded || 0,
                     done: !!f.done };
        });
    };
})();
