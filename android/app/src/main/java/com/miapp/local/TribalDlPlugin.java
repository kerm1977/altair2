package com.miapp.local;

// ============================================================================
// TribalDlPlugin — descargador de video/audio de internet (yt-dlp on-device)
//   · Usa youtubedl-android: yt-dlp + python + ffmpeg empaquetados en el APK.
//   · dlStart({url, audio, playlist}) → descarga a filesDir/tribu_dl/ y
//     devuelve {count, files:[{path,name,size}]} — el JS los registra en la
//     biblioteca por referencia. playlist=true baja la lista completa.
//   · Progreso en vivo: evento "dlProgress" {pct, eta, line}.
//   · dlCancel() mata el proceso yt-dlp activo.
//   · dlDelete({path}) borra un archivo de tribu_dl (y solo de ahí).
//   · dlDir() devuelve la ruta donde se guardan las descargas.
//   · Todo corre en un hilo de fondo — la UI nunca se congela.
// ============================================================================

import com.getcapacitor.JSArray;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TribalDl")
public class TribalDlPlugin extends Plugin {

    private volatile boolean init = false;
    private final ExecutorService ex = Executors.newSingleThreadExecutor();
    private volatile String procId = null;   // proceso yt-dlp activo

    // init perezoso: descomprime python+yt-dlp+ffmpeg la primera vez
    // (puede tardar bastante — el JS muestra heartbeat mientras)
    private void ensureInit() throws Exception {
        if (init) return;
        synchronized (this) {
            if (init) return;
            notifyProg(-1, -1, "desempaquetando motor (solo la 1ª vez)…");
            YoutubeDL.getInstance().init(getContext());
            FFmpeg.getInstance().init(getContext());
            init = true;
        }
    }

