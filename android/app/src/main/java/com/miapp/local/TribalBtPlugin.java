package com.miapp.local;

import android.Manifest;
import android.bluetooth.*;
import android.content.*;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

// Chat Bluetooth multi-peer: RFCOMM inseguro + framing [4B len][JSON]. Cada
// socket — de connect() o aceptado por TribalBtService — es un Peer. Los msgs
// entrantes se emiten al JS y se retransmiten a los demás peers (estrella,
// dedup por hash): quien escucha actúa de hub grupal.
@CapacitorPlugin(name = "TribalBt", permissions = {
    @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.POST_NOTIFICATIONS }, alias = "bt"),
    @Permission(strings = { Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.ACCESS_FINE_LOCATION }, alias = "btLegacy")
})
public class TribalBtPlugin extends Plugin {

    private static final UUID APP_UUID =
        UUID.fromString("7b1d0e5a-3c2f-4a9b-8e6d-5f1a2c3b4d5e");
    private static TribalBtPlugin inst;
    private BluetoothAdapter adapter;
    private boolean discovering;
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
    @Override public void load() { inst = this; }
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
            else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(a)) {
                discovering = false; d.put("type", "scanDone"); emit(d); }
        }
    };

    @PluginMethod
    public void ensurePerms(PluginCall call) {
        if (getPermissionState("bt") == PermissionState.GRANTED) {
            call.resolve(); return; }
        requestPermissions(call); }
    @PermissionCallback
    private void permsDone(PluginCall call) { call.resolve(); }
    private BluetoothAdapter adapter() {
        if (adapter == null) adapter = BluetoothAdapter.getDefaultAdapter();
        return adapter; }

    @PluginMethod
    public void devices(PluginCall call) {
        BluetoothAdapter ad = adapter();
        JSObject r = new JSObject();
        JSONArray arr = new JSONArray();
        boolean on = false;
        try { on = ad != null && ad.isEnabled(); }
        catch (SecurityException ignored) {}
        r.put("enabled", on);
        if (ad != null) try {
            Set<BluetoothDevice> set = ad.getBondedDevices();
            if (set != null) for (BluetoothDevice d : set) try {
                JSONObject o = new JSONObject();
                o.put("name", d.getName()); o.put("addr", d.getAddress());
                o.put("kind", kindOf(d));
                o.put("bonded", true); arr.put(o);
            } catch (Exception ignored) {}
        } catch (SecurityException ignored) {}
        r.put("bonded", arr); call.resolve(r); }

    @PluginMethod
    public void scan(PluginCall call) {
        BluetoothAdapter ad = adapter();
        if (ad == null) { call.reject("sin Bluetooth"); return; }
        try {
            if (!ad.isEnabled()) getContext().startActivity(new Intent(
                BluetoothAdapter.ACTION_REQUEST_ENABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            if (discovering) ad.cancelDiscovery();
            IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
            f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
            getContext().registerReceiver(rx, f, Context.RECEIVER_NOT_EXPORTED);
            discovering = true; ad.startDiscovery(); call.resolve();
        } catch (SecurityException e) { call.reject("permiso BT denegado", e); } }

    // pedir al sistema que encienda el Bluetooth (diálogo nativo, una vez)
    @PluginMethod
    public void requestEnable(PluginCall call) {
        BluetoothAdapter ad = adapter();
        try {
            if (ad == null) { call.reject("sin Bluetooth"); return; }
            if (ad.isEnabled()) { call.resolve(); return; }
            getContext().startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("no se pudo pedir", e); } }

    @PluginMethod
    public void discoverable(PluginCall call) {
        try {
            Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i); call.resolve();
        } catch (Exception e) { call.reject("no visible", e); } }

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
