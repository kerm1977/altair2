package com.miapp.local;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * TribalFtp — mini servidor HTTP en la LAN (estilo FTP web tribal).
 *   GET  /            → interfaz tribal (assets public/ftp/index.html)
 *   GET  /ftp/x       → css/js de esa interfaz
 *   GET  /api/list    → catálogo JSON que la app empuja con setCatalog()
 *   GET  /dl?p=…&n=…  → descarga un archivo (builtin asset o tribu_media)
 *   POST /up?n=…      → sube un archivo a files/tribu_inbox → evento tribalInbox
 */
@CapacitorPlugin(name = "TribalFtp")
public class TribalFtpPlugin extends Plugin {
    private static final int PORT = 8765;
    private ServerSocket srv;
    private ExecutorService pool;
    private volatile String catalog = "[]";

    @PluginMethod
    public void start(PluginCall c) {
        try {
            if (srv == null || srv.isClosed()) {
                srv = new ServerSocket();
                srv.setReuseAddress(true);
                srv.bind(new InetSocketAddress(PORT));
                pool = Executors.newCachedThreadPool();
                pool.execute(this::acceptLoop);
            }
            c.resolve(info());
        } catch (Exception e) { c.reject("ftp start: " + e.getMessage()); }
    }

    @PluginMethod
    public void stop(PluginCall c) {
        try { if (srv != null) srv.close(); } catch (Exception ignored) {}
        srv = null;
        if (pool != null) pool.shutdownNow();
        c.resolve(info());
    }

    @PluginMethod public void status(PluginCall c) { c.resolve(info()); }

    @PluginMethod
    public void setCatalog(PluginCall c) {
        String j = c.getString("json");
        if (j != null) catalog = j;
        c.resolve();
    }

    private JSObject info() {
        JSObject r = new JSObject();
        r.put("running", srv != null && !srv.isClosed());
        r.put("url", "http://" + lanIp() + ":" + PORT);
        return r;
    }

