package com.miapp.local;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Escáner de archivos del dispositivo para TRIBALs.
//   Capacitor.Plugins.TribalScan.scan({kinds:['audio','video','image','doc']})
//       → recorre el almacenamiento externo (interno + SD) clasificando por
//         extensión; devuelve {files:[{path,name,size,mime,kind,mtime}],…}
//         o {needAccess:true} si Android no deja leer (falta MANAGE_STORAGE).
//   Capacitor.Plugins.TribalScan.openLocation({path})
//       → abre la carpeta contenedora en el gestor de archivos del sistema
//   Capacitor.Plugins.TribalScan.exists({path}) → {exists:true|false}
//   Capacitor.Plugins.TribalScan.cancel() → corta el escaneo en curso
//
// Las rutas son REALES (/storage/…): el JS las guarda como meta.ref sin
// copiar el archivo — cero duplicados en disco y "abrir en la ruta" exacto.
@CapacitorPlugin(name = "TribalScan")
public class TribalScanPlugin extends Plugin {

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile boolean running = false;

    // ------------------------- clasificación -------------------------------

    private static final Set<String> EXT_AUDIO = setOf(
        "mp3","mpga","mp2","mpa","m4a","m4b","m4p","m4r","aac","wav","wave",
        "ogg","oga","opus","spx","flac","weba","wma","amr","3ga","aiff","aif",
        "aifc","mka","caf","alac","ape","wv","mid","midi","kar","pcm","au","ra");
    private static final Set<String> EXT_VIDEO = setOf(
        "mp4","m4v","webm","mkv","mov","avi","3gp","3g2","wmv","flv","ts","mpg","mpeg");
    private static final Set<String> EXT_IMAGE = setOf(
        "jpg","jpeg","png","gif","webp","bmp","svg","heic","heif","avif","tif","tiff");
    private static final Set<String> EXT_DOC = setOf(
        "pdf","epub","txt","md","rtf","doc","docx","xls","xlsx","ppt","pptx",
        "odt","ods","odp","csv","json","html","htm");
    private static final Set<String> EXT_OTHER = setOf(
        "zip","rar","7z","tar","gz","apk","xml","log","ini","cfg","srt","sub");

    private static Set<String> setOf(String... xs) {
        Set<String> s = new LinkedHashSet<>();
        for (String x : xs) s.add(x);
        return s;
    }

    // carpetas que nunca se recorren: privadas de otras apps, basura del
    // sistema de archivos y restos de Windows en SD
    private static boolean skipDir(String name) {
        if (name == null || name.isEmpty() || name.charAt(0) == '.') return true;
        String n = name.toLowerCase(Locale.US);
        return n.equals("android") || n.equals("lost.dir") ||
               n.equals("system volume information") || n.equals("$recycle.bin") ||
               n.equals("recycler") || n.equals("thumbnails");
    }

    // tamaños mínimos: filtran notificaciones/tonos del sistema, miniaturas
    // y residuos que no interesan como biblioteca
    private static long minSize(String kind) {
        switch (kind) {
            case "image": return 20 * 1024;      // 20 KB — stickers/íconos fuera
            case "audio": return 200 * 1024;     // 200 KB — beeps de sistema fuera
            case "video": return 500 * 1024;     // 500 KB
            case "doc":   return 512;            // 0.5 KB
            default:      return 1024;
        }
    }

