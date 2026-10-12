package com.miapp.local;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.io.DataInputStream;
import java.util.UUID;

// Servicio en primer plano: mantiene el socket servidor RFCOMM vivo aunque
// la WebView muera ("siempre en escucha"). Si el plugin está vivo le entrega
// el socket; si la app está cerrada, los mensajes entrantes vibran y caen
// como notificación que reabre TRIBALs.
public class TribalBtService extends Service {

    static final String CH = "tribu_bt_chat";
    // canal propio para el "escuchando": IMPORTANCE_MIN → aparece una vez
    // en la bandeja, en silencio, sin heads-up nunca más (el canal viejo
    // era HIGH y re-popaba en cada reinicio del servicio)
    static final String CH_FG = "tribu_bt_fg";
    private static final int FG_ID = 71, MSG_ID = 72;
    private static final UUID APP_UUID =
        UUID.fromString("7b1d0e5a-3c2f-4a9b-8e6d-5f1a2c3b4d5e");

    private BluetoothServerSocket server;
    private volatile boolean running;
    static volatile boolean up;            // el plugin consulta si está vivo

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        channel();
        if (!goForeground()) {
            // permisos revocados (Android 14+ exige BLUETOOTH_CONNECT para el
            // tipo connectedDevice): morir en paz, NO en crash ni en bucle
            stopSelf();
            return START_NOT_STICKY;
        }
        up = true;
        // "tribu_pause": se queda vivo pero cierra el socket servidor —
        // cero consumo de radio BT, cero conexiones entrantes
        if (i != null && "tribu_pause".equals(i.getAction())) {
            running = false;
            try { if (server != null) server.close(); } catch (Exception e) {}
            return START_STICKY;
        }
        if (!running) { running = true; acceptLoop(); }
        return START_STICKY;
    }

    // sube a primer plano con degradación segura: tipo → sin tipo → rendirse
    private boolean goForeground() {
        Notification n = note(CH_FG, "Chat tribal escuchando", null);
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                startForeground(FG_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                return true;
            } catch (Exception e) { /* sin BT_CONNECT: sigue sin tipo */ }
        }
        try { startForeground(FG_ID, n); return true; }
        catch (Exception e) { return false; }
    }

    @Override public void onDestroy() {
        running = false; up = false;
        try { if (server != null) server.close(); } catch (Exception ignored) {}
    }

    private void acceptLoop() {
        new Thread(new Runnable() { public void run() {
            BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
            try {
                server = ad.listenUsingInsecureRfcommWithServiceRecord(
                    "TRIBALs", APP_UUID);
            } catch (Exception e) { stopSelf(); return; }
            while (running) {
                try {
                    BluetoothSocket s = server.accept();
                    if (s == null) continue;
                    // app viva → el plugin toma el socket; app muerta →
                    // el servicio lee el saludo, vibra y notifica
                    if (!TribalBtPlugin.deliver(s)) serve(s);
                } catch (Exception e) {
                    if (running) rest();
                }
            }
        }}).start();
    }

    // recrea el servidor si el socket se cerró por error
    private void rest() {
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        try {
            server = BluetoothAdapter.getDefaultAdapter()
                .listenUsingInsecureRfcommWithServiceRecord("TRIBALs", APP_UUID);
        } catch (Exception e) { stopSelf(); }
    }

    // app cerrada: lee un mensaje, vibra y notifica; luego suelta el socket
    private void serve(final BluetoothSocket s) {
        new Thread(new Runnable() { public void run() {
            try {
                DataInputStream in = new DataInputStream(s.getInputStream());
                int n = in.readInt();
                if (n > 0 && n <= 32 * 1024 * 1024) {
                    byte[] b = new byte[n];
                    in.readFully(b);
                    buzz(new String(b, "UTF-8").contains("\"ping\"")
                        ? new long[]{0, 200, 120, 200, 120, 400}
                        : new long[]{0, 180, 90, 180});
                    notifyMsg();
                }
            } catch (Exception ignored) {}
            try { s.close(); } catch (Exception ignored) {}
        }}).start();
    }

    private void buzz(long[] pat) {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26)
                v.vibrate(VibrationEffect.createWaveform(pat, -1));
            else v.vibrate(pat, -1);
        } catch (Exception ignored) {}
    }

    private void notifyMsg() {
        try {
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(MSG_ID, note(CH, "La tribu te llama",
                "Mensaje Bluetooth — toca para abrir el chat tribal"));
        } catch (Exception ignored) {}   // sin POST_NOTIFICATIONS → solo vibra
    }

    private Notification note(String ch, String title, String text) {
        Intent tap = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("btchat", 1);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, ch)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle(title)
            .setContentText(text == null ? title : text)
            .setContentIntent(pi)
            .setAutoCancel(text != null)
            .setOngoing(text == null)
            .build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        // escucha: silencioso, solo en la bandeja — UNA sola aparición
        NotificationChannel fg = new NotificationChannel(
            CH_FG, "Chat tribal (escucha)", NotificationManager.IMPORTANCE_MIN);
        fg.setDescription("Presencia silenciosa del chat Bluetooth");
        fg.setShowBadge(false);
        if (nm != null) nm.createNotificationChannel(fg);
        // mensajes: sí alertan
        NotificationChannel c = new NotificationChannel(
            CH, "Chat tribal Bluetooth", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Avisos de mensajes del chat Bluetooth tribal");
        c.enableVibration(true);
        c.setVibrationPattern(new long[]{0, 180, 90, 180});
        if (nm != null) nm.createNotificationChannel(c);
    }
}
