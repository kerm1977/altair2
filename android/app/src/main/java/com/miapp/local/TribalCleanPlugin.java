package com.miapp.local;

import android.os.Environment;
import android.os.StatFs;
import android.webkit.CookieManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Limpiador del dispositivo para TRIBALs (puente JS↔nativo).
//   storageInfo()                  → {total, free, cacheBytes}
//   scan({cats, checkCorrupt})     → {items:[{path,size,cat}], needAccess}
//   duplicates({minSize,maxGroups})→ {groups:[{size,paths[]}], wasted}
//   deleteFiles({paths[]})         → {deleted, failed, freed}
//   clearOwn()                     → caché propia + cookies del WebView
//   cancel()                       → corta el escaneo en curso
// Progreso real: eventos 'cleanProgress' {phase, dir, found}.
@CapacitorPlugin(name = "TribalClean")
public class TribalCleanPlugin extends Plugin {

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile boolean running = false;

    // ------------------------ estado del disco -----------------------------

    @PluginMethod
    public void storageInfo(PluginCall call) {
        StatFs st = new StatFs(Environment.getExternalStorageDirectory().getPath());
        JSObject r = new JSObject();
        r.put("total", st.getTotalBytes());
        r.put("free", st.getAvailableBytes());
        long cache = CleanUtil.dirSize(getContext().getCacheDir());
        File ext = getContext().getExternalCacheDir();
        if (ext != null) cache += CleanUtil.dirSize(ext);
        r.put("cacheBytes", cache);
        call.resolve(r);
    }

    // --------------------------- escaneo -----------------------------------

    @PluginMethod
    public void scan(PluginCall call) {
        if (running) { call.reject("ya hay un análisis en curso"); return; }
        cancelled = false; running = true;
        final boolean doCorrupt = call.getBoolean("checkCorrupt", true);
        final int cap = Math.max(100, call.getInt("maxItems", 20000));

        pool.execute(() -> {
            List<JSObject> out = new ArrayList<>();
            boolean[] listedAny = {false};
            try {
                CleanWalk.run(CleanUtil.roots(getContext()), doCorrupt,
                    () -> cancelled,
                    (dir, found) -> {
                        listedAny[0] = true;
                        JSObject p = new JSObject();
                        p.put("phase", "junk"); p.put("dir", dir);
                        p.put("found", out.size());
                        notifyListeners("cleanProgress", p);
                    },
                    (cat, f) -> {
                        if (out.size() >= cap) return;
                        JSObject o = new JSObject();
                        o.put("path", f.getAbsolutePath());
                        o.put("size", f.isFile() ? f.length() : CleanUtil.dirSize(f));
                        o.put("cat", cat);
                        o.put("name", f.getName());
                        out.add(o);
                    });
                JSObject res = new JSObject();
                res.put("items", new JSArray(out));
                res.put("cancelled", cancelled);
                res.put("needAccess", !listedAny[0] && out.isEmpty());
                call.resolve(res);
            } catch (Exception e) {
                call.reject("clean_scan_falló", e.getMessage());
            } finally { running = false; }
        });
    }

    // --------------------------- duplicados ---------------------------------

    @PluginMethod
    public void duplicates(PluginCall call) {
        if (running) { call.reject("ya hay un análisis en curso"); return; }
        cancelled = false; running = true;
        final long minSize = call.getLong("minSize", 300L * 1024);
        final int maxGroups = call.getInt("maxGroups", 400);

        pool.execute(() -> {
            List<JSObject> groups = new ArrayList<>();
            final long[] wasted = {0};
            try {
                CleanDup.run(CleanUtil.roots(getContext()), minSize, maxGroups,
                    () -> cancelled,
                    (dir, found) -> {
                        JSObject p = new JSObject();
                        p.put("phase", "dup"); p.put("dir", dir);
                        p.put("found", found);
                        notifyListeners("cleanProgress", p);
                    },
                    (size, paths) -> {
                        JSObject g = new JSObject();
                        g.put("size", size);
                        g.put("paths", new JSArray(paths));
                        groups.add(g);
                        wasted[0] += size * (paths.size() - 1);
                    });
                JSObject res = new JSObject();
                res.put("groups", new JSArray(groups));
                res.put("wasted", wasted[0]);
                res.put("cancelled", cancelled);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("dup_falló", e.getMessage());
            } finally { running = false; }
        });
    }

    // ---------------------------- borrado -----------------------------------

    @PluginMethod
    public void deleteFiles(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null) { call.reject("sin rutas"); return; }
        List<String> list = new ArrayList<>();
        try {
            for (int i = 0; i < paths.length(); i++) list.add(paths.getString(i));
        } catch (JSONException e) { call.reject("delete_falló", e.getMessage()); return; }
        pool.execute(() -> {
            long[] r = CleanUtil.deleteList(list);
            JSObject res = new JSObject();
            res.put("deleted", r[0]); res.put("failed", r[1]);
            res.put("freed", r[2]);
            call.resolve(res);
        });
    }

    // Caché propia + cookies del WebView de la app — lo único que una app
    // puede limpiar de sí misma sin root (las cookies de Chrome/otras apps
    // viven en sus carpetas privadas, inaccesibles por diseño)
    @PluginMethod
    public void clearOwn(PluginCall call) {
        long before = 0;
        before += CleanUtil.dirSize(getContext().getCacheDir());
        File ext = getContext().getExternalCacheDir();
        if (ext != null) before += CleanUtil.dirSize(ext);
        try {
            File[] kids = getContext().getCacheDir().listFiles();
            if (kids != null) for (File k : kids) CleanUtil.del(k);
            if (ext != null) {
                File[] ek = ext.listFiles();
                if (ek != null) for (File k : ek) CleanUtil.del(k);
            }
            CookieManager.getInstance().removeAllCookies(null);
            // NUNCA WebStorage.deleteAllData(): eso borra localStorage e
            // IndexedDB — el índice de la biblioteca, historial de
            // descargas, borradores de notas y el estado anti-crash. Eso
            // NO es caché, es la base de datos de la app.
            if (getBridge() != null && getBridge().getWebView() != null) {
                android.webkit.WebView wv = getBridge().getWebView();
                wv.clearCache(true);
                wv.clearFormData();
                wv.clearHistory();
            }
        } catch (Exception ignored) {}
        JSObject r = new JSObject();
        r.put("freed", before);
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }
}
