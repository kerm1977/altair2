package com.miapp.local;

// ============================================================================
// TribalDlPlugin — descargador de video/audio de internet (yt-dlp on-device)
//   · Usa youtubedl-android: yt-dlp + python + ffmpeg empaquetados en el APK.
//   · dlStart({url, audio}) → descarga a filesDir/tribu_dl/ y devuelve
//     {path, name, size}; el JS lo registra en la biblioteca por referencia.
//   · Progreso en vivo: evento "dlProgress" {pct, eta, line}.
//   · dlCancel() mata el proceso yt-dlp activo.
//   · Todo corre en un hilo de fondo — la UI nunca se congela.
// ============================================================================

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.ffmpeg.FFmpeg;

import kotlin.jvm.functions.Function3;
import kotlin.Unit;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TribalDl")
public class TribalDlPlugin extends Plugin {

    private volatile boolean init = false;
    private final ExecutorService ex = Executors.newSingleThreadExecutor();
    private volatile String procId = null;   // proceso yt-dlp activo

    // init perezoso: descomprime python+yt-dlp+ffmpeg la primera vez (~2-4 s)
    private void ensureInit() throws Exception {
        if (init) return;
        synchronized (this) {
            if (init) return;
            YoutubeDL.getInstance().init(getContext());
            FFmpeg.getInstance().init(getContext());
            init = true;
        }
    }

    @PluginMethod
    public void dlStart(PluginCall call) {
        final String url = call.getString("url", "");
        final boolean audio = Boolean.TRUE.equals(call.getBoolean("audio", false));
        if (url.isEmpty()) { call.reject("Falta la URL"); return; }

        ex.execute(() -> {
            File out = null;
            try {
                notifyProg(-1, -1, "preparando motor yt-dlp…");
                ensureInit();

                File dir = new File(getContext().getFilesDir(), "tribu_dl");
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                long before = System.currentTimeMillis();

                YoutubeDLRequest req = new YoutubeDLRequest(url);
                req.addOption("--no-playlist");
                req.addOption("--no-mtime");
                req.addOption("--restrict-filenames");
                req.addOption("--newline");
                req.addOption("-o", dir.getAbsolutePath() + "/%(title)s.%(ext)s");
                if (audio) {
                    req.addOption("-x");
                    req.addOption("--audio-format", "mp3");
                    req.addOption("--audio-quality", "0");
                } else {
                    // mejor calidad ≤1080p con audio; fallback al mejor unificado
                    req.addOption("-f",
                        "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b");
                    req.addOption("--merge-output-format", "mp4");
                }

                procId = "dl_" + System.currentTimeMillis();
                // el callback es kotlin.Function3<Float, Long, String, Unit>
                YoutubeDL.getInstance().execute(req, procId,
                    new Function3<Float, Long, String, Unit>() {
                        public Unit invoke(Float progress, Long eta, String line) {
                            notifyProg(progress == null ? -1 : progress,
                                       eta == null ? -1 : eta, line);
                            return Unit.INSTANCE;
                        }
                    });
                procId = null;

                // el archivo descargado = el más nuevo del directorio
                out = newest(dir, before);
                if (out == null) {
                    call.reject("yt-dlp terminó sin dejar archivo");
                    return;
                }
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("name", out.getName());
                r.put("size", out.length());
                call.resolve(r);
            } catch (Exception e) {
                procId = null;
                call.reject(cleanErr(e));
            }
        });
    }

    @PluginMethod
    public void dlCancel(PluginCall call) {
        String id = procId;
        if (id != null) {
            try { YoutubeDL.getInstance().destroyProcessById(id); }
            catch (Exception ignored) {}
        }
        call.resolve();
    }

    // ------------------------------------------------------------- helpers
    private void notifyProg(float pct, long eta, String line) {
        JSObject d = new JSObject();
        d.put("pct", pct);
        d.put("eta", eta);
        d.put("line", line == null ? "" : line);
        notifyListeners("dlProgress", d);
    }

    private static File newest(File dir, long since) {
        File[] fs = dir.listFiles();
        if (fs == null) return null;
        File best = null;
        for (File f : fs) {
            if (!f.isFile() || f.lastModified() < since - 5000) continue;
            if (f.getName().endsWith(".part")) continue;
            if (best == null || f.lastModified() > best.lastModified()) best = f;
        }
        return best;
    }

    // yt-dlp devuelve trazas enormes — quedarnos con la línea útil
    private static String cleanErr(Exception e) {
        String m = String.valueOf(e.getMessage());
        String[] lines = m.split("\\r?\\n");
        for (String l : lines) {
            if (l.contains("ERROR:")) return l.trim();
        }
        return m.length() > 300 ? m.substring(m.length() - 300) : m;
    }
}
