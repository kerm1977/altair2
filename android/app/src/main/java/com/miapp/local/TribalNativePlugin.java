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

    // Abre el selector nativo de Cast / Pantalla inalámbrica (Chromecast, Miracast, Smart TV)
    @PluginMethod
    public void openCastSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_CAST_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i2 = new Intent("android.settings.WIFI_DISPLAY_SETTINGS");
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                call.resolve();
            } catch (Exception e2) {
                call.reject("cast_unavailable", e2.getMessage());
            }
        }
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

    // Descarga: copia un archivo del caché (ruta relativa) a Descargas/TRIBALs
    // en el almacenamiento público. API 29+ vía MediaStore.Downloads; abajo,
    // escritura directa + MediaScanner para que aparezca al instante.
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String rel = call.getString("path");
        String name = call.getString("name", "archivo");
        String mime = call.getString("mime", "application/octet-stream");
        if (rel == null) { call.reject("sin ruta"); return; }
        try {
            File src = new File(getContext().getCacheDir(), rel);
            if (!src.exists()) { call.reject("no existe " + rel); return; }
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH,
                    android.os.Environment.DIRECTORY_DOWNLOADS + "/TRIBALs");
                Uri uri = getContext().getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) { call.reject("MediaStore rechazó"); return; }
                java.io.OutputStream out = getContext().getContentResolver()
                    .openOutputStream(uri);
                copyFile(src, out);
            } else {
                File dir = new File(android.os.Environment
                    .getExternalStoragePublicDirectory(
                        android.os.Environment.DIRECTORY_DOWNLOADS), "TRIBALs");
                if (!dir.exists()) dir.mkdirs();
                File dst = new File(dir, name);
                copyFile(src, new java.io.FileOutputStream(dst));
                android.media.MediaScannerConnection.scanFile(getContext(),
                    new String[]{ dst.getAbsolutePath() },
                    new String[]{ mime }, null);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("dl_error", e.getMessage(), e);
        }
    }

    private void copyFile(File src, java.io.OutputStream out) throws java.io.IOException {
        java.io.FileInputStream in = new java.io.FileInputStream(src);
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        out.close();
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
