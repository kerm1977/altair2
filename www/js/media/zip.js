// === media/zip.js — Compresor ZIP puro =====================================
// Genera .zip estándar: DEFLATE vía CompressionStream (STORE si no hay
// soporte) y contraseña opcional ZipCrypto clásica (la abren 7-Zip,
// WinRAR, Windows y Android). API:
//   TribalZip.build(files, {password}, onProgress) → Promise<Blob>
//   files = [{ name, blob }] · onProgress(0..1)
// ============================================================================
window.TribalZip = (function () {
    'use strict';
    var CT = (function () {                        // tabla CRC32
        var t = new Uint32Array(256), n, c, k;
        for (n = 0; n < 256; n++) {
            c = n;
            for (k = 0; k < 8; k++)
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crcUpd(c, b) { return CT[(c ^ b) & 0xFF] ^ (c >>> 8); }
    function crc32(u8) {
        var c = 0xFFFFFFFF, i;
        for (i = 0; i < u8.length; i++) c = crcUpd(c, u8[i]);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    // ZipCrypto: cifra el flujo completo (cabecera de 12 bytes + datos)
    function crypto(pwBytes) {
        var k = [0x12345678, 0x23456789, 0x34567890];
        function upd(b) {
            k[0] = crcUpd(k[0], b);
            k[1] = (k[1] + (k[0] & 0xFF)) >>> 0;
            k[1] = (k[1] * 134775813 + 1) >>> 0;
            k[2] = crcUpd(k[2], k[1] >>> 24);
        }
        for (var i = 0; i < pwBytes.length; i++) upd(pwBytes[i]);
        return function (u8) {                     // cifra un bloque
            var o = new Uint8Array(u8.length), t;
            for (var j = 0; j < u8.length; j++) {
                t = (k[2] | 2) >>> 0;
                o[j] = u8[j] ^ (((t * (t ^ 1)) >>> 8) & 0xFF);
                upd(u8[j]);
            }
            return o;
        };
    }
    function deflate(u8) {
        if (!window.CompressionStream) return Promise.resolve(null);
        var cs = new CompressionStream('deflate-raw');
        var st = new Blob([u8]).stream().pipeThrough(cs);
        return new Response(st).arrayBuffer().then(function (b) {
            return new Uint8Array(b); });
    }
    function te(s) { return new TextEncoder().encode(s); }
    function u16(v, o, x) { v.setUint16(o, x, true); }
    function u32(v, o, x) { v.setUint32(o, x, true); }
    function dosT(d) {
        return ((d.getHours() << 11) | (d.getMinutes() << 5) |
                (d.getSeconds() >> 1)) & 0xFFFF;
    }
    function dosD(d) {
        return (((d.getFullYear() - 1980) << 9) |
                ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    }
    function localHdr(name, m, fl, crc, cs, us, d) {
        var b = new Uint8Array(30 + name.length), v = new DataView(b.buffer);
        u32(v, 0, 0x04034B50); u16(v, 4, 20); u16(v, 6, fl); u16(v, 8, m);
        u16(v, 10, dosT(d)); u16(v, 12, dosD(d));
        u32(v, 14, crc); u32(v, 18, cs); u32(v, 22, us);
        u16(v, 26, name.length); u16(v, 28, 0);
        b.set(name, 30); return b;
    }
    function centralHdr(name, m, fl, crc, cs, us, off, d) {
        var b = new Uint8Array(46 + name.length), v = new DataView(b.buffer);
        u32(v, 0, 0x02014B50); u16(v, 4, 20); u16(v, 6, 20);
        u16(v, 8, fl); u16(v, 10, m);
        u16(v, 12, dosT(d)); u16(v, 14, dosD(d));
        u32(v, 16, crc); u32(v, 20, cs); u32(v, 24, us);
        u16(v, 28, name.length); u16(v, 30, 0); u16(v, 32, 0);
        u16(v, 34, 0); u16(v, 36, 0); u32(v, 38, 0); u32(v, 42, off);
        b.set(name, 46); return b;
    }
    function eocd(n, cdSize, cdOff) {
        var b = new Uint8Array(22), v = new DataView(b.buffer);
        u32(v, 0, 0x06054B50); u16(v, 4, 0); u16(v, 6, 0);
        u16(v, 8, n); u16(v, 10, n);
        u32(v, 12, cdSize); u32(v, 16, cdOff); u16(v, 20, 0);
        return b;
    }
    function concat(arrs) {
        var n = 0, i;
        arrs.forEach(function (a) { n += a.length; });
        var o = new Uint8Array(n), p = 0;
        for (i = 0; i < arrs.length; i++) { o.set(arrs[i], p); p += arrs[i].length; }
        return o;
    }
    function build(files, opts, onProg) {
        opts = opts || {};
        var pw = opts.password ? te(opts.password) : null;
        var parts = [], central = [], offset = 0, done = 0;
        var chain = Promise.resolve();
        files.forEach(function (f) {
            chain = chain.then(function () {
                return f.blob.arrayBuffer().then(function (ab) {
                    var raw = new Uint8Array(ab);
                    return deflate(raw).then(function (def) {
                        var method = def ? 8 : 0, data = def || raw;
                        var crc = crc32(raw), name = te(f.name),
                            flags = 0x0800,                    // nombre UTF-8
                            d = f.mtime ? new Date(f.mtime) : new Date();
                        if (pw) {
                            flags |= 1;                        // cifrado
                            var hdr = new Uint8Array(12), i;
                            for (i = 0; i < 11; i++)
                                hdr[i] = (Math.random() * 256) | 0;
                            hdr[11] = (crc >>> 24) & 0xFF;
                            var cr = crypto(pw);
                            data = concat([cr(hdr), cr(data)]);
                        }
                        var lh = localHdr(name, method, flags, crc,
                                          data.length, raw.length, d);
                        parts.push(lh, data);
                        central.push(centralHdr(name, method, flags, crc,
                                     data.length, raw.length, offset, d));
                        offset += lh.length + data.length;
                        done++;
                        if (onProg) onProg(done / files.length);
                    });
                });
            });
        });
        return chain.then(function () {
            var cdSize = central.reduce(function (a, c) {
                return a + c.length; }, 0);
            parts = parts.concat(central, [eocd(central.length, cdSize, offset)]);
            return new Blob(parts, { type: 'application/zip' });
        });
    }
    return { build: build };
})();
