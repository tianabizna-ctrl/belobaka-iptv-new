package com.belobaka.iptv;

import android.util.Log;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.FFprobeKit;
import com.arthenica.ffmpegkit.MediaInformation;
import com.arthenica.ffmpegkit.ReturnCode;
import com.arthenica.ffmpegkit.Statistics;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * On-device FFmpeg transcoder for BELOBAKA IPTV.
 *
 * Re-encodes the current stream into a local HLS ladder rung (live) or MP4
 * (VOD) and publishes it over a loopback HTTP server, so the app can offer a
 * quality menu with resolutions the source does not provide, down to 144p.
 *
 * The encoder is hardware (MediaCodec) first, with a software `mpeg4`
 * fallback so the feature still works on devices where the H.264 hardware
 * encoder rejects a size or is missing.
 */
@CapacitorPlugin(name = "LocalTranscoder")
public class LocalTranscoderPlugin extends Plugin {

    private static final String TAG = "LocalTranscoder";
    private static final long OUTPUT_TIMEOUT_MS = 45_000L;

    private FFmpegSession session;
    private LocalTranscodeServer server;
    private File outputDir;
    private double durationSeconds = 0d;
    private int attempt = 0;
    private String lastUrl;
    private String lastScaleFilter;
    private int lastBitrateKbps;
    private boolean lastIsLive;
    private String lastUserAgent;

    /**
     * Monotonic id of the current transcode session. Every start/stop bumps
     * it, so a late callback or watcher thread belonging to a superseded
     * session can recognise that it must not resolve or reject the newer call.
     */
    private long generation = 0;

    /** Guards the single resolve/reject of a call against late watchers. */
    private final Object settleLock = new Object();
    private boolean settled = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available;
        try {
            // FFmpegKitConfig too: its static initializer loads the native
            // libraries, so this proves the transcoder really runs, not just
            // that the classes are linked.
            Class.forName("com.arthenica.ffmpegkit.FFmpegKit");
            Class.forName("com.arthenica.ffmpegkit.FFmpegKitConfig", true,
                FFmpegKit.class.getClassLoader());
            available = true;
        } catch (Throwable error) {
            Log.e(TAG, "ffmpeg-kit unavailable", error);
            available = false;
        }
        result.put("available", available);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        lastUrl = url;
        lastScaleFilter = call.getString("scaleFilter", "scale=-2:720");
        lastBitrateKbps = call.getInt("bitrateKbps", 2500);
        lastIsLive = Boolean.TRUE.equals(call.getBoolean("isLive", false));
        lastUserAgent = call.getString("userAgent");

        stopSession();
        settled = false;
        final long myGeneration = generation;

