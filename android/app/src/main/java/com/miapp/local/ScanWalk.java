package com.miapp.local;

import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;

import java.io.File;
import java.util.List;
import java.util.Set;

// Recorrido recursivo del escáner de medios: clasifica por extensión
// (ScanKinds), respeta límites por sección y reporta progreso real.
// El plugin decide qué hacer con cada hallazgo vía el Sink.
final class ScanWalk {

    interface Sink { void on(JSObject item); }
    interface Flag { boolean cancelled(); }
    interface Prog { void tick(String dir, int found); }

    private ScanWalk() {}

    static void run(List<File> roots, Set<String> wanted, int cap,
                    Flag flag, Prog prog, Sink sink, boolean[] listedAny) {
        int[] perKind = new int[5];
        int[] found = {0};
        long[] lastTick = {0};
        for (File root : roots) {
            if (flag.cancelled()) return;
            walk(root, wanted, cap, flag, prog, sink, perKind, found,
                 lastTick, listedAny, 0);
        }
    }

    private static void walk(File dir, Set<String> wanted, int cap,
                             Flag flag, Prog prog, Sink sink,
                             int[] perKind, int[] found, long[] lastTick,
                             boolean[] listedAny, int depth) {
        if (flag.cancelled() || dir == null || depth > 14) return;
        File[] kids;
        try { kids = dir.listFiles(); } catch (SecurityException se) { return; }
        if (kids == null) return;
        listedAny[0] = true;

        for (File k : kids) {
            if (flag.cancelled()) return;
            if (k.isDirectory()) {
                if (!ScanKinds.skipDir(k.getName()))
                    walk(k, wanted, cap, flag, prog, sink, perKind, found,
                         lastTick, listedAny, depth + 1);
                continue;
            }
            String ext = ScanKinds.extOf(k.getName());
            if (ext.isEmpty()) continue;
            String kind = ScanKinds.kindOf(ext);
            if (kind == null || !wanted.contains(kind)) continue;
            int ki = ScanKinds.kindIndex(kind);
            if (perKind[ki] >= cap) continue;
            long len = k.length();
            if (len < ScanKinds.minSize(kind)) continue;

            JSObject o = new JSObject();
            o.put("path", k.getAbsolutePath());
            o.put("name", k.getName());
            o.put("size", len);
            o.put("mtime", k.lastModified());
            o.put("kind", kind);
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            o.put("mime", mime != null ? mime : "");
            sink.on(o);
            perKind[ki]++;
            found[0]++;

            long now = System.currentTimeMillis();
            if (now - lastTick[0] > 400) {
                lastTick[0] = now;
                prog.tick(dir.getAbsolutePath(), found[0]);
            }
        }
    }
}
