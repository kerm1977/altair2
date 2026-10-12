package com.miapp.local;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

// ============================================================================
// Servicio en primer plano del motor torrent: mantiene vivo el proceso (y la
// sesión libtorrent) mientras hay torrents — el usuario puede leer, escuchar
// música o salir de la app y la descarga continúa. Notificación mínima
// (IMPORTANCE_MIN): aparece una sola vez en la sombra, sin sonido ni re-pops.
// ============================================================================
public class TribalTorrentSvc extends Service {

    static final String CH = "tribu_torrent_fg";
    static final int FG_ID = 73;

    public static void start(Context ctx) {
        Intent i = new Intent(ctx, TribalTorrentSvc.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            try { ctx.startService(i); } catch (Exception ignored) {}
        }
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        Notification n = note();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(FG_ID, n,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                return START_STICKY;
            }
        } catch (Throwable ignored) {}
        try { startForeground(FG_ID, n); } catch (Throwable ignored) {}
        return START_STICKY;
    }

    private Notification note() {
        NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel c = new NotificationChannel(
                    CH, "TRIBALs descargas", NotificationManager.IMPORTANCE_MIN);
            c.setDescription("Motor de descargas P2P activo");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CH)
                : new Notification.Builder(this);
        return b.setContentTitle("TRIBALs descargando")
                .setContentText("Motor P2P activo en segundo plano")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }
}