        getActivity().runOnUiThread(() -> {
            try {
                outputDir = new File(getContext().getCacheDir(), "transcode");
                deleteRecursive(outputDir);
                if (!outputDir.exists() && !outputDir.mkdirs()) {
                    call.reject("cannot create output directory");
                    return;
                }
                server = new LocalTranscodeServer(outputDir);
                durationSeconds = lastIsLive ? 0d : probeDuration(lastUrl);
                attempt = 0;
                runAttempt(call, myGeneration);
            } catch (Throwable error) {
                Log.e(TAG, "start failed", error);
                call.reject("transcode start failed: "
                    + describeError(error));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopSession();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopSession();
        super.handleOnDestroy();
    }

    private void runAttempt(PluginCall call, long myGeneration) {
        boolean hardware = attempt == 0;
        List<String> arguments = buildArguments(hardware);
        File outputFile = lastIsLive
            ? new File(outputDir, "stream.m3u8")
            : new File(outputDir, "stream.mp4");

        session = FFmpegKit.executeWithArgumentsAsync(
            arguments.toArray(new String[0]),
            completed -> {
                if (myGeneration != generation) {
                    return; // a newer session owns the call
                }
                if (ReturnCode.isSuccess(completed.getReturnCode())) {
                    notifyProgress(100);
                    if (!lastIsLive) {
                        // The MP4 is only complete once faststart has rewritten
                        // the header, which happens right before the process
                        // exits, so it is the completion that proves playability.
                        resolveOutput(call, outputFile, myGeneration);
                    }
                } else if (ReturnCode.isCancel(completed.getReturnCode())) {
                    // User stopped; nothing to report.
                } else if (attempt == 0) {
                    // Hardware encoder refused this stream/size: retry in
                    // software once before surfacing the failure.
                    attempt = 1;
                    Log.w(TAG, "hardware encode failed, retrying with mpeg4");
                    getActivity().runOnUiThread(
                        () -> runAttempt(call, myGeneration)
                    );
                } else {
                    JSObject error = new JSObject();
                    String trace = completed.getFailStackTrace();
                    error.put(
                        "message",
                        "FFmpeg failed" + (trace != null ? ": " + trace : "")
                    );
                    notifyListeners("error", error);
                    rejectOnce(call, "FFmpeg failed to transcode this stream");
                }
            },
            log -> {},
            this::handleStatistics
        );

        if (lastIsLive) {
            startLiveWatcher(call, outputFile, myGeneration);
        } else {
            startTimeoutWatcher(call, myGeneration);
        }
    }

    /**
     * A failure text that names the real culprit: `getMessage()` of a
     * {@link NoClassDefFoundError} is only the class name, hiding why the
     * class failed to load, so the whole cause chain is folded in.
     */
    private static String describeError(Throwable error) {
        StringBuilder text = new StringBuilder(error.toString());
        for (
            Throwable cause = error.getCause();
            cause != null && cause != cause.getCause();
            cause = cause.getCause()
        ) {
            text.append(" | caused by ").append(cause.toString());
        }
        return text.toString();
    }

    private List<String> buildArguments(boolean hardware) {
        List<String> args = new ArrayList<>();
        args.add("-hide_banner");
        args.add("-loglevel");
        args.add("warning");
        args.add("-nostdin");
        if (lastUserAgent != null && !lastUserAgent.isEmpty()) {
            args.add("-user_agent");
            args.add(lastUserAgent);
        }
        args.add("-i");
        args.add(lastUrl);
        args.add("-map");
        args.add("0:v:0");
        args.add("-map");
        args.add("0:a:0?");
        args.add("-sn");
        args.add("-vf");
        args.add(lastScaleFilter);
        args.add("-pix_fmt");
        args.add("yuv420p");
        if (hardware) {
            args.add("-c:v");
            args.add("h264_mediacodec");
            args.add("-b:v");
            args.add(lastBitrateKbps + "k");
        } else {
            args.add("-c:v");
            args.add("mpeg4");
            args.add("-q:v");
            args.add("5");
        }
        args.add("-c:a");
        args.add("aac");
        args.add("-b:a");
        args.add("128k");
        args.add("-ac");
        args.add("2");
        args.add("-ar");
        args.add("48000");
        if (lastIsLive) {
            args.add("-f");
            args.add("hls");
            args.add("-hls_time");
            args.add("2");
            args.add("-hls_list_size");
            args.add("6");
            args.add("-hls_flags");
            args.add("delete_segments+append_list+omit_endlist");
            args.add(new File(outputDir, "stream.m3u8").getAbsolutePath());
        } else {
            args.add("-movflags");
            args.add("+faststart");
            args.add("-f");
            args.add("mp4");
            args.add(new File(outputDir, "stream.mp4").getAbsolutePath());
        }
        return args;
    }

    private void handleStatistics(Statistics statistics) {
        if (lastIsLive || durationSeconds <= 0d) {
            return;
        }
        double seconds = statistics.getTime() / 1000d;
        int percent = (int) Math.max(
            0,
            Math.min(99, Math.round((seconds / durationSeconds) * 100d))
        );
        notifyProgress(percent);
    }

    private void notifyProgress(int percent) {
        JSObject event = new JSObject();
        event.put("percent", percent);
        notifyListeners("progress", event);
    }

    private double probeDuration(String url) {
        try {
            MediaInformation information = FFprobeKit.getMediaInformation(url)
                .getMediaInformation();
            if (information == null || information.getDuration() == null) {
                return 0d;
            }
            return Double.parseDouble(information.getDuration());
        } catch (Throwable error) {
            Log.w(TAG, "duration probe failed", error);
            return 0d;
        }
    }

    /** Live output is playable as soon as FFmpeg has flushed its first segment. */
    private void startLiveWatcher(
        PluginCall call,
        File playlist,
        long myGeneration
    ) {
        Thread watcher = new Thread(() -> {
            long deadline = System.currentTimeMillis() + OUTPUT_TIMEOUT_MS;
            while (System.currentTimeMillis() < deadline) {
                if (myGeneration != generation) {
                    return;
                }
                if (playlist.exists() && hasSegment()) {
                    resolveOutput(call, playlist, myGeneration);
                    return;
                }
                if (!sleepBriefly()) {
                    return;
                }
            }
            if (myGeneration == generation) {
                rejectOnce(call, "timed out waiting for transcoded output");
            }
        });
        watcher.setDaemon(true);
        watcher.start();
    }

    /** VOD resolves on completion; this only reports a silent timeout. */
    private void startTimeoutWatcher(PluginCall call, long myGeneration) {
        Thread watcher = new Thread(() -> {
            if (!sleepBriefly(OUTPUT_TIMEOUT_MS)) {
                return;
            }
            if (myGeneration == generation) {
                rejectOnce(call, "timed out waiting for transcoded output");
            }
        });
        watcher.setDaemon(true);
        watcher.start();
    }

    private void resolveOutput(
        PluginCall call,
        File output,
        long myGeneration
    ) {
        if (myGeneration != generation || server == null) {
            return;
        }
        if (!output.exists() || output.length() <= 0) {
            rejectOnce(call, "transcoded output is missing");
            return;
        }
        if (!markSettled()) {
            return;
        }
        JSObject result = new JSObject();
        result.put(
            "url",
            "http://127.0.0.1:" + server.port() + "/" + output.getName()
        );
        result.put("port", server.port());
        call.resolve(result);
    }

    private void rejectOnce(PluginCall call, String message) {
        if (markSettled()) {
            call.reject(message);
        }
    }

    private boolean markSettled() {
        synchronized (settleLock) {
            if (settled) {
                return false;
            }
            settled = true;
            return true;
        }
    }

    private boolean hasSegment() {
        if (outputDir == null) {
            return false;
        }
        File[] files = outputDir.listFiles(
            (dir, name) -> name.endsWith(".ts") || name.endsWith(".m4s")
        );
        return files != null && files.length > 0;
    }

    private static boolean sleepBriefly() {
        return sleepBriefly(300L);
    }

    private static boolean sleepBriefly(long millis) {
        try {
            Thread.sleep(millis);
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void stopSession() {
        // Invalidate every watcher/callback of the retiring session first.
        generation++;
        FFmpegSession current = session;
        if (current != null) {
            FFmpegKit.cancel(current.getSessionId());
            session = null;
        }
        LocalTranscodeServer currentServer = server;
        if (currentServer != null) {
            currentServer.stop();
            server = null;
        }
        durationSeconds = 0d;
    }

    private static void deleteRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
