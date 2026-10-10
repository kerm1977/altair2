package com.miapp.local;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

// Recibe "Abrir con" (VIEW) y "Compartir" (SEND / SEND_MULTIPLE):
// copia el stream entrante a files/tribu_inbox/ y avisa al WebView con el
// evento 'tribalInbox'. El módulo js/media/inbox.js importa lo recibido.
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TribalNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleIncoming(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncoming(intent);
    }

    private void handleIncoming(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();

        if (Intent.ACTION_VIEW.equals(action)) {
            Uri u = intent.getData();
            if (u != null && u.getScheme() != null &&
                (u.getScheme().equals("content") || u.getScheme().equals("file"))) {
                uris.add(u);
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> l = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) uris.addAll(l);
        }
        if (uris.isEmpty()) return;

        boolean copied = false;
        for (Uri u : uris) {
            copied |= copyToInbox(u);
        }
        // avisar a la web (si el bridge ya vive — app en caliente); en arranque
        // en frío el drain del boot encuentra la carpeta de todos modos
        if (copied) {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().triggerWindowJSEvent("tribalInbox");
                }
            } catch (Throwable ignored) {}
        }
    }

    private boolean copyToInbox(Uri uri) {
        try {
            String name = displayName(uri);
            String mime = getContentResolver().getType(uri);
            if (name == null) {
                name = "archivo_" + System.currentTimeMillis() + extFor(mime);
            }
            File dir = new File(getFilesDir(), "tribu_inbox");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, name.replaceAll("[^\\w.\\-\\u00C0-\\u024F()\\[\\] ]", "_"));
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return false;
            FileOutputStream fos = new FileOutputStream(out);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
            fos.close();
            in.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        return (last != null && last.contains(".")) ? last : null;
    }

    private String extFor(String mime) {
        if (mime == null) return "";
        String e = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return e != null ? "." + e : "";
    }
}
