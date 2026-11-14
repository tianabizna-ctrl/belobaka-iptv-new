import type { PluginListenerHandle } from '@capacitor/core';
import type {
    TranscodeBridge,
    TranscodeErrorEvent,
    TranscodeProgressEvent,
    TranscodeStartOptions,
    TranscodeStartResult,
} from './transcode-bridge';

/**
 * Shape of the native `LocalTranscoder` Capacitor plugin
 * (`android/app/src/main/java/com/belobaka/iptv/LocalTranscoderPlugin.java`).
 */
interface LocalTranscoderPlugin {
    isAvailable(): Promise<{ available: boolean }>;
    start(options: {
        url: string;
        resolutionId: string;
        scaleFilter: string;
        bitrateKbps: number;
        height: number;
        isLive: boolean;
        userAgent?: string;
    }): Promise<TranscodeStartResult>;
    stop(): Promise<void>;
    addListener(
        eventName: 'progress',
        listener: (event: TranscodeProgressEvent) => void
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: 'error',
        listener: (event: TranscodeErrorEvent) => void
    ): Promise<PluginListenerHandle>;
}

/** True only inside the Capacitor native WebView (android/ios), never a browser. */
function isCapacitorRuntime(): boolean {
    const capacitor = (
        globalThis as {
            Capacitor?: { isNativePlatform?: () => boolean };
        }
    ).Capacitor;
    return (
        typeof capacitor?.isNativePlatform === 'function' &&
        capacitor.isNativePlatform() === true
    );
}

/**
 * `TranscodeBridge` backed by the Android FFmpeg plugin. On any runtime
 * without the native implementation every call rejects and `isAvailable()`
 * resolves `false`, so the feature hides itself instead of failing.
 */
class CapacitorTranscodeBridge implements TranscodeBridge {
    constructor(private readonly plugin: LocalTranscoderPlugin) {}

    async isAvailable(): Promise<boolean> {
        try {
            const result = await this.plugin.isAvailable();
            return result?.available === true;
        } catch {
            return false;
        }
    }

    start(options: TranscodeStartOptions): Promise<TranscodeStartResult> {
        return this.plugin.start({
            url: options.url,
            resolutionId: options.resolutionId,
            scaleFilter: options.scaleFilter,
            bitrateKbps: options.bitrateKbps,
            height: options.height,
            isLive: options.isLive,
            userAgent: options.userAgent,
        });
    }

    stop(): Promise<void> {
        return this.plugin.stop();
    }

    addListener(
        eventName: 'progress',
        listener: (event: TranscodeProgressEvent) => void
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: 'error',
        listener: (event: TranscodeErrorEvent) => void
    ): Promise<PluginListenerHandle>;
    addListener(
        eventName: 'progress' | 'error',
        listener:
            | ((event: TranscodeProgressEvent) => void)
            | ((event: TranscodeErrorEvent) => void)
    ): Promise<PluginListenerHandle> {
        return eventName === 'progress'
            ? this.plugin.addListener(
                  'progress',
                  listener as (event: TranscodeProgressEvent) => void
              )
            : this.plugin.addListener(
                  'error',
                  listener as (event: TranscodeErrorEvent) => void
              );
    }
}

/**
 * Resolves the native bridge, or `null` when this is not the Capacitor
 * runtime. `@capacitor/core` is imported dynamically so the bridge — and the
 * plugin registry — never enter the initial bundle of a runtime that cannot
 * open the transcoding panel.
 */
export async function createCapacitorTranscodeBridge(): Promise<TranscodeBridge | null> {
    if (!isCapacitorRuntime()) {
        return null;
    }
    try {
        const { registerPlugin } = await import('@capacitor/core');
        const plugin = registerPlugin<LocalTranscoderPlugin>('LocalTranscoder');
        return new CapacitorTranscodeBridge(plugin);
    } catch {
        return null;
    }
}
