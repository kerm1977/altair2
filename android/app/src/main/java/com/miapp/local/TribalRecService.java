package com.miapp.local;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;

import java.io.File;

// Servicio en primer plano tipo MICRÓFONO: graba la nota de audio aunque la
// pantalla se apague o la app quede en segundo plano. Escribe un .m4a (AAC)
// en filesDir/recs/ — el archivo mismo ES el borrador a prueba de cierres.
public class TribalRecService extends Service {
    static final String CH = "tribu_rec", ACT = "acc";
    static final int ACT_START = 1, ACT_PAUSE = 2, ACT_RESUME = 3,
                       ACT_STOP = 4, ACT_CANCEL = 5;
    private static final int FG_ID = 73;

    private MediaRecorder rec;
    private File outFile;
    private long startedAt, accMs;
    private boolean paused;

    static volatile File lastFile;      // lo consulta el plugin
    static volatile long lastDurMs;
    static volatile boolean live;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        channel();
        goForeground();
        int act = i != null ? i.getIntExtra(ACT, 0) : 0;
        try {
            if (act == ACT_START) doStart();
            else if (act == ACT_PAUSE) doPause();
            else if (act == ACT_RESUME) doResume();
            else if (act == ACT_STOP) doStop(false);
            else if (act == ACT_CANCEL) doStop(true);
        } catch (Exception ignored) {}
        return START_STICKY;
    }

    private void goForeground() {
        Notification n = note("● Grabando nota de audio…",
            "TRIBALs sigue grabando aunque la pantalla se apague");
        if (Build.VERSION.SDK_INT >= 29) {
            try { startForeground(FG_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE); return; }
            catch (Exception ignored) {}
        }
        try { startForeground(FG_ID, n); } catch (Exception ignored) {}
    }

    private void doStart() throws Exception {
        if (rec != null) return;                       // ya grabando
        File dir = new File(getFilesDir(), "recs");
        dir.mkdirs();
        outFile = new File(dir, "nota_" + System.currentTimeMillis() + ".m4a");
        rec = new MediaRecorder();
        rec.setAudioSource(MediaRecorder.AudioSource.MIC);
        rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        rec.setAudioEncodingBitRate(128000);
        rec.setAudioSamplingRate(44100);
        rec.setOutputFile(outFile.getAbsolutePath());
        rec.prepare();
        rec.start();
        startedAt = System.currentTimeMillis();
        accMs = 0; paused = false; live = true;
        lastFile = outFile;
    }

    private void doPause() {
        if (rec == null || paused || Build.VERSION.SDK_INT < 24) return;
        try { rec.pause(); paused = true;
            accMs += System.currentTimeMillis() - startedAt;
        } catch (Exception ignored) {}
    }

    private void doResume() {
        if (rec == null || !paused || Build.VERSION.SDK_INT < 24) return;
        try { rec.resume(); paused = false;
            startedAt = System.currentTimeMillis();
        } catch (Exception ignored) {}
    }

    private void doStop(boolean cancel) {
        if (rec != null) {
            try { rec.stop(); } catch (Exception ignored) {}
            try { rec.release(); } catch (Exception ignored) {}
            rec = null;
        }
        if (!paused) accMs += System.currentTimeMillis() - startedAt;
        lastDurMs = accMs;
        live = false;
        if (cancel && outFile != null) { outFile.delete(); lastFile = null; }
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() {
        live = false;
        // si el sistema mata el servicio, el archivo queda íntegro en disco
        if (rec != null) {
            try { rec.stop(); } catch (Exception ignored) {}
            try { rec.release(); } catch (Exception ignored) {}
            rec = null;
            if (!paused) lastDurMs = accMs + System.currentTimeMillis() - startedAt;
        }
    }

    private Notification note(String title, String text) {
        Intent tap = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CH)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title).setContentText(text)
            .setContentIntent(pi).setOngoing(true).build();
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel c = new NotificationChannel(
            CH, "Notas de audio (grabación)", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Indicador silencioso mientras una nota se graba");
        c.setShowBadge(false);
        if (nm != null) nm.createNotificationChannel(c);
    }
}
