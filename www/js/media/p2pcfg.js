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

    var KINDS = { api: 1, site: 1, rss: 1, scrape: 1 };
    function kindOf(k) { return KINDS[k] ? k : 'api'; }

    P.addEngine = function (name, url, kind) {
        name = String(name || '').trim();
        url = String(url || '').trim();
        if (!name || !url || url.indexOf('%q') < 0) return false;
        var eng = _.getEngines();
        if (eng.some(function (e) { return e.url === url; })) return false;
        eng.push({ name: name, url: url, kind: kindOf(kind), on: true });
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
            eng.push({ name: name, url: url, kind: kindOf(kind), on: true });
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

    // probe real de un motor: api/rss/scrape → pide de verdad; site → ping
    P.probeEngine = function (e, cb) {
        if (e.kind === 'site')
            return P.probeTracker(e.url.replace('%q', 'x'), cb);
        var t0 = Date.now();
        var p = e.kind === 'api'
            ? P.fetchJson(e.url.replace('%q', 'test'))
            : P.fetchText(e.url.replace('%q', 'test'));
        p.then(function () { cb(true, Date.now() - t0); })
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

    // texto crudo (HTML / RSS-XML): en Android va por CapacitorHttp (nativo →
    // sin CORS, sirve para CUALQUIER sitio); en web fetch directo y, si el
    // sitio no da CORS, relays que devuelven el cuerpo tal cual.
    P.fetchText = function (url) {
        var CH = window.Capacitor && window.Capacitor.Plugins &&
                 window.Capacitor.Plugins.CapacitorHttp;
        if (CH && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform()) {
            return CH.get({
                url: url,
                headers: { Accept: '*/*',
                           'User-Agent': 'Mozilla/5.0 (Linux; Android 13) TRIBALs/1.0' },
                responseType: 'text',
                connectTimeout: 14000, readTimeout: 14000
            }).then(function (r) {
                if (r.status >= 400) throw new Error('HTTP ' + r.status);
                return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
            });
        }
        var RELAYS = [
            function (u) { return 'https://api.allorigins.win/raw?url=' +
                encodeURIComponent(u); },
            function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' +
                encodeURIComponent(u); },
            function (u) { return 'https://api.allorigins.win/get?url=' +
                encodeURIComponent(u); }
        ];
        function get(u, ms) {
            return new Promise(function (rs, rj) {
                var ctrl = new AbortController();
                var t = setTimeout(function () { ctrl.abort(); }, ms);
                fetch(u, { signal: ctrl.signal })
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.text();
                    })
                    .then(function (d) { clearTimeout(t); rs(d); })
                    .catch(function (e) { clearTimeout(t); rj(e); });
            });
        }
        function tryRelay(i, lastErr) {
            if (i >= RELAYS.length) throw lastErr;
            return get(RELAYS[i](url), 16000).catch(function (e) {
                return tryRelay(i + 1, e);
            });
        }
        return get(url, 12000).catch(function (e0) {
            return tryRelay(0, e0).then(function (txt) {
                var t = String(txt || '').trim();
                if (t.charAt(0) === '{') {
                    // allorigins /get devuelve {contents:"…"} — desenvolver
                    try {
                        var j = JSON.parse(t);
                        if (j && typeof j.contents === 'string') return j.contents;
                    } catch (e) {}
                }
                return txt;
            });
        });
    };

    // ---- parsers de los motores 'rss' y 'scrape' ----------------------------

    // RSS/Atom de torrents: <magnetURI>, <nyaa:infoHash>+dn, <enclosure magnet:>,
    // <link>magnet: — con semillas/tamaño cuando el feed los publica
    // (nyaa/sukebei traen <nyaa:seeders> y <nyaa:size>)
    function rssRows(txt) {
        var rows = [], doc;
        try { doc = new DOMParser().parseFromString(txt, 'text/xml'); }
        catch (e) { return rows; }
        if (!doc || doc.getElementsByTagName('parsererror').length) return rows;
        var items = doc.getElementsByTagName('item');
        if (!items.length) items = doc.getElementsByTagName('entry');
        function pick(el, names) {
            for (var i = 0; i < el.children.length; i++) {
                var c = el.children[i];
                var ln = c.localName || c.nodeName.split(':').pop();
                if (names.indexOf(ln) >= 0) return c;
            }
            return null;
        }
        function txtOf(el) { return el ? (el.textContent || '').trim() : ''; }
        for (var i = 0; i < items.length && rows.length < 60; i++) {
            var it = items[i], magnet = null;
            var title = txtOf(pick(it, ['title']));
            var mEl = pick(it, ['magnetURI', 'magnet', 'magneturl']);
            if (mEl && /^magnet:/i.test(txtOf(mEl))) magnet = txtOf(mEl);
            if (!magnet) {
                var enc = pick(it, ['enclosure']);
                var eu = enc && (enc.getAttribute('url') || '');
                if (/^magnet:/i.test(eu)) magnet = eu;
            }
            if (!magnet) {   // <nyaa:infoHash> / torcache → construir el magnet
                var hEl = pick(it, ['infoHash', 'info_hash', 'hash', 'infohash']);
                var h = txtOf(hEl);
                if (/^[0-9a-fA-F]{40}$/.test(h)) {
                    magnet = 'magnet:?xt=urn:btih:' + h +
                             (title ? '&dn=' + encodeURIComponent(title) : '');
                }
            }
            if (!magnet) {
                var lk = pick(it, ['link']);
                var lv = lk && (lk.getAttribute('href') || txtOf(lk));
                if (lv && /^magnet:/i.test(lv.trim())) magnet = lv.trim();
            }
            if (!magnet) continue;
            var seeds = +txtOf(pick(it, ['seeders', 'seeds', 'seeder'])) || 0;
            var zEl = pick(it, ['size', 'contentLength']);
            var size = zEl ? (+zEl.getAttribute('length') || +txtOf(zEl) || 0) : 0;
            rows.push({ name: title || 'Torrent', size: size,
                        seeders: seeds, magnet: magnet });
        }
        return rows;
    }

    // scrape de la página de resultados: todos los <a href="magnet:…"> y, como
    // nombre, el texto del anchor o el enlace más largo de su fila
    function htmlRows(txt) {
        var rows = [], doc;
        try { doc = new DOMParser().parseFromString(txt, 'text/html'); }
        catch (e) { return rows; }
        if (!doc) return rows;
        var links = doc.querySelectorAll('a[href^="magnet:"]');
        for (var i = 0; i < links.length && rows.length < 60; i++) {
            var a = links[i], mg = a.getAttribute('href');
            var name = (a.getAttribute('title') || a.textContent || '').trim();
            if (!name || name.length < 4 || /magnet|download|descargar/i.test(name)) {
                var row = a.closest('tr') || a.closest('li') ||
                          a.closest('article') || a.closest('div');
                var best = '';
                if (row) {
                    var cand = row.querySelectorAll('a[href]');
                    for (var j = 0; j < cand.length; j++) {
                        var t = (cand[j].textContent || '').trim();
                        var h = cand[j].getAttribute('href') || '';
                        if (t.length > best.length && !/^magnet:/i.test(h)) best = t;
                    }
                }
                if (best) name = best;
            }
            if (name.length > 160) name = name.slice(0, 160);
            rows.push({ name: name || 'Torrent', size: 0,
                        seeders: 0, magnet: mg });
        }
        return rows;
    }

    // motor 'scrape': busca magnets en la página de resultados; si no hay y el
    // motor trae patrón `detail` (regex de su URL de detalle), persigue hasta
    // 6 páginas de detalle para sacar el magnet de ahí (1337x, bitsearch…)
    function scrapeEngine(e, q) {
        var url = e.url.replace('%q', encodeURIComponent(q));
        return P.fetchText(url).then(function (txt) {
            var rows = htmlRows(txt);
            if (rows.length || !e.detail) return rows;
            var doc, re;
            try {
                doc = new DOMParser().parseFromString(txt, 'text/html');
                re = new RegExp(e.detail);
            } catch (x) { return rows; }
            var base;
            try { base = new URL(url); } catch (x) { return rows; }
            var seen = {}, hrefs = [];
            var as = doc.querySelectorAll('a[href]');
            for (var i = 0; i < as.length && hrefs.length < 6; i++) {
                var h = as[i].getAttribute('href');
                if (!h || seen[h] || !re.test(h)) continue;
                seen[h] = 1;
                try { h = new URL(h, base).href; } catch (x) { continue; }
                hrefs.push(h);
            }
            if (!hrefs.length) return rows;
            var left = hrefs.length;
            return new Promise(function (rs) {
                hrefs.forEach(function (h) {
                    P.fetchText(h).then(function (dtxt) {
                        htmlRows(dtxt).forEach(function (r) { rows.push(r); });
                    }).catch(function () {}).finally(function () {
                        if (--left === 0) rs(rows);
                    });
                });
            });
        });
    }

    // normaliza la respuesta de un motor según su forma:
    //   [ {info_hash…} ]            → formato apibay
    //   { results:[{infohash…}] }   → formato solidtorrents
    //   { torrents:[{infohash…}] }  → formato torrents-csv
    //   { data:{ movies:[…] } }     → formato yts
    function rowsOf(d) {
        var rows = [];
        if (Array.isArray(d)) {
            d.forEach(function (r) {
                if (!r) return;
                if (r.info_hash && r.id !== '0') {          // apibay
                    rows.push({
                        name: r.name, size: +r.size || 0,
                        seeders: +r.seeders || 0,
                        magnet: 'magnet:?xt=urn:btih:' + r.info_hash +
                                '&dn=' + encodeURIComponent(r.name || '')
                    });
                } else {                                    // snowfl / genérico
                    var mg = r.magnet ||
                             (r.url && /^magnet:/.test(r.url) ? r.url : null);
                    if (!mg) return;
                    rows.push({
                        name: r.name || r.title || r.n,
                        size: +(r.size || r.size_bytes || r.bytes) || 0,
                        seeders: +(r.seeders || r.seeds || r.seeder) || 0,
                        magnet: mg
                    });
                }
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
        // red de seguridad: recorrido profundo del JSON buscando cualquier
        // objeto que traiga .magnet / .url "magnet:…" / hash de 40 hex
        // (subsplease anida res: {magnet:…}, apis caseras varían)
        if (!rows.length && d && typeof d === 'object') {
            var stack = [d], seen = 0;
            while (stack.length && rows.length < 60 && seen < 4000) {
                var cur = stack.pop(); seen++;
                if (!cur || typeof cur !== 'object') continue;
                if (Array.isArray(cur)) {
                    for (var k = 0; k < cur.length; k++) stack.push(cur[k]);
                    continue;
                }
                var mg = cur.magnet ||
                         (cur.url && /^magnet:/i.test(cur.url) ? cur.url : null);
                var hh = cur.infohash || cur.info_hash ||
                         (/^[0-9a-fA-F]{40}$/.test(cur.hash || '') ? cur.hash : null);
                if (!mg && hh) {
                    mg = 'magnet:?xt=urn:btih:' + hh +
                         '&dn=' + encodeURIComponent(
                             cur.name || cur.title || cur.n || '');
                }
                if (mg) {
                    rows.push({
                        name: cur.name || cur.title || cur.n ||
                              (cur.resolution ? 'SubsPlease ' + cur.resolution : 'Torrent'),
                        size: +(cur.size || cur.size_bytes || cur.bytes) || 0,
                        seeders: +(cur.seeders || cur.seeds || cur.seeder) || 0,
                        magnet: mg
                    });
                }
                for (var key in cur) {
                    if (Object.prototype.hasOwnProperty.call(cur, key) &&
                        cur[key] && typeof cur[key] === 'object') stack.push(cur[key]);
                }
            }
        }
        return rows;
    }

    // busca en todos los motores integrados activos (api / rss / scrape);
    // cb(err, results) — cada result: {name, size, seeders, magnet, engine}
    P.search = function (q, cb) {
        var apis = _.getEngines().filter(function (e) {
            return e.on && e.kind !== 'site';
        });
        if (!apis.length) return cb(null, []);
        var left = apis.length, out = [], failed = [], seenHash = {};
        function pushRow(r, engine) {
            var m = /urn:btih:([0-9a-zA-Z]+)/i.exec(r.magnet || '');
            var key = m ? m[1].toLowerCase() : r.magnet;
            if (seenHash[key]) return;
            seenHash[key] = 1;
            r.engine = engine;
            out.push(r);
        }
        apis.forEach(function (e) {
            var url = e.url.replace('%q', encodeURIComponent(q));
            var p = e.kind === 'rss'
                ? P.fetchText(url).then(rssRows)
                : e.kind === 'scrape'
                    ? scrapeEngine(e, q)
                    : P.fetchJson(url).then(rowsOf);
            p.then(function (rows) {
                    rows.forEach(function (r) { pushRow(r, e.name); });
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