    private File dlDirFile() {
        File dir = new File(getContext().getFilesDir(), "tribu_dl");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void dlStart(PluginCall call) {
        final String url = call.getString("url", "");
        final boolean audio = Boolean.TRUE.equals(call.getBoolean("audio", false));
        final boolean playlist =
            Boolean.TRUE.equals(call.getBoolean("playlist", false));
        if (url.isEmpty()) { call.reject("Falta la URL"); return; }

        ex.execute(() -> {
            try {
                notifyProg(-1, -1, "preparando motor yt-dlp…");
                ensureInit();

                File dir = dlDirFile();
                long before = System.currentTimeMillis();

                YoutubeDLRequest req = new YoutubeDLRequest(url);
                req.addOption(playlist ? "--yes-playlist" : "--no-playlist");
                req.addOption("--no-mtime");
                req.addOption("--restrict-filenames");
                req.addOption("--newline");
                req.addOption("--retries", "3");
                req.addOption("--fragment-retries", "3");
                // YouTube bloquea seguido el cliente web (HTTP 403); el
                // cliente android suele esquivarlo. Solo afecta al extractor
                // de youtube — el resto de sitios ignora el arg.
                req.addOption("--extractor-args",
                    "youtube:player_client=android,ios");
                // en playlist el índice mantiene el orden del autor
                req.addOption("-o", dir.getAbsolutePath() + "/" +
                    (playlist ? "%(playlist_index)s-%(title)s.%(ext)s"
                              : "%(title)s.%(ext)s"));
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
                final List<String> lines = new ArrayList<>();
                YoutubeDL.getInstance().execute(req, procId,
                    new Function3<Float, Long, String, Unit>() {
                        public Unit invoke(Float progress, Long eta, String line) {
                            if (line != null && !line.isEmpty())
                                lines.add(line);
                            notifyProg(progress == null ? -1 : progress,
                                       eta == null ? -1 : eta, line);
                            return Unit.INSTANCE;
                        }
                    });
                procId = null;

                // (a) archivos nuevos por mtime; (b) si yt-dlp dijo "ya se
                // había descargado" / "Destination:", el archivo ya existía
                // — lo devolvemos igual para registrarlo en la biblioteca
                List<File> news = newsSince(dir, before);
                for (String l : lines) {
                    File f = destFile(dir, l);
                    if (f != null && !news.contains(f)) news.add(f);
                }
                if (news.isEmpty()) {
                    String t = tail(lines, 6);
                    call.reject("yt-dlp terminó sin dejar archivo"
                        + (t.isEmpty() ? "" : " — " + t));
                    return;
                }
                JSArray arr = new JSArray();
                for (File f : news) {
                    JSObject o = new JSObject();
                    o.put("path", f.getAbsolutePath());
                    o.put("name", f.getName());
                    o.put("size", f.length());
                    arr.put(o);
                }
                JSObject r = new JSObject();
                r.put("count", news.size());
                r.put("files", arr);
                // compat: primer archivo también suelto
                r.put("path", news.get(0).getAbsolutePath());
                r.put("name", news.get(0).getName());
                r.put("size", news.get(0).length());
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

    // borra SOLO dentro de tribu_dl — nunca acepta una ruta de fuera
    @PluginMethod
    public void dlDelete(PluginCall call) {
        String p = call.getString("path", "");
        try {
            File dir = dlDirFile().getCanonicalFile();
            File f = new File(p).getCanonicalFile();
            if (!f.getAbsolutePath()
                    .startsWith(dir.getAbsolutePath() + File.separator)) {
                call.reject("la ruta no está dentro de las descargas");
                return;
            }
            boolean ok = !f.exists() || f.delete();
            JSObject r = new JSObject();
            r.put("ok", ok);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    // yt-dlp se desactualiza rápido (los sitios cambian y el motor viejo
    // empieza a fallar con 403/«unable to download») — actualización en
    // caliente del binario python: estable por defecto, nightly si lo piden.
    @PluginMethod
    public void dlUpdate(PluginCall call) {
        final String ch = call.getString("channel", "stable");
        ex.execute(() -> {
            try {
                ensureInit();
                notifyProg(-1, -1, "actualizando yt-dlp (" + ch + ")…");
                YoutubeDL.UpdateChannel c = "nightly".equals(ch)
                    ? YoutubeDL.UpdateChannel._NIGHTLY
                    : YoutubeDL.UpdateChannel._STABLE;
                YoutubeDL.UpdateStatus st =
                    YoutubeDL.getInstance().updateYoutubeDL(getContext(), c);
                JSObject r = new JSObject();
                r.put("status", String.valueOf(st));
                r.put("channel", ch);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(cleanErr(e));
            }
        });
    }

    @PluginMethod
    public void dlDir(PluginCall call) {
        JSObject r = new JSObject();
        r.put("dir", dlDirFile().getAbsolutePath());
        call.resolve(r);
    }

    // ------------------------------------------------------------- helpers
    private void notifyProg(float pct, long eta, String line) {
        JSObject d = new JSObject();
        d.put("pct", pct);
        d.put("eta", eta);
        d.put("line", line == null ? "" : line);
        notifyListeners("dlProgress", d);
    }

    private static List<File> newsSince(File dir, long since) {
        File[] fs = dir.listFiles();
        List<File> out = new ArrayList<>();
        if (fs == null) return out;
        for (File f : fs) {
            if (!f.isFile() || f.lastModified() < since - 5000) continue;
            if (f.getName().endsWith(".part")
                || f.getName().endsWith(".ytdl")) continue;
            out.add(f);
        }
        out.sort(Comparator.comparingLong(File::lastModified));
        return out;
    }

    // líneas de yt-dlp que nombran el archivo de destino (ya existente o
    // recién escrito) — solo aceptamos rutas dentro de tribu_dl
    private static File destFile(File dir, String line) {
        String p = null;
        int d = line.indexOf("Destination: ");
        if (d >= 0) p = line.substring(d + 13).trim();
        int a = line.indexOf(" has already been downloaded");
        if (a > 0 && line.startsWith("[download]"))
            p = line.substring(10, a).trim();
        int m = line.indexOf("Merging formats into \"");
        if (m >= 0) {
            int e = line.indexOf('"', m + 22);
            if (e > m + 22) p = line.substring(m + 22, e);
        }
        if (p == null || p.isEmpty()) return null;
        try {
            File f = new File(p).getCanonicalFile();
            if (f.isFile() && f.getAbsolutePath().startsWith(
                    dir.getCanonicalFile().getAbsolutePath()
                        + File.separator)) return f;
        } catch (Exception ignored) {}
        return null;
    }

    // las últimas líneas del motor — para que el error diga el porqué
    private static String tail(List<String> ls, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = Math.max(0, ls.size() - n); i < ls.size(); i++) {
            String l = ls.get(i).trim();
            if (l.isEmpty()) continue;
            if (b.length() > 0) b.append(" | ");
            b.append(l);
        }
        return b.length() > 400 ? b.substring(b.length() - 400) : b.toString();
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
