package com.miapp.local;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Puente JS ↔ servicio de grabación de notas de audio (TribalRecService):
// recStart/Pause/Resume/Stop/Cancel/Peek — el audio vive en
// filesDir/recs/nota_*.m4a. Si hay una llamada en curso al arrancar, el
// servicio graba con fuente VOICE_COMMUNICATION para captarla mejor.
@CapacitorPlugin(name = "TribalRec",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic"))
public class TribalRecPlugin extends Plugin {

    // ¿llamada telefónica o VoIP en curso? (AudioManager.getMode, sin permisos)
    private int audioSrc() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int m = am != null ? am.getMode() : AudioManager.MODE_NORMAL;
        return (m == AudioManager.MODE_IN_CALL ||
                m == AudioManager.MODE_IN_COMMUNICATION) ? 1 : 0;
    }

    private void act(int what, PluginCall call) {
        try {
            Intent i = new Intent(getContext(), TribalRecService.class)
                .putExtra(TribalRecService.ACT, what)
                .putExtra(TribalRecService.SRC, audioSrc());
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
}
