package com.miapp.local;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import java.io.File;

// Servicio en primer plano tipo MEDIA PROJECTION: graba la pantalla (+ micrófono)
// a un MP4 H.264/AAC en filesDir/recs/pantalla_*.mp4, estilo grabador de Samsung.
// Sigue vivo con la app minimizada o la pantalla apagada; la notificación lleva
// un botón «Detener» para cerrar la grabación sin volver a la app.
public class TribalScreenService extends Service {
    static final String CH = "tribu_scr", ACT = "acc", CODE = "code", DATA = "data";
    static final int ACT_START = 1, ACT_PAUSE = 2, ACT_RESUME = 3,
                       ACT_STOP = 4, ACT_CANCEL = 5;
    private static final int FG_ID = 74;

    private MediaProjection proj;
    private VirtualDisplay vd;
    private MediaRecorder rec;
    private File outFile;

    static volatile File lastFile;
    static volatile long lastDurMs, accMs, runStart;
    static volatile boolean live, paused;

    static long curMs() {
        return accMs + (live && !paused && runStart > 0
            ? System.currentTimeMillis() - runStart : 0);
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        int act = i != null ? i.getIntExtra(ACT, 0) : 0;
        if (act != ACT_START && rec == null) { stopSelf(); return START_NOT_STICKY; }
        try {
            if (act == ACT_START) { channel(); goForeground(); doStart(i); }
            else if (act == ACT_PAUSE) doPause();
            else if (act == ACT_RESUME) doResume();
            else if (act == ACT_STOP) doStop(false);
            else if (act == ACT_CANCEL) doStop(true);
        } catch (Exception e) {
            doStop(true);
        }
        return START_NOT_STICKY;
    }

    private boolean micOk() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void goForeground() {
        Notification n = note();
        if (Build.VERSION.SDK_INT >= 29) {
            int t = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            if (micOk()) t |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            startForeground(FG_ID, n, t);
        } else startForeground(FG_ID, n);
    }

    private void doStart(Intent i) throws Exception {
        if (rec != null) return;
        MediaProjectionManager mpm =
            (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        Intent data = i.getParcelableExtra(DATA);
        proj = mpm.getMediaProjection(i.getIntExtra(CODE, 0), data);
        proj.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { doStop(false); }
        }, new Handler(Looper.getMainLooper()));

        DisplayMetrics dm = new DisplayMetrics();
        ((WindowManager) getSystemService(WINDOW_SERVICE))
            .getDefaultDisplay().getRealMetrics(dm);
        float s = Math.min(1f, 1920f / Math.max(dm.widthPixels, dm.heightPixels));
        int w = ((int) (dm.widthPixels * s)) & ~1, h = ((int) (dm.heightPixels * s)) & ~1;

        File dir = new File(getFilesDir(), "recs");
        dir.mkdirs();
        outFile = new File(dir, "pantalla_" + System.currentTimeMillis() + ".mp4");
        boolean mic = micOk();
        rec = new MediaRecorder();
        if (mic) rec.setAudioSource(MediaRecorder.AudioSource.MIC);
        rec.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        rec.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        if (mic) {
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            rec.setAudioEncodingBitRate(128000);
            rec.setAudioSamplingRate(44100);
        }
        rec.setVideoSize(w, h);
        rec.setVideoFrameRate(30);
        rec.setVideoEncodingBitRate(6000000);
        rec.setOutputFile(outFile.getAbsolutePath());
        rec.prepare();
        vd = proj.createVirtualDisplay("tribals-screen", w, h, dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, rec.getSurface(), null, null);
        rec.start();
        accMs = 0; runStart = System.currentTimeMillis(); paused = false;
        live = true; lastFile = outFile;
    }

    private void doPause() {
        if (rec == null || paused || Build.VERSION.SDK_INT < 24) return;
        try { rec.pause(); accMs += System.currentTimeMillis() - runStart; paused = true; }
        catch (Exception ignored) {}
    }

    private void doResume() {
        if (rec == null || !paused || Build.VERSION.SDK_INT < 24) return;
        try { rec.resume(); runStart = System.currentTimeMillis(); paused = false; }
        catch (Exception ignored) {}
    }

    private synchronized void doStop(boolean cancel) {
        boolean ok = true;
        long dur = curMs();
        if (rec != null) {
            try { rec.stop(); } catch (Exception e) { ok = false; }
            try { rec.release(); } catch (Exception ignored) {}
            rec = null;
        }
        if (vd != null) { try { vd.release(); } catch (Exception ignored) {} vd = null; }
        if (proj != null) { try { proj.stop(); } catch (Exception ignored) {} proj = null; }
        lastDurMs = dur;
        if ((cancel || !ok) && outFile != null) { outFile.delete(); lastFile = null; }
        live = false; paused = false;
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        if (rec != null) doStop(false);
        live = false;
    }

    private Notification note() {
        Intent tap = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, TribalScreenService.class).putExtra(ACT, ACT_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CH)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("● Grabando la pantalla…")
            .setContentText("Toca «Detener» para terminar y guardar en Videos")
            .setContentIntent(pi).setOngoing(true)
            .addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_pause),
                "■ Detener", stop).build())
            .build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel c = new NotificationChannel(
            CH, "Grabación de pantalla", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Indicador mientras TRIBALs graba la pantalla");
        c.setShowBadge(false);
        if (nm != null) nm.createNotificationChannel(c);
    }
}
