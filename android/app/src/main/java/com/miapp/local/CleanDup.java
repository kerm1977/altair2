package com.miapp.local;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Buscador de duplicados real: dos pasadas.
//   1) agrupa por tamaño exacto (gratis) — los grupos de 1 se descartan
//   2) solo los que coinciden en tamaño se hashean en MD5 — el hash decide
// Emite grupos {size, paths[]} por el Sink; el JS decide cuál conservar.
final class CleanDup {

    interface Sink { void group(long size, List<String> paths); }
    interface CancelFlag { boolean cancelled(); }

    private CleanDup() {}

    static void run(List<File> roots, long minSize, int maxGroups,
                    CancelFlag flag, CleanUtil.Prog prog, Sink sink) {
        Map<Long, List<File>> bySize = new HashMap<>();
        int[] count = {0};
        long[] lastTick = {0};
        for (File root : roots) {
            if (flag.cancelled()) return;
            collect(root, minSize, bySize, flag, prog, count, lastTick);
        }
        // segunda pasada: hash solo de los que comparten tamaño
        Map<String, List<String>> byHash = new HashMap<>();
        for (Map.Entry<Long, List<File>> e : bySize.entrySet()) {
            if (flag.cancelled()) return;
            if (e.getValue().size() < 2) continue;
            for (File f : e.getValue()) {
                if (flag.cancelled()) return;
                String h = md5(f);
                if (h == null) continue;
                String key = e.getKey() + "|" + h;
                byHash.computeIfAbsent(key, k -> new ArrayList<>())
                      .add(f.getAbsolutePath());
            }
        }
        int emitted = 0;
        for (Map.Entry<String, List<String>> e : byHash.entrySet()) {
            List<String> g = e.getValue();
            if (g.size() < 2) continue;
            long size = Long.parseLong(e.getKey().substring(0, e.getKey().indexOf('|')));
            sink.group(size, g);
            if (++emitted >= maxGroups) return;
        }
    }

    private static void collect(File dir, long minSize,
                                Map<Long, List<File>> map, CancelFlag flag,
                                CleanUtil.Prog prog, int[] count,
                                long[] lastTick) {
        if (flag.cancelled() || dir == null) return;
        File[] kids;
        try { kids = dir.listFiles(); } catch (SecurityException se) { return; }
        if (kids == null) return;
        for (File k : kids) {
            if (flag.cancelled()) return;
            if (k.isDirectory()) {
                if (!CleanUtil.skipDir(k.getName()))
                    collect(k, minSize, map, flag, prog, count, lastTick);
                continue;
            }
            long len = k.length();
            if (len < minSize) continue;
            map.computeIfAbsent(len, s -> new ArrayList<>()).add(k);
            count[0]++;
            long now = System.currentTimeMillis();
            if (now - lastTick[0] > 400) {
                lastTick[0] = now;
                prog.tick(dir.getAbsolutePath(), count[0]);
            }
        }
    }

    private static String md5(File f) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            }
            byte[] d = md.digest();
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { return null; }
    }
}
