package com.miapp.local;

import android.Manifest;
import android.bluetooth.*;
import android.content.*;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.net.wifi.WifiNetworkSuggestion;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.*;

// Chat Bluetooth multi-peer: RFCOMM inseguro + framing [4B len][JSON]. Cada
// socket — de connect() o aceptado por TribalBtService — es un Peer. Los msgs
// entrantes se emiten al JS y se retransmiten a los demás peers (estrella,
// dedup por hash): quien escucha actúa de hub grupal.
@CapacitorPlugin(name = "TribalBt", permissions = {
    @Permission(strings = {
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.POST_NOTIFICATIONS
    }, alias = "bt"),
    @Permission(strings = {
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION
    }, alias = "btLegacy")
})
public class TribalBtPlugin extends Plugin {

    private static final UUID APP_UUID =
        UUID.fromString("7b1d0e5a-3c2f-4a9b-8e6d-5f1a2c3b4d5e");
    private static TribalBtPlugin inst;
    private BluetoothAdapter adapter;
    private boolean discovering;
    private boolean rxRegistered;
    private boolean wifiRxRegistered;
    private long lastEnableAsk;
    private final Map<String, Peer> peers = new HashMap<>();
    private final Deque<Integer> seen = new ArrayDeque<>();   // dedup de relay

    private static final class Peer {
        final BluetoothSocket s; final DataOutputStream out; final String name;
        Peer(BluetoothSocket x) throws Exception {
            s = x; out = new DataOutputStream(x.getOutputStream());
            String n = null;
            try { n = x.getRemoteDevice().getName(); }
            catch (SecurityException ignored) {}
            name = n == null ? "la tribu" : n; } }

    // el servicio entrega aquí los sockets aceptados (false → app muerta)
    static boolean deliver(BluetoothSocket s) {
        TribalBtPlugin p = inst;
        if (p == null) return false;
        p.attach(s); return true; }
    @Override public void load() {
        inst = this;
        startWifiUdpServer();
    }
    private void emit(JSObject d) { notifyListeners("bt", d, true); }
    private boolean markSeen(String m) {         // true = nuevo
        int h = m.hashCode();
        if (seen.contains(h)) return false;
        seen.add(h);
        while (seen.size() > 512) seen.pollFirst();
        return true; }

    private String kindOf(BluetoothDevice dev) {
        if (dev == null) return "bt";
        try {
            String nm = dev.getName() != null ? dev.getName().toLowerCase() : "";
            BluetoothClass bc = dev.getBluetoothClass();
            if (bc != null) {
                int maj = bc.getMajorDeviceClass();
                int cls = bc.getDeviceClass();
                if (maj == BluetoothClass.Device.Major.AUDIO_VIDEO) return "audio";
                if (maj == BluetoothClass.Device.Major.PERIPHERAL) {
                    if ((cls & 0x0540) == 0x0540) return "keyboard";
                    if ((cls & 0x0580) == 0x0580) return "mouse";
                    return "input";
                }
                if (maj == BluetoothClass.Device.Major.PHONE) return "phone";
                if (maj == BluetoothClass.Device.Major.COMPUTER) return "pc";
                if (maj == BluetoothClass.Device.Major.WEARABLE) return "wear";
            }
            if (nm.contains("airpod") || nm.contains("buds") || nm.contains("headphone") ||
                nm.contains("speaker") || nm.contains("audifon") || nm.contains("audio") ||
                nm.contains("jbl") || nm.contains("sony")) return "audio";
            if (nm.contains("keyb") || nm.contains("teclado")) return "keyboard";
            if (nm.contains("mouse") || nm.contains("raton") || nm.contains("trackpad")) return "mouse";
        } catch (SecurityException ignored) {}
        return "bt";
    }