    private String lanIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress a : Collections.list(ni.getInetAddresses()))
                    if (!a.isLoopbackAddress() && a instanceof Inet4Address)
                        return a.getHostAddress();
        } catch (Exception ignored) {}
        return "127.0.0.1";
    }

    private void acceptLoop() {
        try {
            while (srv != null && !srv.isClosed()) {
                final Socket s = srv.accept();
                pool.execute(new Runnable() { public void run() { handle(s); } });
            }
        } catch (Exception ignored) {}
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(30000);
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            ByteArrayOutputStream headBuf = new ByteArrayOutputStream();
            int b, nl = 0;                                    // cabeceras hasta línea vacía
            while ((b = in.read()) != -1) {
                headBuf.write(b);
                if (b == '\n') { if (++nl >= 2) break; }
                else if (b != '\r') nl = 0;
            }
            String[] hs = headBuf.toString("UTF-8").split("\n");
            if (hs.length == 0) { s.close(); return; }
            String[] req = hs[0].trim().split(" ");
            if (req.length < 2) { s.close(); return; }
            int q = req[1].indexOf('?');
            String path = URLDecoder.decode(q < 0 ? req[1] : req[1].substring(0, q), "UTF-8");
            Map<String, String> qs = new HashMap<>();
            if (q >= 0) for (String kv : req[1].substring(q + 1).split("&")) {
                int e = kv.indexOf('=');
                if (e > 0) qs.put(kv.substring(0, e), URLDecoder.decode(kv.substring(e + 1), "UTF-8"));
            }
            long bodyLen = 0;
            for (int i = 1; i < hs.length; i++) {
                String h = hs[i].trim().toLowerCase();
                if (h.startsWith("content-length:")) bodyLen = Long.parseLong(h.substring(15).trim());
            }
            if (path.equals("/")) sendAsset(out, "public/ftp/index.html", "text/html; charset=utf-8");
            else if (path.startsWith("/ftp/")) sendAsset(out, "public" + path, mimeOf(path));
            else if (path.equals("/api/list")) sendBytes(out, catalog.getBytes("UTF-8"), "application/json; charset=utf-8", 200);
            else if (path.equals("/dl")) sendFile(out, qs.get("p"), qs.get("n"));
            else if (path.equals("/up")) recvUpload(in, out, qs.get("n"), bodyLen);
            else sendBytes(out, "no encontrado".getBytes("UTF-8"), "text/plain; charset=utf-8", 404);
            s.close();
        } catch (Exception e) { try { s.close(); } catch (Exception ignored) {} }
    }

    private String mimeOf(String p) {
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
        return "application/octet-stream";
    }

    private void sendHead(OutputStream out, int code, String mime, long len, String name) throws IOException {
        String h = "HTTP/1.1 " + code + (code == 200 ? " OK" : " ERR") +
            "\r\nContent-Type: " + mime +
            (len >= 0 ? "\r\nContent-Length: " + len : "") +
            (name != null ? "\r\nContent-Disposition: attachment; filename=\"" + name.replace("\"", "_") + "\"" : "") +
            "\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
        out.write(h.getBytes("UTF-8"));
    }

    private void sendBytes(OutputStream out, byte[] d, String mime, int code) throws IOException {
        sendHead(out, code, mime, d.length, null); out.write(d); out.flush();
    }

    private void sendAsset(OutputStream out, String ap, String mime) {
        try {
            InputStream in = getContext().getAssets().open(ap);
            sendHead(out, 200, mime, in.available(), null);
            pump(in, out, -1); in.close();
        } catch (Exception e) { fail(out, 404); }
    }

    // p: 'builtin/…' = asset | 'tribu_media/…' / 'tribu_inbox/…' = files dir
    private void sendFile(OutputStream out, String p, String name) {
        try {
            if (p == null || p.contains("..")) throw new FileNotFoundException();
            InputStream in; long len;
            if (p.startsWith("builtin/")) { in = getContext().getAssets().open("public/" + p); len = in.available(); }
            else if (p.startsWith("tribu_media/") || p.startsWith("tribu_inbox/")) {
                File f = new File(getContext().getFilesDir(), p);
                if (!f.isFile()) throw new FileNotFoundException();
                len = f.length(); in = new FileInputStream(f);
            } else throw new FileNotFoundException();
            sendHead(out, 200, "application/octet-stream", len, name != null ? name : new File(p).getName());
            pump(in, out, -1); in.close();
        } catch (Exception e) { fail(out, 404); }
    }

    private void recvUpload(InputStream in, OutputStream out, String name, long len) {
        try {
            String safe = (name == null || name.isEmpty() ? "archivo" : name).replaceAll("[^\\w.\\-() áéíóúñÁÉÍÓÚÑ]", "_");
            File dir = new File(getContext().getFilesDir(), "tribu_inbox"); dir.mkdirs();
            FileOutputStream fos = new FileOutputStream(new File(dir, safe));
            pump(in, fos, len); fos.close();
            getBridge().triggerWindowJSEvent("tribalInbox");   // inbox.js lo indexa en la tribu
            sendBytes(out, ("{\"ok\":true,\"name\":\"" + safe + "\"}").getBytes("UTF-8"), "application/json", 200);
        } catch (Exception e) { fail(out, 500); }
    }

    private void fail(OutputStream out, int code) {
        try { sendBytes(out, ("error " + code).getBytes("UTF-8"), "text/plain", code); } catch (Exception ignored) {}
    }

    private void pump(InputStream in, OutputStream out, long max) throws IOException {
        byte[] buf = new byte[65536]; long left = max; int r;
        while ((r = in.read(buf, 0, max < 0 ? buf.length : (int) Math.min(buf.length, left))) != -1) {
            out.write(buf, 0, r);
            if (max >= 0 && (left -= r) <= 0) break;
        }
        out.flush();
    }
}
