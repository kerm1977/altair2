package com.miapp.local;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente JS ↔ TribalRecService: grabación de notas con pantalla apagada.
// recStart/recPause/recResume/recStop/recCancel/recPeek — el audio vive en
// filesDir/recs/nota_*.m4a; recPeek informa si quedó un archivo pendiente
// (borrador a prueba de cierres de la app).
@CapacitorPlugin(name = "TribalRec")
public class TribalRecPlugin extends Plugin {

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

    @PluginMethod public void recStart(PluginCall call)  { act(TribalRecService.ACT_START, call); }
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
