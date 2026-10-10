// ============================================================================
// ARCHIVO: media-lut.js
// RESPONSABILIDAD: LUTs .cube (premiere) para el editor de video.
//   - Parseo de archivos .cube (LUT_3D_SIZE + tabla RGB)
//   - Aplicación píxel a píxel sobre el canvas de exportación
//   - Persistencia en localStorage + restauración automática
//   Extiende window.TribalVidFX (comparte el estado via _x).
// ============================================================================
(function () {
    'use strict';
    var FX = window.TribalVidFX;
    if (!FX) return;
    var _x = FX._x;

    var LUT_STORE = 'tribu_luts';
    var LUT_ACTIVE = 'tribu_lut_active';

    // Parsea un archivo .cube de Premiere (LUT_3D_SIZE + tabla RGB).
    function parseLUT(text) {
        var size = 0, vals = [], done = false;
        String(text || '').split(/\r?\n/).forEach(function (ln) {
            ln = ln.trim();
            if (!ln || ln[0] === '#' || done) return;
            var m = ln.match(/^LUT_3D_SIZE\s+(\d+)/i);
            if (m) { size = +m[1]; return; }
            if (size > 0 && /^[-+.\d]/.test(ln)) {
                var p = ln.split(/\s+/).map(Number);
                if (p.length >= 3 && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2])) {
                    vals.push(p[0], p[1], p[2]);
                    if (vals.length === size * size * size * 3) done = true;
                }
            }
        });
        if (!size || vals.length !== size * size * size * 3) return null;
        return { size: size, data: new Float32Array(vals) };
    }

    function applyLUT(ctx, W, H) {
        var lut = _x.lut;
        var n = lut.size, d = lut.data, mx = n - 1;
        var id = ctx.getImageData(0, 0, W, H), p = id.data;
        for (var i = 0; i < p.length; i += 4) {
            var r = (p[i] * mx / 255 + 0.5) | 0;
            var g = (p[i + 1] * mx / 255 + 0.5) | 0;
            var b = (p[i + 2] * mx / 255 + 0.5) | 0;
            var o = ((b * n + g) * n + r) * 3;
            p[i] = d[o] * 255; p[i + 1] = d[o + 1] * 255; p[i + 2] = d[o + 2] * 255;
        }
        ctx.putImageData(id, 0, 0);
    }

    // LUTs guardadas en la app: { nombre: textoDelCube }
    function listLUTs() {
        try { return JSON.parse(localStorage.getItem(LUT_STORE) || '{}'); }
        catch (e) { return {}; }
    }
    function saveLUTFile(name, text) {
        var all = listLUTs();
        all[name] = text;
        try { localStorage.setItem(LUT_STORE, JSON.stringify(all)); } catch (e) {}
    }
    function deleteLUTFile(name) {
        var all = listLUTs();
        delete all[name];
        try { localStorage.setItem(LUT_STORE, JSON.stringify(all)); } catch (e) {}
    }
    function setLUT(name) {
        if (!name) {
            _x.lut = null;
            try { localStorage.removeItem(LUT_ACTIVE); } catch (e) {}
            return true;
        }
        var text = listLUTs()[name];
        var parsed = text && parseLUT(text);
        if (!parsed) return false;
        parsed.name = name;
        _x.lut = parsed;
        try { localStorage.setItem(LUT_ACTIVE, name); } catch (e) {}
        return true;
    }
    function restoreLUT() {
        try {
            var name = localStorage.getItem(LUT_ACTIVE);
            if (name) setLUT(name);
        } catch (e) {}
    }
    restoreLUT();

    FX.parseLUT = parseLUT;
    FX.applyLUT = applyLUT;
    FX.setLUT = setLUT;
    FX.listLUTs = listLUTs;
    FX.saveLUTFile = saveLUTFile;
    FX.deleteLUTFile = deleteLUTFile;
})();
