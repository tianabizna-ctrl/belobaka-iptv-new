package com.belobaka.iptv;

import android.util.Log;

import fi.iki.elonen.NanoHTTPD;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Tiny loopback HTTP server serving the FFmpeg output directory to the WebView.
 *
 * hls.js fetches the live playlist and segments over plain HTTP from
 * {@code http://127.0.0.1:<port>}; cleartext + mixed content are enabled in
 * capacitor.config.ts for exactly this (and for http IPTV provider streams).
 */
public class LocalTranscodeServer extends NanoHTTPD {

    private static final String TAG = "LocalTranscodeServer";
    private final File root;

    public LocalTranscodeServer(File root) throws IOException {
        super("127.0.0.1", 0);
        this.root = root;
        start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
    }

    public int port() {
        return getListeningPort();
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        if (uri == null || uri.isEmpty() || "/".equals(uri)) {
            uri = "/index.html";
        }
        try {
            File file = new File(root, uri);
            if (!file.getCanonicalPath().startsWith(root.getCanonicalPath())) {
                return newFixedLengthResponse(
                    Response.Status.FORBIDDEN, MIME_PLAINTEXT, "forbidden"
                );
            }
            if (!file.isFile()) {
                return newFixedLengthResponse(
                    Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found"
                );
            }
            InputStream stream = new FileInputStream(file);
            Response response = newFixedLengthResponse(
                Response.Status.OK, mimeOf(file.getName()), stream, file.length()
            );
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Cache-Control", "no-cache, no-store");
            return response;
        } catch (IOException error) {
            Log.w(TAG, "serve failed", error);
            return newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "error"
            );
        }
    }

    private static String mimeOf(String name) {
        String normalized = name.toLowerCase();
        if (normalized.endsWith(".m3u8")) {
            return "application/vnd.apple.mpegurl";
        }
        if (normalized.endsWith(".ts")) {
            return "video/mp2t";
        }
        if (normalized.endsWith(".m4s") || normalized.endsWith(".mp4")) {
            return "video/mp4";
        }
        if (normalized.endsWith(".vtt")) {
            return "text/vtt";
        }
        if (normalized.endsWith(".aac")) {
            return "audio/aac";
        }
        if (normalized.endsWith(".html")) {
            return "text/html";
        }
        return "application/octet-stream";
    }
}
