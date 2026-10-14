// ============================================================================
// ARCHIVO: media/p2pqbit.js
// RESPONSABILIDAD: siembra versionada de los motores de búsqueda del módulo
//   P2P y depuración de lo que no puede funcionar en una WebView.
//
//   Cada motor lleva: { n: nombre, u: url con %q, k: tipo, on, detail? }
//     k='api'    → JSON consultable dentro de la app (YTS, Snowfl, SubsPlease)
//     k='rss'    → feed RSS/Atom con magnets o infoHash (nyaa, mikan…)
//     k='scrape' → la página de resultados YA trae <a href="magnet:">
//     k='scrape'+detail → el magnet vive en la página de detalle; `detail` es
//                  regex de la URL de detalle para perseguirla (1337x…)
//     k='site'   → sin vía integrada (login/JS pesado) → chip que abre la
//                  búsqueda del sitio con el término puesto
//
//   En Android todo lo no-'site' funciona de verdad: CapacitorHttp no tiene
//   CORS. En la preview web depende de relays CORS — si un relay falla, ese
//   motor queda "sin conexión" pero el resto sigue.
//
//   VER 3: purga — quita los trackers udp/http sembrados antes (ninguno puede
//   funcionar en WebView: WebTorrent solo anuncia por wss://) y los motores
//   cuyo dominio murió. En subidas de versión actualiza los existentes por
//   nombre respetando el interruptor del usuario.
// ============================================================================
window.TribalP2PQBIT = (function () {
    'use strict';
    var FLAG = 'tribu_p2p_qbit';
    var VER = 4;

    var DEFS = [
        // ---- APIs JSON reales (buscan dentro de TRIBALs) --------------------
        { n: 'YTS',        u: 'https://yts.mx/api/v2/list_movies.json?query_term=%q', k: 'api', on: 1 },
        { n: 'Snowfl',     u: 'https://snowfl.com/api/search/%q',                     k: 'api', on: 1 },
        { n: 'SubsPlease', u: 'https://subsplease.org/api/?f=search&tz=UTC&s=%q',     k: 'api', on: 1 },

        // ---- RSS/Atom con magnet o infoHash ----------------------------------
        { n: 'Nyaa',    u: 'https://nyaa.si/?page=rss&q=%q&c=0_0&f=0',        k: 'rss', on: 1 },
        { n: 'Sukebei', u: 'https://sukebei.nyaa.si/?page=rss&q=%q&c=0_0&f=0', k: 'rss' },
        { n: 'Mikan',   u: 'https://mikanime.tv/RSS/Search?searchstr=%q',      k: 'rss' },
        { n: 'ACG.RIP', u: 'https://acg.rip/.xml?term=%q',                     k: 'rss' },

        // ---- scrape: magnet en la página de resultados ------------------------
        { n: 'EZTV',          u: 'https://eztvx.to/search/%q',                       k: 'scrape', on: 1 },
        { n: 'BTDigg',        u: 'https://www.btdig.com/search?q=%q',                k: 'scrape', on: 1 },
        { n: 'TorrentGalaxy', u: 'https://torrentgalaxy.one/torrents.php?search=%q', k: 'scrape', on: 1 },
        { n: 'Torlock',       u: 'https://www.torlock.com/all/torrents/%q.html',     k: 'scrape' },
        { n: 'LimeTorrents',  u: 'https://www.limetorrents.lol/search/all/%q/',      k: 'scrape', on: 1 },
        { n: 'BT4G',          u: 'https://bt4gprx.com/search?q=%q',                  k: 'scrape' },
        { n: 'Rutor',         u: 'https://rutor.info/search/%q',                     k: 'scrape' },
        { n: 'AnimeTosho',    u: 'https://animetosho.xyz/search?q=%q',               k: 'scrape' },
        { n: 'Uindex',        u: 'https://uindex.org/s.php?q=%q',                    k: 'scrape' },
        { n: 'FileMood',      u: 'https://filemood.com/result?q=%q',                 k: 'scrape' },
        { n: 'TorrentQuest',  u: 'https://torrentquest.com/search?q=%q',             k: 'scrape' },
        { n: 'YourBittorrent', u: 'https://yourbittorrent.com/?q=%q',                k: 'scrape' },
        { n: 'TorrentClaw',   u: 'https://torrentclaw.com/search?q=%q',              k: 'scrape' },
        { n: 'Zooqle',        u: 'https://zooqle.skin/search?q=%q',                  k: 'scrape' },
        { n: 'ETTV',          u: 'https://www.ettvcentral.com/torrents-search.php?search=%q', k: 'scrape' },
        { n: 'TraHT',         u: 'https://traht.org/?s=%q',                          k: 'scrape' },
        { n: 'The Pirate Bay', u: 'https://thepiratebay.org/search.php?q=%q',        k: 'scrape' },
        // VER 4 — más sitios vivos (magnets visibles en la página)
        { n: 'Knaben',       u: 'https://knaben.org/search/?q=%q',                       k: 'scrape', on: 1 },
        { n: 'Glodls',       u: 'https://glodls.to/search_results.php?search=%q',        k: 'scrape' },
        { n: 'ExtTorrents',  u: 'https://ext.to/browse/?q=%q',                           k: 'scrape' },
        { n: 'BitCQ',        u: 'https://bitcq.com/search?q=%q',                         k: 'scrape' },
        { n: 'ACGNX',        u: 'https://share.acgnx.se/rss.xml?keyword=%q',             k: 'rss' },
        { n: 'Bangumi',      u: 'https://bangumi.moe/rss/search/%q',                     k: 'rss' },

        // ---- scrape + persecución a página de detalle -------------------------
        { n: '1337x',            u: 'https://1337x.to/search/%q/1/',                      k: 'scrape', on: 1, detail: '1337x\\.to/torrent/' },
        { n: 'BitSearch',        u: 'https://bitsearch.to/search?q=%q',                   k: 'scrape', detail: 'bitsearch\\.to/torrents?/' },
        { n: 'TorrentDownloads', u: 'https://www.torrentdownloads.pro/search/?search=%q', k: 'scrape', detail: 'torrentdownloads\\.pro/torrent/' },
        { n: 'TorrentDownload',  u: 'https://www.torrentdownload.info/search?q=%q',       k: 'scrape', detail: 'torrentdownload\\.info/torrent/' },
        { n: 'AcademicTorrents', u: 'https://academictorrents.com/browse.php?search=%q',  k: 'scrape', detail: 'academictorrents\\.com/torrent/' },
        { n: 'MKVCage',          u: 'https://www.mkvcage.ws/?s=%q',                       k: 'scrape', detail: 'mkvcage\\.ws/20' },

        // ---- sitio (sin vía integrada confiable: login o JS pesado) -----------
        { n: 'AniDex',           u: 'https://anidex.info/?q=%q',                              k: 'site' },
        { n: 'BT.etree',         u: 'https://bt.etree.org/?searchzz=%q',                      k: 'site' },
        { n: 'CalidadTorrent',   u: 'https://calidadtorrent.com/?s=%q',                       k: 'site' },
        { n: 'Cpasbien',         u: 'http://www.cpasbien.fr/recherche/%q',                    k: 'site' },
        { n: 'DODI Repacks',     u: 'https://dodi-repacks.site/?s=%q',                        k: 'site' },
        { n: 'E-Hentai',         u: 'https://e-hentai.org/?f_search=%q',                      k: 'site' },
        { n: 'EliteTorrent',     u: 'https://www.elitetorrent.com/?s=%q',                     k: 'site' },
        { n: 'FitGirl Repacks',  u: 'https://fitgirl-repacks.site/?s=%q',                     k: 'site' },
        { n: 'GOG Games',        u: 'https://gog-games.to/?s=%q',                             k: 'site' },
        { n: 'KAT',              u: 'https://katcr.to/usearch/%q',                            k: 'site' },
        { n: 'LinuxTracker',     u: 'http://linuxtracker.org/index.php?page=torrents&search=%q', k: 'site' },
        { n: 'MejorTorrent',     u: 'https://www36.mejortorrent.eu/?s=%q',                    k: 'site' },
        { n: 'MyPornClub',       u: 'https://myporn.club/search/%q',                          k: 'site' },
        { n: 'NekoBT',           u: 'https://nekobt.to/search?q=%q',                          k: 'site' },
        { n: 'Nitro',            u: 'https://nitro.to/search?keyword=%q',                     k: 'site' },
        { n: 'OnlineFix',        u: 'https://online-fix.me/?s=%q',                            k: 'site' },
        { n: 'PediaTorrent',     u: 'https://pediatorrent.com/?s=%q',                         k: 'site' },
        { n: 'Pirateiro',        u: 'https://pirateiro.io/search?query=%q',                   k: 'site' },
        { n: 'PornRips',         u: 'https://pornrips.to/?s=%q',                              k: 'site' },
        { n: 'SkTorrent',        u: 'https://sktorrent.eu/torrents?search=%q',                k: 'site' },
        { n: 'SkyeySnow',        u: 'https://skyeysnow.com/?s=%q',                            k: 'site' },
        { n: 'SmallGames',       u: 'http://small-games.info/?s=%q',                          k: 'site' },
        { n: 'TheRARBG',         u: 'https://therarbg.com/get-posts/keywords:%q/',            k: 'site' },
        { n: 'Tsukihime',        u: 'https://tsukihime.org/?s=%q',                            k: 'site' },
        { n: 'UnionDHT',         u: 'http://uniondht.org/tracker.php?nm=%q',                  k: 'site' },
        { n: 'XXXClub',          u: 'https://xxxclub.to/?s=%q',                               k: 'site' },
        { n: 'YggAPI',           u: 'https://yggapi.eu/torrents?q=%q',                        k: 'site' }
    ];

    // motores retirados: dominio caído u origen muerto (sonda http 2024).
    // seed() los borra aunque el usuario los tenga activos/guardados.
    var DEAD = [
        'DMHY', 'iDope', 'MagnetDL', 'GloTorrents', 'Il Corsaro Nero',
        'AudioBookBay', 'CloudTorrents', 'DivxTotal', 'DonTorrent',
        'EsmeraldaTorrent', 'NaranjaTorrent', 'RockBox', 'TNT Village',
        'Torrent9', 'TorrentProject', 'TomaDivx'
    ];

    // siembra versionada: corre dentro de restore(), después de cargar lo
    // guardado. Por nombre actualiza tipo/url/detail del motor respetando su
    // interruptor; los nuevos entran con su `on` por defecto. Además depura:
    //   - motores muertos (DEAD) fuera aunque el usuario los activó
    //   - trackers no-wss fuera: udp/http no puede anunciar una WebView
    function seed() {
        var P = window.TribalP2P;
        if (!P || !P._) return;
        var v = 0;
        try { v = +(localStorage.getItem(FLAG) || 0); } catch (e) {}
        if (v >= VER) return;
        var eng = P._.getEngines(), trk = P._.getTrackers();
        var i;
        // 1) fuera motores muertos
        for (i = eng.length - 1; i >= 0; i--)
            if (DEAD.indexOf(eng[i].name) >= 0) eng.splice(i, 1);
        // 2) motores vivos: actualizar / agregar
        DEFS.forEach(function (d) {
            var ex = eng.filter(function (x) { return x.name === d.n; })[0];
            if (ex) {
                var wasSite = ex.kind === 'site';
                ex.url = d.u;
                ex.kind = d.k;
                if (d.detail) ex.detail = d.detail; else delete ex.detail;
                if (wasSite && d.k !== 'site') ex.on = !!d.on;  // upgrade v1→v2
            } else {
                eng.push({ name: d.n, url: d.u, kind: d.k,
                           on: !!d.on, detail: d.detail });
            }
        });
        // 3) trackers: solo wss:// puede funcionar — fuera udp/http y duplicados
        for (i = trk.length - 1; i >= 0; i--) {
            var u = trk[i];
            if (!/^wss?:\/\//.test(u) || trk.indexOf(u) !== i) trk.splice(i, 1);
        }
        P._.save();
        try { localStorage.setItem(FLAG, String(VER)); } catch (e) {}
    }

    return { seed: seed };
})();