    private static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return (i > 0 && i < name.length() - 1)
            ? name.substring(i + 1).toLowerCase(Locale.US) : "";
    }

    private static String kindOf(String ext) {
        if (EXT_AUDIO.contains(ext)) return "audio";
        if (EXT_VIDEO.contains(ext)) return "video";
        if (EXT_IMAGE.contains(ext)) return "image";
        if (EXT_DOC.contains(ext))   return "doc";
        if (EXT_OTHER.contains(ext)) return "other";
        return null;
    }

    // --------------------------- escaneo -----------------------------------

    @PluginMethod
    public void scan(PluginCall call) {
        if (running) { call.reject("ya hay un escaneo en curso"); return; }
        cancelled = false;
        running = true;

        Set<String> kinds = new LinkedHashSet<>();
        JSArray ks = call.getArray("kinds");
        if (ks != null) {
            try {
                for (int i = 0; i < ks.length(); i++) kinds.add(ks.getString(i));
            } catch (JSONException ignored) {}
        }
        if (kinds.isEmpty()) {
            kinds.add("audio"); kinds.add("video");
            kinds.add("image"); kinds.add("doc");
        }
        final Set<String> wanted = kinds;
        final int cap = Math.max(50, call.getInt("maxPerKind", 5000));

        pool.execute(() -> {
            List<JSObject> out = new ArrayList<>();
            int[] perKind = new int[5]; // audio video image doc other
            long[] lastNotify = {0};
            boolean[] listedAny = {false};
            try {
                for (File root : storageRoots()) {
                    if (cancelled) break;
                    walk(root, wanted, cap, out, perKind, lastNotify, listedAny, 0);
                }
                JSObject res = new JSObject();
                res.put("files", new JSArray(out.toArray()));
                res.put("cancelled", cancelled);
                // no pudimos listar ni una raíz → falta acceso total
                res.put("needAccess", !listedAny[0] && out.isEmpty());
                call.resolve(res);
            } catch (Exception e) {
                call.reject("scan_falló", e.getMessage());
            } finally {
                running = false;
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    // raíces escaneables: almacenamiento interno compartido + tarjeta SD /
    // USB. La SD se deduce de getExternalFilesDirs (…/Android/data/pkg/files
    // → 4 niveles arriba es la raíz del volumen).
    private List<File> storageRoots() {
        List<File> roots = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        File primary = Environment.getExternalStorageDirectory();
        if (primary != null && seen.add(primary.getAbsolutePath()))
            roots.add(primary);
        try {
            for (File f : getContext().getExternalFilesDirs(null)) {
                if (f == null) continue;
                File r = f;
                for (int i = 0; i < 4 && r != null; i++) r = r.getParentFile();
                if (r != null && seen.add(r.getAbsolutePath())) roots.add(r);
            }
        } catch (Throwable ignored) {}
        return roots;
    }

    private void walk(File dir, Set<String> wanted, int cap,
                      List<JSObject> out, int[] perKind,
                      long[] lastNotify, boolean[] listedAny, int depth) {
        if (cancelled || dir == null || depth > 14) return;
        File[] kids;
        try { kids = dir.listFiles(); } catch (SecurityException se) { return; }
        if (kids == null) return;
        listedAny[0] = true;

        for (File k : kids) {
            if (cancelled) return;
            if (k.isDirectory()) {
                if (!skipDir(k.getName()))
                    walk(k, wanted, cap, out, perKind, lastNotify, listedAny, depth + 1);
                continue;
            }
            String ext = extOf(k.getName());
            if (ext.isEmpty()) continue;
            String kind = kindOf(ext);
            if (kind == null || !wanted.contains(kind)) continue;
            int ki = kind.equals("audio") ? 0 : kind.equals("video") ? 1 :
                     kind.equals("image") ? 2 : kind.equals("doc") ? 3 : 4;
            if (perKind[ki] >= cap) continue;
            long len = k.length();
            if (len < minSize(kind)) continue;

            JSObject o = new JSObject();
            o.put("path", k.getAbsolutePath());
            o.put("name", k.getName());
            o.put("size", len);
            o.put("mtime", k.lastModified());
            o.put("kind", kind);
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            o.put("mime", mime != null ? mime : "");
            out.add(o);
            perKind[ki]++;

            long now = System.currentTimeMillis();
            if (now - lastNotify[0] > 400) {
                lastNotify[0] = now;
                JSObject p = new JSObject();
                p.put("found", out.size());
                p.put("dir", dir.getAbsolutePath());
                notifyListeners("scanProgress", p);
            }
        }
    }

    // --------------------- abrir en la ruta --------------------------------

    @PluginMethod
    public void openLocation(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("sin ruta"); return; }
        File f = new File(path);
        File dir = f.isDirectory() ? f : f.getParentFile();
        if (dir == null) { call.reject("sin carpeta"); return; }

        // 1) gestores tipo Samsung My Files / Material Files aceptan
        //    file:// + "resource/folder"
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.fromFile(dir), "resource/folder");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("opened", true); r.put("via", "folder");
            call.resolve(r); return;
        } catch (ActivityNotFoundException ignored) {}

        // 2) variante document/directory (Files by Google y otros)
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.fromFile(dir), "vnd.android.document/directory");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("opened", true); r.put("via", "document");
            call.resolve(r); return;
        } catch (ActivityNotFoundException ignored) {}

        // 3) selector SAF de carpeta — universal aunque pide confirmación
        try {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject(); r.put("opened", true); r.put("via", "picker");
            call.resolve(r); return;
        } catch (ActivityNotFoundException ignored) {}

        JSObject r = new JSObject(); r.put("opened", false);
        call.resolve(r);
    }

    @PluginMethod
    public void exists(PluginCall call) {
        String path = call.getString("path");
        JSObject r = new JSObject();
        r.put("exists", path != null && new File(path).isFile());
        call.resolve(r);
    }
}
