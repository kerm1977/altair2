package com.miapp.local;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

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
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Escáner de archivos del dispositivo para TRIBALs.
//   scan({kinds, maxPerKind})  → {files:[{path,name,size,mime,kind,mtime}]}
//   openLocation({path})       → carpeta contenedora en el gestor del sistema
//   exists({path})             → {exists}
//   cancel()                   → corta el escaneo en curso
// La clasificación vive en ScanKinds y el recorrido en ScanWalk; las rutas
// son REALES (/storage/…) — el JS las indexa por referencia (meta.ref),
// sin copiar ni duplicar en disco.
@CapacitorPlugin(name = "TribalScan")
public class TribalScanPlugin extends Plugin {

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile boolean running = false;

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
            boolean[] listedAny = {false};
            try {
                ScanWalk.run(CleanUtil.roots(getContext()), wanted, cap,
                    () -> cancelled,
                    (dir, found) -> {
                        JSObject p = new JSObject();
                        p.put("found", found); p.put("dir", dir);
                        notifyListeners("scanProgress", p);
                    },
                    out::add, listedAny);
                JSObject res = new JSObject();
                res.put("files", new JSArray(out));
                res.put("cancelled", cancelled);
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

    // "Abrir en la ruta": la carpeta contenedora en el gestor de archivos.
    // Se intentan tres vías — cada fabricante atiende una distinta.
    @PluginMethod
    public void openLocation(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("sin ruta"); return; }
        File f = new File(path);
        File dir = f.isDirectory() ? f : f.getParentFile();
        if (dir == null) { call.reject("sin carpeta"); return; }

        String[] mimes = {"resource/folder", "vnd.android.document/directory"};
        for (String m : mimes) {                       // My Files / Files…
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.fromFile(dir), m);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject r = new JSObject();
                r.put("opened", true); r.put("via", m);
                call.resolve(r); return;
            } catch (ActivityNotFoundException ignored) {}
        }
        try {                                          // selector SAF — universal
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject r = new JSObject();
            r.put("opened", true); r.put("via", "picker");
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
