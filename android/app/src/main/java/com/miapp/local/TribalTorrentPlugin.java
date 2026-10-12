package com.miapp.local;

import com.frostwire.jlibtorrent.AnnounceEntry;
import com.frostwire.jlibtorrent.FileStorage;
import com.frostwire.jlibtorrent.SessionManager;
import com.frostwire.jlibtorrent.SettingsPack;
import com.frostwire.jlibtorrent.Sha1Hash;
import com.frostwire.jlibtorrent.TorrentHandle;
import com.frostwire.jlibtorrent.TorrentInfo;
import com.frostwire.jlibtorrent.TorrentStatus;
import com.frostwire.jlibtorrent.swig.settings_pack;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.LinkedHashSet;
import java.util.Set;

// ============================================================================
// Motor torrent NATIVO (libtorrent real vía jlibtorrent): TCP + UDP +
// DHT + PEX + trackers http/udp — el swarm completo, no solo peers WebRTC.
//   Capacitor.Plugins.TribalTorrent.{add,list,pause,resume,remove,
//                                    reannounce,fileUri}
// Los archivos bajan a files/tribu_torrents/ — el JS los lee con
// convertFileSrc (stream del WebView, sin base64).
// ============================================================================
@CapacitorPlugin(name = "TribalTorrent")
public class TribalTorrentPlugin extends Plugin {

    private SessionManager session;
    private File dir;
    // registro propio: esta versión de jlibtorrent no expone torrents();
    // el id de cada torrent es el btih del magnet (hex de 40)
    private final Set<String> ids = new LinkedHashSet<>();

    private synchronized SessionManager session() {
        if (session == null) {
            dir = new File(getContext().getFilesDir(), "tribu_torrents");
            if (!dir.exists()) dir.mkdirs();
            session = new SessionManager();
            session.start();
            // DHT NO arranca solo en esta versión: sin esto un magnet sin
            // trackers se queda en "obteniendo datos" para siempre
            try { session.startDht(); } catch (Throwable ignored) {}
            // ajustes de swarm: LSD + UPnP/NAT-PMP + uTP y anuncio a todos
            // los trackers/tiers — máxima cobertura de peers
            try {
                SettingsPack sp = session.settings();
                sp.setBoolean(settings_pack.bool_types.enable_dht.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.enable_lsd.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.broadcast_lsd.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.enable_upnp.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.enable_natpmp.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.enable_outgoing_utp.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.enable_incoming_utp.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.announce_to_all_trackers.swigValue(), true);
                sp.setBoolean(settings_pack.bool_types.announce_to_all_tiers.swigValue(), true);
                sp.setInteger(settings_pack.int_types.connections_limit.swigValue(), 300);
                sp.setInteger(settings_pack.int_types.active_downloads.swigValue(), -1);
                sp.setString(settings_pack.string_types.user_agent.swigValue(),
                             "TRIBALs/1.0 libtorrent/1.2");
                session.applySettings(sp);
            } catch (Throwable ignored) {}
            // el servicio en primer plano mantiene vivo el proceso aunque
            // el usuario siga leyendo/escuchando dentro de la app (y fuera)
            try { TribalTorrentSvc.start(getContext()); } catch (Throwable ignored) {}
        }
        return session;
    }

    private TorrentHandle find(String id) {
        if (id == null) return null;
        try {
            return session().find(new Sha1Hash(id));
        } catch (Throwable e) { return null; }
    }

