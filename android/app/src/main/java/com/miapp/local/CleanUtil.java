package com.miapp.local;

import android.content.Context;
import android.os.Environment;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

// Utilidades compartidas del limpiador (TribalCleanPlugin / CleanWalk /
// CleanDup): clasificación de carpetas prohibidas, magic bytes para
// detectar corruptos, borrado recursivo y tamaño de directorios.
final class CleanUtil {

    interface Prog { void tick(String dir, int found); }

    private CleanUtil() {}

    // carpetas que nunca se tocan: privadas de apps, basura del FS y restos
    // de Windows en la SD (misma regla que el escáner de medios)
    static boolean skipDir(String name) {
        if (name == null || name.isEmpty() || name.charAt(0) == '.') return true;
        String n = name.toLowerCase(Locale.US);
        return n.equals("android") || n.equals("lost.dir") ||
               n.equals("system volume information") || n.equals("$recycle.bin") ||
               n.equals("recycler") || n.equals("thumbnails");
    }

    // carpetas-basura conocidas: su contenido entero es candidato a limpieza
    static boolean junkDir(String name) {
        if (name == null) return false;
        String n = name.toLowerCase(Locale.US);
        return n.equals(".thumbnails") || n.equals("lost.dir") ||
               n.equals(".trash") || n.equals(".recycle");
    }

    static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return (i > 0 && i < name.length() - 1)
            ? name.substring(i + 1).toLowerCase(Locale.US) : "";
    }

    // magic bytes: solo declaramos "corrupto" cuando la firma esperada es
    // conocida y NO coincide (falso positivo ≈ imposible)
    static boolean headerOk(File f, String ext) {
        byte[] need = magic(ext);
        if (need == null) return true;                 // ext sin firma → OK
        byte[] got = new byte[need.length];
        try (FileInputStream in = new FileInputStream(f)) {
            if (in.read(got) < need.length) return false;
        } catch (Exception e) { return false; }
        for (int i = 0; i < need.length; i++)
            if (got[i] != need[i]) return false;
        return true;
    }

    private static byte[] magic(String ext) {
        switch (ext) {
            case "jpg": case "jpeg": return b(0xFF, 0xD8, 0xFF);
            case "png":  return b(0x89, 0x50, 0x4E, 0x47);
            case "gif":  return s("GIF8");
            case "bmp":  return s("BM");
            case "webp": case "wav": return s("RIFF");
            case "mp3":  return null;                   // ID3 o frame sync
            case "mp4": case "m4v": case "mov":
            case "3gp": case "m4a":  return null;       // ftyp va a offset 4
            case "pdf":  return s("%PDF");
            case "epub": case "zip": case "apk": return s("PK");
            case "flac": return s("fLaC");
            case "ogg": case "opus": case "oga": return s("OggS");
            default: return null;
        }
    }

    // mp4-family: la firma es "????ftyp" — comprobación aparte
    static boolean ftypOk(File f) {
        byte[] got = new byte[8];
        try (FileInputStream in = new FileInputStream(f)) {
            if (in.read(got) < 8) return false;
        } catch (Exception e) { return false; }
        return got[4] == 'f' && got[5] == 't' && got[6] == 'y' && got[7] == 'p';
    }

    // mp3: válido con tag ID3 o directo con frame sync 0xFF Ex
    static boolean mp3Ok(File f) {
        byte[] got = new byte[3];
        try (FileInputStream in = new FileInputStream(f)) {
            if (in.read(got) < 3) return false;
        } catch (Exception e) { return false; }
        if (got[0] == 'I' && got[1] == 'D' && got[2] == '3') return true;
        return (got[0] & 0xFF) == 0xFF && (got[1] & 0xE0) == 0xE0;
    }

    private static byte[] s(String x) { return x.getBytes(); }
    private static byte[] b(int... xs) {
        byte[] r = new byte[xs.length];
        for (int i = 0; i < xs.length; i++) r[i] = (byte) xs[i];
        return r;
    }

    // borra archivo o dir (recursivo) → bytes liberados
    static long del(File f) {
        long freed = 0;
        if (f == null || !f.exists()) return 0;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) freed += del(k);
        } else {
            freed = f.length();
        }
        try { if (f.delete()) return freed; } catch (Exception ignored) {}
        return 0;
    }

    static long dirSize(File d) {
        if (d == null || !d.exists()) return 0;
        if (d.isFile()) return d.length();
        long n = 0;
        File[] kids = d.listFiles();
        if (kids != null) for (File k : kids) n += dirSize(k);
        return n;
    }

    // Borrado masivo con protección: nunca nada bajo Android/data|obb —
    // aunque el JS lo pida, esas rutas no se tocan. Devuelve contadores.
    static long[] deleteList(List<String> paths) {
        long[] r = {0, 0, 0};   // deleted, failed, freed
        for (String p : paths) {
            if (p == null || p.isEmpty()) continue;
            String low = p.toLowerCase(Locale.US);
            if (low.contains("/android/data/") || low.contains("/android/obb/")) {
                r[1]++; continue;
            }
            File f = new File(p);
            long sz = f.isFile() ? f.length() : dirSize(f);
            if (del(f) > 0 || !f.exists()) { r[0]++; r[2] += sz; }
            else r[1]++;
        }
        return r;
    }

    // raíces escaneables: almacenamiento interno compartido + tarjeta SD /
    // USB (getExternalFilesDirs → 4 niveles arriba es la raíz del volumen)
    static List<File> roots(Context ctx) {
        List<File> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        File p = Environment.getExternalStorageDirectory();
        if (p != null && seen.add(p.getAbsolutePath())) out.add(p);
        try {
            for (File f : ctx.getExternalFilesDirs(null)) {
                if (f == null) continue;
                File r = f;
                for (int i = 0; i < 4 && r != null; i++) r = r.getParentFile();
                if (r != null && seen.add(r.getAbsolutePath())) out.add(r);
            }
        } catch (Throwable ignored) {}
        return out;
    }
}
