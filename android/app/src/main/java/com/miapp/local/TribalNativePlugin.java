package com.miapp.local;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.util.List;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente JS → ajustes nativos de Android para TRIBALs.
//   Capacitor.Plugins.TribalNative.openAppSettings()
//   Capacitor.Plugins.TribalNative.openAllFilesAccess()
@CapacitorPlugin(name = "TribalNative")
public class TribalNativePlugin extends Plugin {

    // Pantalla "Información de la app" → ahí se activan todos los permisos
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName())
        );
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    // Pantalla "Acceso a todos los archivos" (MANAGE_EXTERNAL_STORAGE)
    @PluginMethod
    public void openAllFilesAccess(PluginCall call) {
        try {
            Intent i = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    // "Revocar permisos": borra el registro de concedidos — el próximo
    // arranque trata todo como primera vez y vuelve a pedir lo que falte
    @PluginMethod
    public void resetPermFlag(PluginCall call) {
        getContext().getSharedPreferences("tribu_perms",
            android.content.Context.MODE_PRIVATE)
            .edit().clear().apply();
        call.resolve();
    }

    // Compartir directo por Bluetooth: ACTION_SEND dirigido al paquete BT de
    // Android con URI de FileProvider (cache-path está cubierto en
    // file_paths.xml). Si el dispositivo no tiene stack BT, rechaza y el JS
    // cae a la hoja de compartir normal.
    @PluginMethod
    public void shareBluetooth(PluginCall call) {
        String rel = call.getString("path");
        if (rel == null) { call.reject("sin ruta"); return; }
        String mime = call.getString("mime", "");
        String title = call.getString("title", "");
        if (mime == null || mime.isEmpty() || "*/*".equals(mime)) {
            String ext = android.webkit.MimeTypeMap
                .getFileExtensionFromUrl(rel);
            String guess = (ext == null) ? null : android.webkit.MimeTypeMap
                .getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            mime = (guess != null) ? guess : "application/octet-stream";
        }
        try {
            File f = new File(getContext().getCacheDir(), rel);
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                f
            );
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.putExtra(Intent.EXTRA_STREAM, uri);
            if (title != null && !title.isEmpty()) {
                i.putExtra(Intent.EXTRA_SUBJECT, title);
            }
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // Buscar la actividad Bluetooth Share que maneja ACTION_SEND —
            // el paquete varía por fabricante (com.android.bluetooth,
            // com.mediatek.bluetooth, com.samsung.android.bluetooth…).
            // Esa app es la que despliega la lista de dispositivos.
            ResolveInfo bt = findBluetoothTarget(i);
            if (bt != null) {
                i.setClassName(bt.activityInfo.packageName,
                               bt.activityInfo.name);
                getContext().startActivity(i);
            } else {
                // Sin receptor BT: hoja estándar, donde BT sigue apareciendo
                getContext().startActivity(
                    Intent.createChooser(i,
                        title == null || title.isEmpty() ? "Compartir" : title)
                );
            }
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("bt_unavailable", "Bluetooth no disponible", e);
        } catch (Exception e) {
            call.reject("bt_error", e.getMessage(), e);
        }
    }

    // Devuelve el ResolveInfo del manejador Bluetooth de ACTION_SEND, o null.
    private ResolveInfo findBluetoothTarget(Intent send) {
        PackageManager pm = getContext().getPackageManager();
        Intent probe = new Intent(send);
        probe.setPackage(null);
        probe.setComponent(null);
        List<ResolveInfo> list = pm.queryIntentActivities(probe, 0);
        ResolveInfo fallback = null;
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.contains("bluetooth")) return ri;
            // Android mueve el share BT a "Bluetooth Share"/"Nearby"
            if (fallback == null && pkg.equals("com.android.bluetooth")) {
                fallback = ri;
            }
        }
        return fallback;
    }
}