    @PluginMethod
    public void add(PluginCall call) {
        String magnet = call.getString("magnet", "");
        if (magnet.isEmpty()) { call.reject("magnet vacío"); return; }
        String h = btihHex(magnet);
        if (h == null) { call.reject("magnet sin btih reconocible"); return; }
        try {
            session().download(magnet, dir);
            ids.add(h);
            // trackers extra desde el JS (los magnets guardados van
            // "desnudos" — sin tr= — para WebTorrent; aquí se inyectan)
            JSArray trs = call.getArray("trackers");
            if (trs != null) {
                final TorrentHandle th = find(h);
                if (th != null) {
                    for (int i = 0; i < trs.length(); i++) {
                        try {
                            String u = trs.getString(i);
                            if (u != null && !u.isEmpty() &&
                                !u.startsWith("wss://"))
                                th.addTracker(new AnnounceEntry(u));
                        } catch (Throwable ignored) {}
                    }
                    try { th.forceReannounce(); } catch (Throwable ignored) {}
                    try { th.forceDHTAnnounce(); } catch (Throwable ignored) {}
                }
            }
            JSObject r = new JSObject();
            r.put("id", h);
            call.resolve(r);
        } catch (Throwable e) {
            call.reject("add: " + e.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray arr = new JSArray();
        for (String id : new LinkedHashSet<>(ids)) {
            TorrentHandle th = find(id);
            if (th == null) {
                // handle aún no creado (magnet recién añadido): entrada
                // mínima para que el UI no quede ciego
                JSObject stub = new JSObject();
                stub.put("id", id);
                stub.put("progress", 0.0);
                stub.put("peers", 0);
                arr.put(stub);
                continue;
            }
            try {
                JSObject o = new JSObject();
                TorrentStatus st = th.status();
                o.put("id", th.infoHash().toHex());
                o.put("name", th.name());
                o.put("progress", st.progress());
                o.put("down", st.downloadPayloadRate());
                o.put("up", st.uploadPayloadRate());
                o.put("peers", st.numPeers());
                o.put("downloaded", st.totalDone());
                o.put("uploaded", st.totalUpload());
                o.put("done", st.isFinished() || st.isSeeding());
                o.put("state", String.valueOf(st.state()));
                TorrentInfo ti = th.torrentFile();
                if (ti != null) {
                    FileStorage fs = ti.files();
                    long[] prog = null;
                    try { prog = th.fileProgress(); } catch (Throwable ignored) {}
                    JSArray files = new JSArray();
                    for (int i = 0; i < fs.numFiles(); i++) {
                        JSObject f = new JSObject();
                        long size = fs.fileSize(i);
                        long got = (prog != null && i < prog.length) ? prog[i] : 0;
                        f.put("i", i);
                        f.put("name", fs.fileName(i));
                        f.put("path", fs.filePath(i));
                        f.put("size", size);
                        f.put("downloaded", got);
                        f.put("progress", size > 0 ? (double) got / size : 1.0);
                        files.put(f);
                    }
                    o.put("files", files);
                }
                arr.put(o);
            } catch (Throwable ignored) {}
        }
        JSObject r = new JSObject();
        r.put("torrents", arr);
        try { r.put("dht", session().dhtNodes()); } catch (Throwable ignored) {}
        try { r.put("dhtOn", session().isDhtRunning()); } catch (Throwable ignored) {}
        call.resolve(r);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        TorrentHandle th = find(call.getString("id"));
        if (th != null) { try { th.pause(); } catch (Throwable ignored) {} }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        TorrentHandle th = find(call.getString("id"));
        if (th != null) { try { th.resume(); } catch (Throwable ignored) {} }
        call.resolve();
    }

    @PluginMethod
    public void reannounce(PluginCall call) {
        TorrentHandle th = find(call.getString("id"));
        if (th != null) { try { th.forceReannounce(); } catch (Throwable ignored) {} }
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = call.getString("id");
        TorrentHandle th = find(id);
        ids.remove(id);
        if (th != null) {
            File saveDir = null;
            try { saveDir = new File(th.savePath()); } catch (Throwable ignored) {}
            try { session().remove(th); } catch (Throwable ignored) {}
            // borrar los datos descargados (solo si viven en nuestra carpeta)
            if (call.getBoolean("deleteFiles", true)) {
                try {
                    String name = th.name();
                    File f = new File(dir, name);
                    deleteRec(f);
                    if (saveDir != null && saveDir.getAbsolutePath()
                            .startsWith(dir.getAbsolutePath()) &&
                        !saveDir.getAbsolutePath().equals(dir.getAbsolutePath()))
                        deleteRec(saveDir);
                } catch (Throwable ignored) {}
            }
        }
        call.resolve();
    }

    // ruta absoluta de un archivo dentro del torrent → JS la sirve con
    // Capacitor.convertFileSrc (streaming directo del disco)
    @PluginMethod
    public void fileUri(PluginCall call) {
        TorrentHandle th = find(call.getString("id"));
        int idx = call.getInt("index", 0);
        if (th == null || th.torrentFile() == null) {
            call.reject("torrent o archivo no disponible");
            return;
        }
        try {
            String rel = th.torrentFile().files().filePath(idx);
            File f = new File(dir, rel);
            JSObject r = new JSObject();
            r.put("path", f.getAbsolutePath());
            call.resolve(r);
        } catch (Throwable e) {
            call.reject("fileUri: " + e.getMessage());
        }
    }

    // ---- helpers -----------------------------------------------------------

    private static void deleteRec(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRec(k);
        }
        f.delete();
    }

    // btih del magnet → hex de 40 (id estable para cruzar con list())
    private static String btihHex(String m) {
        int i = m.indexOf("btih:");
        if (i < 0) return null;
        String h = m.substring(i + 5);
        int amp = h.indexOf('&');
        if (amp >= 0) h = h.substring(0, amp);
        if (h.length() == 40) return h.toLowerCase();
        if (h.length() == 32) return b32hex(h.toLowerCase());
        return null;
    }

    // base32 (RFC 4648 minúsculas) → hex
    private static String b32hex(String s) {
        String abc = "abcdefghijklmnopqrstuvwxyz234567";
        StringBuilder bits = new StringBuilder();
        for (char c : s.toCharArray()) {
            int v = abc.indexOf(c);
            if (v < 0) return null;
            String b = "0000" + Integer.toBinaryString(v);
            bits.append(b.substring(b.length() - 5));
        }
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i + 4 <= bits.length() && hex.length() < 40; i += 4)
            hex.append(Integer.toHexString(Integer.parseInt(bits.substring(i, i + 4), 2)));
        return hex.length() == 40 ? hex.toString() : null;
    }
}
