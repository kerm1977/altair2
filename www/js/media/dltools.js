// ============================================================================
// ARCHIVO: media/dltools.js — herramientas de la página de descargas
// RESPONSABILIDAD: «copiar consola» (share sheet nativo + portapapeles),
// «⟳ actualizar motor» manual y el auto-update diario de yt-dlp (corre
// en el hilo del motor, en cola tras lo que esté descargando).
// API: TribalDlTools.make({el,say,log,plug}) → {share, update, autoUpdate}
// ============================================================================
window.TribalDlTools = (function () {
    'use strict';

    function make(d) {
        var el = d.el, say = d.say, log = d.log, plug = d.plug;

        // texto completo de la consola de diagnóstico
        function consoleText() {
            var c = el('.dg-console'), out = [];
            for (var i = 0; c && i < c.children.length; i++)
                out.push(c.children[i].textContent);
            return out.join('\n');
        }

        // comparte el diagnóstico: share sheet (WhatsApp…) + portapapeles
        function share() {
            var t = consoleText();
            if (!t) return say('la consola está vacía');
            el('.dg-console').hidden = false;
            el('.dg-conbtn').textContent = '▾ consola';
            var clip = navigator.clipboard && navigator.clipboard.writeText
                ? navigator.clipboard.writeText(t).catch(function () {})
                : Promise.resolve();
            var SH = window.Capacitor && Capacitor.Plugins &&
                     Capacitor.Plugins.Share;
            clip.then(function () {
                if (SH && SH.share)
                    return SH.share({ title: 'TRIBALs — consola yt-dlp',
                                      text: t });
            }).then(function () { say('✔ consola lista — pégala donde quieras'); },
                    function () { say('✔ consola copiada al portapapeles'); });
        }

        // «⟳ actualizar motor»: yt-dlp caduca y los sitios empiezan a
        // fallar (403/closed file) — baja el binario nuevo en caliente
        function update() {
            var p = plug();
            if (!p) return say('⚠ solo en el APK instalado');
            el('.dg-console').hidden = false;
            el('.dg-conbtn').textContent = '▾ consola';
            say('actualizando yt-dlp…'); log('⟳ updateYoutubeDL (stable)…');
            p.dlUpdate({ channel: 'stable' }).then(function (r) {
                var st = (r && r.status) || '?';
                log('motor: ' + st);
                say(st === 'DONE' ? '✔ motor actualizado'
                                  : 'motor ya al día (' + st + ')');
            }).catch(function (e) {
                var m = String((e && e.message) || e);
                log('✖ update: ' + m, 'err'); say('✖ no se pudo actualizar');
            });
        }

        // si pasaron >24 h desde la última comprobación, baja el yt-dlp
        // más reciente en silencio — el motor no vuelve a quedar viejo
        function autoUpdate() {
            var p = plug();
            if (!p) return;
            if (Date.now() - (+localStorage.getItem('tribu_dl_upd_ts')
                    || 0) <= 864e5) return;
            localStorage.setItem('tribu_dl_upd_ts', '' + Date.now());
            p.dlUpdate({ channel: 'stable' }).then(function (r) {
                log('⟳ motor: ' + ((r && r.status) || '?'));
            }).catch(function () {});
        }

        return { share: share, update: update, autoUpdate: autoUpdate };
    }

    return { make: make };
})();
