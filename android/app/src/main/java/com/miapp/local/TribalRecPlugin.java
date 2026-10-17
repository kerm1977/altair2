package com.miapp.local;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;

// Puente JS ↔ servicios de grabación.
//  · Notas de audio (TribalRecService): recStart/Pause/Resume/Stop/Cancel/Peek,
//    el audio vive en filesDir/recs/nota_*.m4a.
//  · Pantalla (TribalScreenService): screenStart/Pause/Resume/Stop/Cancel/Peek,
//    el video vive en filesDir/recs/pantalla_*.mp4.
//  · minimize (app al fondo) y callMode (¿hay una llamada en curso?).
@CapacitorPlugin(name = "TribalRec",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic"))
public class TribalRecPlugin extends Plugin {

    // ---------------------------------------------------------- audio (nota)
    private void act(int what, PluginCall call) {
        try {
            Intent i = new Intent(getContext(), TribalRecService.class)
                .putExtra(TribalRecService.ACT, what);
            getContext().startForegroundService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("rec_" + what, e.getMessage(), e);
        }
    }

    private boolean micGranted() {
        return getPermissionState("mic") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void recStart(PluginCall call) {
        if (micGranted()) act(TribalRecService.ACT_START, call);
        else requestPermissionForAlias("mic", call, "recMicCb");
    }

    @PermissionCallback
    private void recMicCb(PluginCall call) {
        if (micGranted()) act(TribalRecService.ACT_START, call);
        else call.reject("Sin permiso de micrófono");
    }

    @PluginMethod public void recPause(PluginCall call)  { act(TribalRecService.ACT_PAUSE, call); }
    @PluginMethod public void recResume(PluginCall call) { act(TribalRecService.ACT_RESUME, call); }
    @PluginMethod public void recCancel(PluginCall call) { act(TribalRecService.ACT_CANCEL, call); }

    @PluginMethod
    public void recStop(PluginCall call) {
        act(TribalRecService.ACT_STOP, call);
        // el archivo queda en TribalRecService.lastFile — recPeek lo entrega
    }

    // estado + archivo pendiente (borrador). res: {live, path, durMs, name}
    @PluginMethod
    public void recPeek(PluginCall call) {
        JSObject r = new JSObject();
        r.put("live", TribalRecService.live);
        r.put("durMs", TribalRecService.lastDurMs);
        if (TribalRecService.lastFile != null && TribalRecService.lastFile.exists()) {
            r.put("path", TribalRecService.lastFile.getAbsolutePath());
            r.put("rel", "recs/" + TribalRecService.lastFile.getName());
            r.put("name", TribalRecService.lastFile.getName());
        }
        call.resolve(r);
    }

    // ------------------------------------------------------------- pantalla
    @PluginMethod
    public void screenStart(PluginCall call) {
        if (TribalScreenService.live) { call.resolve(); return; }
        if (micGranted()) askProjection(call);
        else requestPermissionForAlias("mic", call, "scrMicCb");
    }

    @PermissionCallback
    private void scrMicCb(PluginCall call) { askProjection(call); }   // sin mic: video mudo

    private void askProjection(PluginCall call) {
        MediaProjectionManager mpm = (MediaProjectionManager)
            getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "scrResult");
    }

    @ActivityCallback
    private void scrResult(PluginCall call, ActivityResult res) {
        if (call == null) return;
        if (res.getResultCode() != Activity.RESULT_OK || res.getData() == null) {
            call.reject("Permiso de pantalla denegado");
            return;
        }
        try {
            Intent i = new Intent(getContext(), TribalScreenService.class)
                .putExtra(TribalScreenService.ACT, TribalScreenService.ACT_START)
                .putExtra(TribalScreenService.CODE, res.getResultCode())
                .putExtra(TribalScreenService.DATA, res.getData());
            getContext().startForegroundService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo iniciar la grabación de pantalla", e);
        }
    }

    private void scrAct(int what) {
        if (!TribalScreenService.live) return;
        getContext().startService(new Intent(getContext(), TribalScreenService.class)
            .putExtra(TribalScreenService.ACT, what));
    }

    @PluginMethod public void screenPause(PluginCall call)  { scrAct(TribalScreenService.ACT_PAUSE);  call.resolve(); }
    @PluginMethod public void screenResume(PluginCall call) { scrAct(TribalScreenService.ACT_RESUME); call.resolve(); }
    @PluginMethod public void screenCancel(PluginCall call) { scrAct(TribalScreenService.ACT_CANCEL); call.resolve(); }

    // cierra y ESPERA a que el MP4 quede finalizado antes de responder
    @PluginMethod
    public void screenStop(final PluginCall call) {
        scrAct(TribalScreenService.ACT_STOP);
        new Thread(new Runnable() {
            @Override public void run() {
                long t0 = System.currentTimeMillis();
                while (TribalScreenService.live && System.currentTimeMillis() - t0 < 5000) {
                    try { Thread.sleep(100); } catch (InterruptedException ignored) {}
                }
                call.resolve(screenInfo());
            }
        }).start();
    }

    @PluginMethod
    public void screenPeek(PluginCall call) { call.resolve(screenInfo()); }

    // estado + último video (si el proceso murió se busca el más nuevo en recs/)
    private JSObject screenInfo() {
        JSObject r = new JSObject();
        boolean live = TribalScreenService.live;
        r.put("live", live);
        r.put("paused", TribalScreenService.paused);
        r.put("durMs", live ? TribalScreenService.curMs() : TribalScreenService.lastDurMs);
        File f = TribalScreenService.lastFile;
        if (f == null || !f.exists()) {
            File[] all = new File(getContext().getFilesDir(), "recs").listFiles();
            f = null;
            if (all != null) for (File c : all) {
                if (c.getName().startsWith("pantalla_") && c.length() > 0 &&
                    (f == null || c.lastModified() > f.lastModified())) f = c;
            }
        }
        if (f != null && f.exists()) {
            r.put("rel", "recs/" + f.getName());
            r.put("name", f.getName());
        }
        return r;
    }

    // ----------------------------------------------------------------- varios
    @PluginMethod
    public void minimize(PluginCall call) {
        try { getActivity().moveTaskToBack(true); } catch (Exception ignored) {}
        call.resolve();
    }

    // ¿llamada telefónica o VoIP en curso? (AudioManager.getMode, sin permisos)
    @PluginMethod
    public void callMode(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int m = am != null ? am.getMode() : AudioManager.MODE_NORMAL;
        JSObject r = new JSObject();
        r.put("inCall", m == AudioManager.MODE_IN_CALL ||
                        m == AudioManager.MODE_IN_COMMUNICATION);
        call.resolve(r);
    }
}
