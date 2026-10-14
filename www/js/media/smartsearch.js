// === media/smartsearch.js — buscador vivo e inteligente ==================
// Cada tecla filtra al instante contra TODOS los criterios: nombre, título,
// artista, álbum, autor, género, extensión, tipo/categoría, colecciones,
// duración y tamaño. Términos separados por espacio deben cumplirse todos.
// Extras:
//   · tiempo: "3:45" (±3s) · ">2:00" "<90s" "2min" — solo audio/video
//   · tamaño: ">10mb" "<500kb" "2gb"
//   · campo:valor → tipo:video ext:mp3 col:rock art:badbunny album:x
//                    dur:>2:00  size:<10mb  titulo:luis
// API: S.buildMatcher(query) → función (m)=>bool usada por S.filtered.
// =========================================================================
window.Sono.register('smartsearch', function (S) {
    'use strict';

    var KINDS = {
        audio: 'audio musica música sonido cancion canción song track mp3 webm ogg m4a',
        video: 'video pelicula película clip mp4 mkv',
        image: 'image imagen foto fotografia fotografía picture img jpg png webp gif',
        doc:   'doc documento libro book pdf epub txt texto lectura read',
        other: 'otro other archivo file'
    };
    var VN = 'grabacion grabación memo nota voz recording voice mis grabaciones';
    var FIELD = /^(tipo|cat|kind|ext|fmt|dur|tiempo|size|peso|col|art|artista|album|titulo|title|nombre):(.*)$/;
    var TYPE2KIND = {
        audio: 'audio', musica: 'audio', música: 'audio', cancion: 'audio',
        canción: 'audio', song: 'audio', sonido: 'audio',
        video: 'video', pelicula: 'video', película: 'video', clip: 'video',
        image: 'image', imagen: 'image', foto: 'image', picture: 'image',
        doc: 'doc', documento: 'doc', libro: 'doc', book: 'doc',
        pdf: 'doc', epub: 'doc', txt: 'doc', texto: 'doc',
        otro: 'other', other: 'other', archivo: 'other', file: 'other',
        grabacion: 'grab', grabación: 'grab', memo: 'grab', nota: 'grab',
        voz: 'grab', recording: 'grab'
    };
    function isVN(m) {
        return (m.info && m.info.vn) || /^mi grabaci/i.test(m.name || '');
    }
    function grpOf(m) {
        return m.kind === 'audio' && isVN(m) ? 'grab' : m.kind;
    }
    function extOf(n) {
        var d = String(n || '').lastIndexOf('.');
        return d > 0 ? n.slice(d + 1).toLowerCase() : '';
    }
    function dur(m) {
        return m.info && isFinite(m.info.dur) ? m.info.dur : 0;
    }
    function isAV(m) { return m.kind === 'audio' || m.kind === 'video'; }

    // "3:45" · "2min"/"2m" · "90s"/"90seg" → segundos
    function durSecs(t) {
        var x = /^(\d{1,3}):(\d{1,2})$/.exec(t);
        if (x) return (+x[1]) * 60 + (+x[2]);
        x = /^(\d+(?:\.\d+)?)\s*(?:min|m)$/.exec(t);
        if (x) return +x[1] * 60;
        x = /^(\d+(?:\.\d+)?)\s*(?:s|seg|secs?)$/.exec(t);
        return x ? +x[1] : null;
    }
    // "10mb" "500kb" "2gb" "700b" → bytes
    function sizeBytes(t) {
        var x = /^(\d+(?:\.\d+)?)\s*(gb|mb|kb|b)$/.exec(t);
        if (!x) return null;
        var n = +x[1];
        return x[2] === 'gb' ? n * 1073741824 :
               x[2] === 'mb' ? n * 1048576 :
               x[2] === 'kb' ? n * 1024 : n;
    }
    function cmp(v, target, op) {
        return op === '>' ? v > target : op === '<' ? v < target :
               Math.abs(v - target) <= 3;
    }

    // texto buscable del archivo: todo lo que lo describe
    function hay(m) {
        var i = m.info || {};
        return [
            m.name, i.titulo, i.artista, i.album, i.genero, i.autor,
            i.comentario, isVN(m) ? VN + ' audio' : KINDS[m.kind],
            extOf(m.name),
            i.dur ? S.fmtTime(i.dur) : '',
            S.fmtSize(m.size),
            S.colNames ? S.colNames(m) : ''
        ].join(' ').toLowerCase();
    }

    function fieldMatch(m, f, v) {
        var op = null;
        if (v.charAt(0) === '>' || v.charAt(0) === '<') {
            op = v.charAt(0); v = v.slice(1);
        }
        switch (f) {
        case 'tipo': case 'cat': case 'kind': {
            var k = TYPE2KIND[v];
            return k ? grpOf(m) === k : grpOf(m) === v || m.kind === v;
        }
        case 'ext': case 'fmt':
            return extOf(m.name) === v.replace(/^\./, '');
        case 'dur': case 'tiempo': {
            var d = durSecs(v);
            return d != null && isAV(m) && cmp(dur(m), d, op);
        }
        case 'size': case 'peso': {
            var sb = sizeBytes(v);
            return sb != null && cmp(m.size || 0, sb, op);
        }
        case 'col':
            return S.colNames &&
                S.colNames(m).toLowerCase().indexOf(v) !== -1;
        case 'art': case 'artista':
            return ((m.info && m.info.artista) || '').toLowerCase()
                .indexOf(v) !== -1;
        case 'album':
            return ((m.info && m.info.album) || '').toLowerCase()
                .indexOf(v) !== -1;
        default:                                   // titulo / nombre
            return ((m.info && m.info.titulo) || m.name || '')
                .toLowerCase().indexOf(v) !== -1;
        }
    }

    function matchTerm(m, t) {
        var op = null;
        if (t.charAt(0) === '>' || t.charAt(0) === '<') {
            op = t.charAt(0); t = t.slice(1);
        }
        var f = FIELD.exec(t);
        if (f) return fieldMatch(m, f[1], f[2]);
        if (op) {
            var d = durSecs(t);
            if (d != null) return isAV(m) && cmp(dur(m), d, op);
            var sb = sizeBytes(t);
            return sb != null && cmp(m.size || 0, sb, op);
        }
        // "3:45" pelado = buscar duración cercana
        if (/^\d{1,3}:\d{1,2}$/.test(t))
            return isAV(m) && Math.abs(dur(m) - durSecs(t)) <= 3;
        // número pelado = duración en segundos (±3) o aparece en el texto
        if (/^\d+$/.test(t))
            return (isAV(m) && Math.abs(dur(m) - (+t)) <= 3) ||
                   hay(m).indexOf(t) !== -1;
        return hay(m).indexOf(t) !== -1;
    }

    // query → predicado. Todos los términos deben cumplirse.
    S.buildMatcher = function (q) {
        var terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return null;
        return function (m) {
            for (var i = 0; i < terms.length; i++)
                if (!matchTerm(m, terms[i])) return false;
            return true;
        };
    };
});
