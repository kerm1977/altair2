// === media/vnotesav.js — persistencia del grabador de notas ==============
// Guardar nota en la tribu, fusionar con borrador retomado (decode+paste→wav),
// autoguardado del borrador (vndraft.js) y restauración al abrir el panel.
// Opera sobre `ctx` compartido con vnotes.js: {chunks,mime,elapsed,state,
// pendingBuf,pendingBlobs,pendingExt, liveSecs(),ext(),nextName(),fillList()}
// API: TribalVNav.{saveDraft,clearPending,savePending,finishBlob,restore,
//                  pendDur}
// =========================================================================
window.TribalVNav = (function () {
    'use strict';

    function pendDur(ctx) {
        return ctx.pendingBuf ? ctx.pendingBuf.duration :
            (ctx.pendingBlobs.length ?
                +((window.TribalVDraft.meta() || {}).dur) || 0 : 0);
    }
    function clearPending(ctx) {
        ctx.pendingBuf = null; ctx.pendingBlobs = []; ctx.pendingExt = '';
        if (window.TribalVDraft) TribalVDraft.clear();
    }

    // autoguardado periódico / al pausar / al ocultar la app
    function saveDraft(ctx) {
        if (!window.TribalVDraft || !ctx.chunks || !ctx.chunks.length) return;
        var blob = new Blob(ctx.chunks, { type: ctx.mime || 'audio/webm' });
        TribalVDraft.save(blob, {
            dur: pendDur(ctx) + ctx.liveSecs(), mime: ctx.mime || 'audio/webm',
            ext: ctx.pendingExt || ctx.ext()
        }, ctx.pendingBlobs);
    }

    // una nota empaquetada → tribu (info.vn=1, dur exacta)
    function saveNote(deps, ctx, file, dur, last) {
        return deps.store.add(file).then(function (m) {
            if (m && deps.store.updateInfo)
                deps.store.updateInfo(m.id, { vn: 1, dur: Math.max(.1, dur) });
            if (last === false) return;
            deps.toast('«' + file.name + '» guardada en la tribu');
            var p = deps.reload ? deps.reload() : null;
            if (p && p.then) p.then(ctx.fillList);
            ctx.fillList();
        });
    }
    // los trozos del borrador, cada uno como nota propia (nada se pierde)
    function saveParts(deps, ctx) {
        var chain = Promise.resolve();
        ctx.pendingBlobs.forEach(function (b) {
            chain = chain.then(function () {
                return saveNote(deps, ctx, new File([b],
                    ctx.nextName() + ctx.pendingExt, { type: b.type }),
                    0, false);
            });
        });
        return chain;
    }
    // guardar el borrador tal cual: fusionado si decodificó, si no por trozos
    function savePending(deps, ctx) {
        if (ctx.pendingBuf) {
            return saveNote(deps, ctx, new File([TribalVDSP.wav(ctx.pendingBuf)],
                ctx.nextName() + '.wav', { type: 'audio/wav' }),
                ctx.pendingBuf.duration);
        }
        return saveParts(deps, ctx);
    }

    // stop→guardar: une con el borrador si venía de uno (wav), si no, tal cual
    function finishBlob(deps, ctx, blob, dur) {
        if (!blob.size && !ctx.pendingBuf && !ctx.pendingBlobs.length) return;
        if (ctx.pendingBuf) {
            TribalVDSP.decode(blob).then(function (nb) {
                var merged = TribalVDSP.paste(ctx.pendingBuf, nb,
                    ctx.pendingBuf.duration, 0);
                return saveNote(deps, ctx, new File([TribalVDSP.wav(merged)],
                    ctx.nextName() + '.wav', { type: 'audio/wav' }),
                    merged.duration);
            }).then(function () { clearPending(ctx); })
            .catch(function () {
                saveParts(deps, ctx).then(function () {
                    saveNew(deps, ctx, blob, dur);
                });
            });
            return;
        }
        if (ctx.pendingBlobs.length) {
            saveParts(deps, ctx).then(function () { saveNew(deps, ctx, blob, dur); });
            return;
        }
        saveNew(deps, ctx, blob, dur);
    }
    function saveNew(deps, ctx, blob, dur) {
        if (blob.size) {
            saveNote(deps, ctx, new File([blob], ctx.nextName() + ctx.ext(),
                { type: blob.type }), dur)
                .then(function () { clearPending(ctx); });
        } else clearPending(ctx);
    }

    // al abrir el panel: ¿hay borrador? → lo carga y avisa vía onMeta(meta)
    function restore(ctx, onMeta) {
        TribalVDraft.load().then(function (d) {
            if (!d) return;
            ctx.pendingBlobs = (d.prev || []).concat([d.live]);
            ctx.pendingExt = d.meta.ext || '.webm';
            // decodifica cada trozo y los concatena → un solo AudioBuffer
            var dec = Promise.resolve([]);
            ctx.pendingBlobs.forEach(function (b) {
                dec = dec.then(function (acc) {
                    return TribalVDSP.decode(b).then(function (buf) {
                        acc.push(buf); return acc;
                    });
                });
            });
            dec.then(function (bufs) {
                var merged = bufs[0];
                for (var i = 1; i < bufs.length; i++)
                    merged = TribalVDSP.paste(merged, bufs[i], merged.duration, 0);
                ctx.pendingBuf = merged;
            }).catch(function () { ctx.pendingBuf = null; });
            onMeta(d.meta);
        });
    }

    return { saveDraft: saveDraft, clearPending: clearPending,
             savePending: savePending, finishBlob: finishBlob,
             restore: restore, pendDur: pendDur };
})();
