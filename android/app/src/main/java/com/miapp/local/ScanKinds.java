package com.miapp.local;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

// Tablas de clasificación del escáner de medios: qué extensión va a qué
// sección de la biblioteca, qué carpetas se saltan y los tamaños mínimos
// que filtran la basura del sistema (tonos, miniaturas, beeps).
final class ScanKinds {

    private ScanKinds() {}

    static final Set<String> AUDIO = new HashSet<>(Arrays.asList(
        "mp3","mpga","mp2","mpa","m4a","m4b","m4p","m4r","aac","wav","wave",
        "ogg","oga","opus","spx","flac","weba","wma","amr","3ga","aiff","aif",
        "aifc","mka","caf","alac","ape","wv","mid","midi","kar","pcm","au","ra"));
    static final Set<String> VIDEO = new HashSet<>(Arrays.asList(
        "mp4","m4v","webm","mkv","mov","avi","3gp","3g2","wmv","flv","ts",
        "mpg","mpeg"));
    static final Set<String> IMAGE = new HashSet<>(Arrays.asList(
        "jpg","jpeg","png","gif","webp","bmp","svg","heic","heif","avif",
        "tif","tiff"));
    static final Set<String> DOC = new HashSet<>(Arrays.asList(
        "pdf","epub","txt","md","rtf","doc","docx","xls","xlsx","ppt","pptx",
        "odt","ods","odp","csv","json","html","htm"));
    static final Set<String> OTHER = new HashSet<>(Arrays.asList(
        "zip","rar","7z","tar","gz","apk","xml","log","ini","cfg","srt","sub"));

    static String kindOf(String ext) {
        if (AUDIO.contains(ext)) return "audio";
        if (VIDEO.contains(ext)) return "video";
        if (IMAGE.contains(ext)) return "image";
        if (DOC.contains(ext))   return "doc";
        if (OTHER.contains(ext)) return "other";
        return null;
    }

    static int kindIndex(String kind) {
        switch (kind) {
            case "audio": return 0;
            case "video": return 1;
            case "image": return 2;
            case "doc":   return 3;
            default:      return 4;
        }
    }

    // tamaños mínimos: debajo de esto es ruido del sistema, no biblioteca
    static long minSize(String kind) {
        switch (kind) {
            case "image": return 20 * 1024;
            case "audio": return 200 * 1024;
            case "video": return 500 * 1024;
            case "doc":   return 512;
            default:      return 1024;
        }
    }

    // carpetas que nunca se recorren: privadas de apps, basura del FS y
    // restos de Windows en la SD
    static boolean skipDir(String name) {
        if (name == null || name.isEmpty() || name.charAt(0) == '.') return true;
        String n = name.toLowerCase(Locale.US);
        return n.equals("android") || n.equals("lost.dir") ||
               n.equals("system volume information") || n.equals("$recycle.bin") ||
               n.equals("recycler") || n.equals("thumbnails");
    }

    static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return (i > 0 && i < name.length() - 1)
            ? name.substring(i + 1).toLowerCase(Locale.US) : "";
    }
}