    private void connectSystemProfiles(final BluetoothDevice dev) {
        final BluetoothAdapter ad = adapter();
        if (ad == null || dev == null) return;
        int[] profs = new int[] { BluetoothProfile.A2DP, BluetoothProfile.HEADSET, 4 }; // 4 = HID_HOST
        for (final int pr : profs) {
            try {
                ad.getProfileProxy(getContext(), new BluetoothProfile.ServiceListener() {
                    @Override public void onServiceConnected(int profile, BluetoothProfile proxy) {
                        try {
                            java.lang.reflect.Method m = proxy.getClass().getMethod("connect", BluetoothDevice.class);
                            m.setAccessible(true);
                            m.invoke(proxy, dev);
                        } catch (Throwable ignored) {}
                        try { ad.closeProfileProxy(profile, proxy); } catch (Throwable ignored) {}
                    }
                    @Override public void onServiceDisconnected(int profile) {}
                }, pr);
            } catch (Throwable ignored) {}
        }
    }

    private final BroadcastReceiver rx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String a = i.getAction(); JSObject d = new JSObject();
            if (BluetoothDevice.ACTION_FOUND.equals(a)) {
                BluetoothDevice dev =
                    i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (dev == null) return;
                try {
                    d.put("type", "device"); d.put("name", dev.getName());
                    d.put("addr", dev.getAddress());
                    d.put("kind", kindOf(dev));
                    d.put("bonded", dev.getBondState() == BluetoothDevice.BOND_BONDED);
                    emit(d); } catch (SecurityException ignored) {} }
            else if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(a) ||
                     BluetoothDevice.ACTION_ACL_CONNECTED.equals(a)) {
                BluetoothDevice dev = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (dev == null) return;
                try {
                    if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(a) ||
                        dev.getBondState() == BluetoothDevice.BOND_BONDED) {
                        connectSystemProfiles(dev);
                        d.put("type", "peer"); d.put("state", "open");
                        d.put("addr", dev.getAddress()); d.put("name", dev.getName());
                        d.put("kind", kindOf(dev)); emit(d);
                    }
                } catch (SecurityException ignored) {} }
            else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(a)) {
                BluetoothDevice dev = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (dev == null) return;
                try {
                    Peer p = peers.remove(dev.getAddress());
                    if (p != null) try { p.s.close(); } catch (Throwable ignored) {}
                    d.put("type", "peer"); d.put("state", "closed");
                    d.put("addr", dev.getAddress()); d.put("name", dev.getName());
                    emit(d);
                } catch (SecurityException ignored) {} }
            else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(a)) {
                discovering = false; d.put("type", "scanDone"); emit(d); }
            else if (BluetoothAdapter.ACTION_SCAN_MODE_CHANGED.equals(a)) {
                int mode = i.getIntExtra(BluetoothAdapter.EXTRA_SCAN_MODE, BluetoothAdapter.ERROR);
                d.put("type", "scanMode"); d.put("mode", mode); emit(d); }
        }
    };

    private boolean isDevConnected(BluetoothDevice dev) {
        if (dev == null) return false;
        try {
            if (peers.containsKey(dev.getAddress())) return true;
            java.lang.reflect.Method m = dev.getClass().getMethod("isConnected");
            Object res = m.invoke(dev);
            if (res instanceof Boolean && (Boolean) res) return true;
        } catch (Throwable ignored) {}
        return false;
    }

    private void ensureRxRegistered() {
        if (rxRegistered) return;
        try {
            IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            f.addAction(BluetoothAdapter.ACTION_SCAN_MODE_CHANGED);
            f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
            f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
            f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(rx, f, Context.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(rx, f);
            }
            rxRegistered = true;
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void ensurePerms(PluginCall call) {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            need.add(Manifest.permission.BLUETOOTH_SCAN);
            need.add(Manifest.permission.BLUETOOTH_CONNECT);
            need.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean allOk = true;
        for (String p : need) {
            if (getContext().checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                allOk = false;
                break;
            }
        }
        if (allOk) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissionForAlias("bt", call, "permsDone");
        } else {
            requestPermissionForAlias("btLegacy", call, "permsDone");
        }
    }
    @PermissionCallback
    private void permsDone(PluginCall call) {
        call.resolve(new JSObject().put("permsOk", allPermsOk())); }
    private boolean allPermsOk() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            need.add(Manifest.permission.BLUETOOTH_SCAN);
            need.add(Manifest.permission.BLUETOOTH_CONNECT);
            need.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        for (String p : need) {
            if (getContext().checkSelfPermission(p) != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }
    private BluetoothAdapter adapter() {
        if (adapter == null) adapter = BluetoothAdapter.getDefaultAdapter();
        return adapter; }

    @PluginMethod
    public void devices(PluginCall call) {
        BluetoothAdapter ad = adapter();
        ensureRxRegistered();
        JSObject r = new JSObject();
        JSONArray arr = new JSONArray();
        boolean on = false;
        try { on = ad != null && ad.isEnabled(); }
        catch (SecurityException ignored) {}
        r.put("enabled", on);
        r.put("permsOk", allPermsOk());
        if (ad != null) try {
            Set<BluetoothDevice> set = ad.getBondedDevices();
            if (set != null) for (BluetoothDevice d : set) try {
                JSONObject o = new JSONObject();
                String nm = d.getName();
                o.put("name", (nm != null && !nm.isEmpty()) ? nm : d.getAddress());
                o.put("addr", d.getAddress());
                o.put("kind", kindOf(d));
                o.put("bonded", true);
                o.put("connected", isDevConnected(d));
                arr.put(o);
            } catch (Exception ignored) {}
        } catch (SecurityException ignored) {}
        r.put("bonded", arr); call.resolve(r); }

    @PluginMethod
    public void scan(PluginCall call) {
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("sin Bluetooth"); return; }
        try {
            ensureRxRegistered();
            if (!ad.isEnabled()) {
                // radio apagado: pedir encendido una vez (no dos diálogos) y
                // NO lanzar startDiscovery ahora — devolvería false y el
                // escaneo moriría sin scanDone. El JS reintenta a los ~2.5 s.
                if (System.currentTimeMillis() - lastEnableAsk > 8000) {
                    lastEnableAsk = System.currentTimeMillis();
                    getContext().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                }
                call.resolve(new JSObject().put("enabled", false));
                return;
            }
            if (ad.isDiscovering()) ad.cancelDiscovery();
            // Emitir también los emparejados inmediatamente para que la lista nunca quede vacía
            Set<BluetoothDevice> set = ad.getBondedDevices();
            if (set != null) {
                for (BluetoothDevice dev : set) {
                    try {
                        JSObject d = new JSObject();
                        String nm = dev.getName();
                        d.put("type", "device");
                        d.put("name", (nm != null && !nm.isEmpty()) ? nm : dev.getAddress());
                        d.put("addr", dev.getAddress());
                        d.put("kind", kindOf(dev));
                        d.put("bonded", true);
                        d.put("connected", isDevConnected(dev));
                        emit(d);
                    } catch (Throwable ignored) {}
                }
            }
            discovering = ad.startDiscovery();
            call.resolve();
        } catch (SecurityException e) { call.reject("permiso BT denegado", e); }
        catch (Throwable t) { call.reject("error scan: " + t.getMessage()); } }

    // pedir al sistema que encienda el Bluetooth (diálogo nativo, una vez)
    @PluginMethod
    public void requestEnable(PluginCall call) {
        BluetoothAdapter ad = adapter();
        try {
            if (ad == null) { call.reject("sin Bluetooth"); return; }
            if (ad.isEnabled()) { call.resolve(); return; }
            lastEnableAsk = System.currentTimeMillis();
            getContext().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("no se pudo pedir", e); } }

    @PluginMethod
    public void discoverable(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 31 &&
                getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bt", call, "discoverableAfterPerm");
                return;
            }
            doDiscoverable(call);
        } catch (Exception e) { call.reject("no visible: " + e.getMessage(), e); }
    }

    @PermissionCallback
    private void discoverableAfterPerm(PluginCall call) {
        doDiscoverable(call);
    }

    private void doDiscoverable(PluginCall call) {
        try {
            startSvc();
            Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject("no visible: " + e.getMessage(), e); }
    }

    private void startSvc() {
        Intent i = new Intent(getContext(), TribalBtService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
        } catch (Exception e) {          // sin perms / fuera de ventana: degrada
            try { getContext().startService(i); } catch (Exception ignored) {}
        } }
    @PluginMethod
    public void listen(PluginCall call) {
        try { startSvc(); call.resolve(); }
        catch (Exception e) { call.reject("no se pudo escuchar", e); } }
    @PluginMethod
    public void setOn(PluginCall call) {
        if (call.getBoolean("on", true)) startSvc();
        else { closeAll(); getContext().stopService(
            new Intent(getContext(), TribalBtService.class)); }
        call.resolve(); }

    // pausa/reanuda la escucha: cierra (o reabre) el socket servidor y frena
    // el escaneo — los peers ya conectados siguen hablando
    @PluginMethod
    public void pauseListen(PluginCall call) {
        boolean p = call.getBoolean("pause", true);
        try {
            if (p && discovering && adapter != null) {
                adapter.cancelDiscovery(); discovering = false;
                try { getContext().unregisterReceiver(rx); }
                catch (Exception i) {} }
            if (!p || TribalBtService.up) {     // pausar algo muerto: nada
                Intent i = new Intent(getContext(), TribalBtService.class)
                    .setAction(p ? "tribu_pause" : "tribu_resume");
                if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
                else getContext().startService(i);
            }
            call.resolve();
        } catch (Exception e) { call.reject("no se pudo", e); } }

    @PluginMethod
    public void openBtSettings(PluginCall call) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject("no settings", e); }
    }

    // conectar a cualquier dispositivo BT (audífonos A2DP/Headset, teclado/mouse HID, o peer RFCOMM)
    @PluginMethod
    public void connect(PluginCall call) {
        final String addr = call.getString("addr");
        final BluetoothAdapter ad = adapter();
        if (ad == null || addr == null) { call.reject("sin destino"); return; }
        new Thread(new Runnable() { public void run() {
            try {
                ad.cancelDiscovery();
                BluetoothDevice dev = ad.getRemoteDevice(addr);
                String k = kindOf(dev);
                if (dev.getBondState() == BluetoothDevice.BOND_NONE) {
                    try { dev.createBond(); } catch (Throwable ignored) {}
                }
                connectSystemProfiles(dev);
                if ("audio".equals(k) || "keyboard".equals(k) || "mouse".equals(k) || "input".equals(k)) {
                    peerEvt(addr, dev.getName(), "open", peers.size() + 1);
                    return;
                }
                try {
                    BluetoothSocket s = dev.createInsecureRfcommSocketToServiceRecord(APP_UUID);
                    s.connect(); attach(s);
                } catch (Exception rfErr) {
                    if (dev.getBondState() == BluetoothDevice.BOND_BONDED) {
                        peerEvt(addr, dev.getName(), "open", peers.size() + 1);
                    } else {
                        peerErr(addr, rfErr);
                    }
                }
            } catch (Exception e) { peerErr(addr, e); }
        }}).start();
        call.resolve(); }

    // registra un socket y arranca su hilo lector
    private void attach(BluetoothSocket s) {
        final String addr;
        try { addr = s.getRemoteDevice().getAddress(); }
        catch (Exception e) { return; }
        final Peer p;
        try { p = new Peer(s); } catch (Exception e) { peerErr(addr, e); return; }
        synchronized (peers) { peers.put(addr, p); }
        peerEvt(addr, p.name, "open", peers.size());
        final DataInputStream in;
        try { in = new DataInputStream(s.getInputStream()); }
        catch (Exception e) { dropPeer(addr); return; }
        new Thread(new Runnable() { public void run() {
            try {
                while (true) {
                    int n = in.readInt();
                    if (n <= 0 || n > 32 * 1024 * 1024) break;
                    byte[] b = new byte[n]; in.readFully(b);
                    String m = new String(b, StandardCharsets.UTF_8);
                    JSObject d = new JSObject();
                    d.put("type", "msg"); d.put("msg", m);
                    d.put("from", addr); emit(d);
                    relay(m, addr);          // hub: reenvía a los demás
                }
            } catch (Exception ignored) {}
            dropPeer(addr);
        }}).start(); }

    private void peerEvt(String addr, String name, String st, int n) {
        JSObject d = new JSObject();
        d.put("type", "peer"); d.put("state", st); d.put("addr", addr);
        if (name != null) d.put("name", name); d.put("n", n); emit(d); }
    private void dropPeer(String addr) {
        synchronized (peers) { peers.remove(addr); } peerEvt(addr, null, "closed", peers.size()); }
    private void peerErr(String addr, Exception e) {
        JSObject d = new JSObject();
        d.put("type", "peer"); d.put("state", "error"); d.put("addr", addr); d.put("msg", String.valueOf(e.getMessage())); emit(d); }


    // reenvío hub: a todos los peers menos al que lo mandó; dedup corta bucles
    private void relay(String msg, String fromAddr) {
        if (!markSeen(msg)) return;
        byte[] b = msg.getBytes(StandardCharsets.UTF_8);
        List<Peer> list;
        synchronized (peers) { list = new ArrayList<>(peers.values()); }
        for (Peer p : list) try {
            if (p.s.getRemoteDevice().getAddress().equals(fromAddr)) continue;
            synchronized (p.out) {
                p.out.writeInt(b.length); p.out.write(b); p.out.flush(); }
        } catch (Exception ignored) {} }

    // send: a un peer ('to') o difusión a todos (grupo). La escritura va en
    // hilo de fondo — un frame de varios MB bloqueando el hilo UI = ANR/crash
    @PluginMethod
    public void send(final PluginCall call) {
        final String msg = call.getString("msg"), to = call.getString("to");
        if (msg == null) { call.reject("sin mensaje"); return; }
        markSeen(msg); final byte[] b = msg.getBytes(StandardCharsets.UTF_8);
        final List<Map.Entry<String, Peer>> list;
        synchronized (peers) { list = new ArrayList<>(peers.entrySet()); }
        new Thread(new Runnable() { public void run() {
            int sent = 0;
            for (Map.Entry<String, Peer> e : list) {
                if (to != null && !to.equals(e.getKey())) continue;
                try {
                    synchronized (e.getValue().out) {
                        e.getValue().out.writeInt(b.length);
                        e.getValue().out.write(b); e.getValue().out.flush(); }
                    sent++;
                } catch (Exception ignored) {}
            }
            if (sent == 0 && to == null) { call.reject("sin conexión"); return; }
            call.resolve();
        }}).start(); }

    @PluginMethod
    public void close(PluginCall call) { closeAll(); call.resolve(); }

    // =========================================================================
    // MOTOR WI-FI / HOTSPOT + DESCUBRIMIENTO Y CONTROL REMOTO UDP (PUERTO 47777)
    // =========================================================================
    private static final int WIFI_PORT = 47777;
    private DatagramSocket udpSock;

    private String localIp() {
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        return a.getHostAddress();
                    }
                }
            }
        } catch (Throwable ignored) {}
        return "0.0.0.0";
    }

    private void startWifiUdpServer() {
        if (udpSock != null) return;
        new Thread(new Runnable() { public void run() {
            try {
                udpSock = new DatagramSocket(WIFI_PORT);
                udpSock.setBroadcast(true);
                byte[] buf = new byte[8192];
                while (udpSock != null && !udpSock.isClosed()) {
                    DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                    udpSock.receive(pkt);
                    String fromIp = pkt.getAddress().getHostAddress();
                    if (fromIp.equals(localIp())) continue;
                    String s = new String(pkt.getData(), 0, pkt.getLength(), StandardCharsets.UTF_8);
                    JSONObject j = new JSONObject(s);
                    String k = j.optString("k", "");
                    if ("wifi_hello".equals(k)) {
                        String devName = Build.MODEL != null ? Build.MODEL : "TRIBALs Android";
                        byte[] rep = ("{\"k\":\"wifi_hi\",\"name\":\"" + devName.replace("\"", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                        udpSock.send(new DatagramPacket(rep, rep.length, pkt.getAddress(), WIFI_PORT));
                        JSObject ev = new JSObject();
                        ev.put("type", "wifiDevice");
                        ev.put("ip", fromIp);
                        ev.put("name", j.optString("name", fromIp));
                        emit(ev);
                    } else if ("wifi_hi".equals(k)) {
                        JSObject ev = new JSObject();
                        ev.put("type", "wifiDevice");
                        ev.put("ip", fromIp);
                        ev.put("name", j.optString("name", fromIp));
                        emit(ev);
                    } else {
                        JSObject ev = new JSObject();
                        ev.put("type", "msg");
                        ev.put("msg", s);
                        ev.put("from", fromIp);
                        emit(ev);
                    }
                }
            } catch (Throwable ignored) {}
        }}).start();
    }

    // lee los resultados de escaneo Wi-Fi actuales (última pasada del sistema)
    private JSONArray readNets() {
        JSONArray nets = new JSONArray();
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
            if (wm == null || !wm.isWifiEnabled()) return nets;
            String curSsid = "";
            try {
                WifiInfo wi = wm.getConnectionInfo();
                if (wi != null && wi.getSSID() != null) {
                    curSsid = wi.getSSID().replace("\"", "");
                    if ("<unknown ssid>".equalsIgnoreCase(curSsid)) curSsid = "";
                }
            } catch (Throwable ignored) {}
            List<ScanResult> list = wm.getScanResults();
            Map<String, JSONObject> best = new LinkedHashMap<>();
            if (list != null) {
                for (ScanResult sr : list) {
                    String ssid = sr.SSID != null ? sr.SSID.trim() : "";
                    if (ssid.isEmpty()) continue;
                    int lvl = WifiManager.calculateSignalLevel(sr.level, 100);
                    if (!best.containsKey(ssid) || lvl > best.get(ssid).optInt("level", 0)) {
                        JSONObject o = new JSONObject();
                        o.put("ssid", ssid);
                        o.put("bssid", sr.BSSID != null ? sr.BSSID : "");
                        o.put("level", lvl);
                        String caps = sr.capabilities != null ? sr.capabilities : "";
                        o.put("secure", caps.contains("WPA") || caps.contains("WEP") ||
                            caps.contains("SAE") || caps.contains("OWE") || caps.contains("EAP"));
                        String low = ssid.toLowerCase();
                        o.put("hotspot", low.contains("android") || low.contains("iphone") ||
                            low.contains("galaxy") || low.contains("redmi") || low.contains("hotspot") ||
                            low.contains("poco") || low.contains("moto") || low.contains("tribu"));
                        o.put("connected", ssid.equals(curSsid));
                        best.put(ssid, o);
                    }
                }
            }
            for (JSONObject o : best.values()) nets.put(o);
        } catch (Throwable ignored) {}
        return nets;
    }

    // cuando el sistema termina un escaneo Wi-Fi → evento con redes frescas
    private final BroadcastReceiver wifiRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (!WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(i.getAction())) return;
            JSObject ev = new JSObject();
            ev.put("type", "wifiNets");
            ev.put("networks", readNets());
            emit(ev);
        }
    };
    private void ensureWifiRx() {
        if (wifiRxRegistered) return;
        try {
            IntentFilter f = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(wifiRx, f, Context.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(wifiRx, f);
            }
            wifiRxRegistered = true;
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void wifiScan(PluginCall call) {
        JSObject res = new JSObject();
        JSONArray nets = new JSONArray();
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            String ip = localIp();
            res.put("ip", ip);
            boolean wifiEnabled = wm != null && wm.isWifiEnabled();
            res.put("enabled", wifiEnabled);

            boolean apOn = false;
            if (wm != null) {
                try {
                    java.lang.reflect.Method m = wm.getClass().getDeclaredMethod("isWifiApEnabled");
                    m.setAccessible(true);
                    apOn = Boolean.TRUE.equals(m.invoke(wm));
                } catch (Throwable ignored) {}
            }
            res.put("hotspotOn", apOn);

            String curSsid = "";
            if (wm != null) {
                try {
                    WifiInfo wi = wm.getConnectionInfo();
                    if (wi != null && wi.getSSID() != null) {
                        curSsid = wi.getSSID().replace("\"", "");
                        if ("<unknown ssid>".equalsIgnoreCase(curSsid)) curSsid = "";
                    }
                } catch (Throwable ignored) {}
                // dispara un escaneo real; las redes frescas llegan por el
                // broadcast SCAN_RESULTS_AVAILABLE → evento 'wifiNets' al JS
                ensureWifiRx();
                try { wm.startScan(); } catch (Throwable ignored) {}
                nets = readNets();
            }
            res.put("currentSsid", curSsid);
            res.put("networks", nets);
            res.put("permsOk", allPermsOk());
            try {
                android.location.LocationManager lm =
                    (android.location.LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                boolean locOn = lm != null &&
                    (lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                     lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER));
                res.put("locationOn", locOn);
            } catch (Throwable ignored) {}

            // Descubrir dispositivos TRIBALs en la misma red Wi-Fi o Hotspot por UDP
            startWifiUdpServer();
            new Thread(new Runnable() { public void run() {
                try {
                    String devName = Build.MODEL != null ? Build.MODEL : "TRIBALs Android";
                    byte[] hello = ("{\"k\":\"wifi_hello\",\"name\":\"" + devName.replace("\"", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                    DatagramSocket ds = udpSock != null ? udpSock : new DatagramSocket();
                    ds.setBroadcast(true);
                    ds.send(new DatagramPacket(hello, hello.length, InetAddress.getByName("255.255.255.255"), WIFI_PORT));
                } catch (Throwable ignored) {}
            }}).start();
        } catch (Throwable ignored) {}
        call.resolve(res);
    }

    @PluginMethod
    public void wifiSend(final PluginCall call) {
        final String msg = call.getString("msg", "");
        final String toIp = call.getString("ip", "255.255.255.255");
        if (msg.isEmpty()) { call.reject("vacío"); return; }
        new Thread(new Runnable() { public void run() {
            try {
                startWifiUdpServer();
                byte[] b = msg.getBytes(StandardCharsets.UTF_8);
                DatagramSocket ds = udpSock != null ? udpSock : new DatagramSocket();
                ds.setBroadcast(true);
                String target = (toIp == null || toIp.isEmpty()) ? "255.255.255.255" : toIp;
                ds.send(new DatagramPacket(b, b.length, InetAddress.getByName(target), WIFI_PORT));
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        }}).start();
    }

    // Conectar a una red Wi-Fi con contraseña:
    //  - Android 10+: WifiNetworkSuggestion (la red queda RECORDADA por el
    //    sistema y se reconecta sola al estar en rango) + WifiNetworkSpecifier
    //    (hoja del sistema para unirse ya mismo).
    //  - Android 9-: WifiConfiguration clásico (addNetwork + enableNetwork).
    @PluginMethod
    public void wifiConnect(PluginCall call) {
        String ssid = call.getString("ssid", "");
        String pass = call.getString("pass", "");
        String bssid = call.getString("bssid", "");
        if (ssid.isEmpty()) { call.reject("sin ssid"); return; }
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
            if (wm == null) { call.reject("sin wifi"); return; }
            if (!wm.isWifiEnabled()) { call.reject("wifi_apagado"); return; }
            JSObject res = new JSObject();
            if (Build.VERSION.SDK_INT >= 29) {
                WifiNetworkSuggestion.Builder sb =
                    new WifiNetworkSuggestion.Builder().setSsid(ssid);
                if (bssid != null && !bssid.isEmpty())
                    sb.setBssid(android.net.MacAddress.fromString(bssid));
                if (pass != null && !pass.isEmpty()) sb.setWpa2Passphrase(pass);
                List<WifiNetworkSuggestion> sug = new ArrayList<>();
                sug.add(sb.build());
                int st = wm.addNetworkSuggestions(sug);
                res.put("remember", st == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS
                    || st == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE
                    ? "ok" : "code_" + st);
                try {
                    WifiNetworkSpecifier.Builder nb =
                        new WifiNetworkSpecifier.Builder().setSsid(ssid);
                    if (bssid != null && !bssid.isEmpty())
                        nb.setBssid(android.net.MacAddress.fromString(bssid));
                    if (pass != null && !pass.isEmpty()) nb.setWpa2Passphrase(pass);
                    NetworkRequest nr = new NetworkRequest.Builder()
                        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                        .setNetworkSpecifier(nb.build()).build();
                    ConnectivityManager cm = (ConnectivityManager)
                        getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                    if (cm != null) cm.requestNetwork(nr, new ConnectivityManager.NetworkCallback() {});
                    res.put("connect", "solicitado");
                } catch (Throwable t2) { res.put("connect", "error:" + t2.getMessage()); }
                call.resolve(res);
            } else {
                WifiConfiguration wc = new WifiConfiguration();
                wc.SSID = "\"" + ssid + "\"";
                if (bssid != null && !bssid.isEmpty()) wc.BSSID = bssid;
                if (pass != null && !pass.isEmpty()) wc.preSharedKey = "\"" + pass + "\"";
                else wc.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
                int id = wm.addNetwork(wc);
                boolean ok = id >= 0 && wm.enableNetwork(id, true) && wm.reconnect();
                res.put("connect", ok ? "ok" : "fallo");
                res.put("remember", ok ? "ok" : "fallo");
                call.resolve(res);
            }
        } catch (Throwable t) { call.reject("wifi: " + t.getMessage()); }
    }

    // Olvidar una red sugerida por la app
    @PluginMethod
    public void wifiForget(PluginCall call) {
        String ssid = call.getString("ssid", "");
        if (ssid.isEmpty()) { call.reject("sin ssid"); return; }
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
            if (wm == null) { call.reject("sin wifi"); return; }
            if (Build.VERSION.SDK_INT >= 29) {
                List<WifiNetworkSuggestion> cur = wm.getNetworkSuggestions();
                List<WifiNetworkSuggestion> del = new ArrayList<>();
                for (WifiNetworkSuggestion s : cur) {
                    if (ssid.equals(s.getSsid())) del.add(s);
                }
                if (!del.isEmpty()) wm.removeNetworkSuggestions(del);
            }
            call.resolve();
        } catch (Throwable t) { call.reject("wifi: " + t.getMessage()); }
    }

    @PluginMethod
    public void openWifiSettings(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 29) {
                i = new Intent(android.provider.Settings.Panel.ACTION_WIFI);
            } else {
                i = new Intent(android.provider.Settings.ACTION_WIFI_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(android.provider.Settings.ACTION_WIFI_SETTINGS);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                call.resolve();
            } catch (Exception e2) { call.reject(e2.getMessage()); }
        }
    }

    @PluginMethod
    public void openHotspotSettings(PluginCall call) {
        try {
            Intent i = new Intent("android.settings.TETHER_SETTINGS");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            openWifiSettings(call);
        }
    }

    private void closeAll() {
        try {
            if (discovering && adapter != null) {
                adapter.cancelDiscovery(); discovering = false;
                try { getContext().unregisterReceiver(rx); }
                catch (Exception i) {} }
        } catch (Exception ignored) {}
        synchronized (peers) {
            for (Peer p : peers.values())
                try { p.s.close(); } catch (Exception ignored) {}
            peers.clear(); } }
    @Override
    protected void handleOnDestroy() {
        if (inst == this) inst = null; closeAll(); }
}
