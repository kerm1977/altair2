package com.miapp.local;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Recorre el almacenamiento clasificando BASURA en categorías:
//   tmp     — temporales/logs/backups (.tmp .log .bak .old .dmp thumbs.db…)
//   partial — descargas incompletas (.crdownload .partial .part .download…)
//   empty   — archivos de 0 bytes y carpetas vacías
//   apk     — instaladores olvidados fuera de las carpetas del sistema
//   corrupt — firma/magic bytes no coincide con la extensión que declara
// Cada hallazgo se emite al Sink como (cat, File) — el plugin decide.
final class CleanWalk {

    interface Sink { void on(String cat, File f); }
    interface Flag { boolean cancelled(); }

    private static final Set<String> TMP_EXT = new HashSet<>(Arrays.asList(
        "tmp","temp","log","bak","old","dmp","chk","cache","gid","swap"));
    private static final Set<String> TMP_NAME = new HashSet<>(Arrays.asList(
        "thumbs.db",".ds_store","desktop.ini","ehthumbs.db",".nomedia_junk"));
    private static final Set<String> PARTIAL_EXT = new HashSet<>(Arrays.asList(
        "crdownload","partial","part","download","opdownload","!qb","bc!"));
    // solo a estos se les verifica la firma — los demás no pueden saberse
    private static final Set<String> CHECK_EXT = new HashSet<>(Arrays.asList(
        "jpg","jpeg","png","gif","bmp","webp","wav","mp3","flac","ogg",
        "opus","mp4","m4v","mov","3gp","m4a","pdf","epub","zip","apk"));

    private CleanWalk() {}

    static void run(List<File> roots, boolean checkCorrupt,
                    Flag flag, CleanUtil.Prog prog, Sink sink) {
        for (File root : roots) {
            if (flag.cancelled()) return;
            walk(root, checkCorrupt, flag, prog, sink, 0);
        }
    }

    private static void walk(File dir, boolean checkCorrupt,
                             Flag flag, CleanUtil.Prog prog,
                             Sink sink, int depth) {
        if (flag.cancelled() || dir == null || depth > 14) return;
        File[] kids;
        try { kids = dir.listFiles(); } catch (SecurityException se) { return; }
        if (kids == null) return;

        prog.tick(dir.getAbsolutePath(), kids.length);

        // directorio-basura entero (.thumbnails, LOST.DIR…): se reporta una
        // vez con todo su contenido — el borrado es recursivo
        if (CleanUtil.junkDir(dir.getName())) {
            sink.on("tmp", dir);
            return;
        }
        if (kids.length == 0) {
            if (depth > 0) sink.on("empty", dir);   // carpeta vacía
            return;
        }

        for (File k : kids) {
            if (flag.cancelled()) return;
            if (k.isDirectory()) {
                if (!CleanUtil.skipDir(k.getName()) || CleanUtil.junkDir(k.getName()))
                    walk(k, checkCorrupt, flag, prog, sink, depth + 1);
                continue;
            }
            classify(k, checkCorrupt, sink);
        }
    }

    private static void classify(File f, boolean checkCorrupt, Sink sink) {
        String name = f.getName();
        String ext = CleanUtil.extOf(name);
        long len = f.length();

        if (len == 0) { sink.on("empty", f); return; }
        if (TMP_EXT.contains(ext) || TMP_NAME.contains(
                name.toLowerCase(java.util.Locale.US))) {
            sink.on("tmp", f); return;
        }
        if (PARTIAL_EXT.contains(ext)) { sink.on("partial", f); return; }
        if (ext.equals("apk")) { sink.on("apk", f); return; }
        if (!checkCorrupt || !CHECK_EXT.contains(ext)) return;

        boolean ok;
        if (ext.equals("mp3")) ok = CleanUtil.mp3Ok(f);
        else if (ext.equals("mp4") || ext.equals("m4v") || ext.equals("mov") ||
                 ext.equals("3gp") || ext.equals("m4a")) ok = CleanUtil.ftypOk(f);
        else ok = CleanUtil.headerOk(f, ext);
        if (!ok) sink.on("corrupt", f);
    }
}
