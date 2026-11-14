import { InjectionToken } from '@angular/core';

/**
 * A target rendition for on-device transcoding.
 *
 * The ladder is the phone-friendly one BELOBAKA IPTV asked for: 1080p down to
 * 144p, including the 16:9 SD tiers 1024×576, 704×576, 960×540 and 854×480.
 * 4K/1440p tiers are deliberately absent — a phone cannot re-encode them in
 * real time and no Android display benefits from the extra pixels.
 */
export interface TranscodeResolution {
    /** Stable id, also used as the UI key. */
    readonly id: string;
    /** Display label, e.g. `540p`. */
    readonly label: string;
    /** Human dimensions for the menu, e.g. `960×540`. */
    readonly dimensions: string;
    /** Output height in pixels, passed to the native plugin. */
    readonly height: number;
    /** Encoder target in kbps. */
    readonly bitrateKbps: number;
    /**
     * FFmpeg `-vf` value. Exact dimensions with aspect-preserving padding, so
     * the output is always exactly the advertised size and never distorted.
     */
    readonly scaleFilter: string;
}

function exactScale(width: number, height: number): string {
    return (
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
    );
}

/** Highest → lowest, the order the quality menu renders. */
export const DEFAULT_TRANSCODE_RESOLUTION_ID = '144p';

export const TRANSCODE_RESOLUTIONS: readonly TranscodeResolution[] = [
    {
        id: '1080p',
        label: '1080p',
        dimensions: '1920×1080',
        height: 1080,
        bitrateKbps: 10000,
        scaleFilter: exactScale(1920, 1080),
    },
    {
        id: '720p',
        label: '720p',
        dimensions: '1280×720',
        height: 720,
        bitrateKbps: 5000,
        scaleFilter: exactScale(1280, 720),
    },
    {
        id: '576p-wide',
        label: '576p',
        dimensions: '1024×576',
        height: 576,
        bitrateKbps: 3800,
        scaleFilter: exactScale(1024, 576),
    },
    {
        id: '576p',
        label: '576p',
        dimensions: '704×576',
        height: 576,
        bitrateKbps: 3500,
        scaleFilter: exactScale(704, 576),
    },
    {
        id: '540p',
        label: '540p',
        dimensions: '960×540',
        height: 540,
        bitrateKbps: 3000,
        scaleFilter: exactScale(960, 540),
    },
    {
        id: '480p',
        label: '480p',
        dimensions: '854×480',
        height: 480,
        bitrateKbps: 2500,
        scaleFilter: exactScale(854, 480),
    },
    {
        id: '360p',
        label: '360p',
        dimensions: '640×360',
        height: 360,
        bitrateKbps: 1500,
        scaleFilter: exactScale(640, 360),
    },
    {
        id: '240p',
        label: '240p',
        dimensions: '426×240',
        height: 240,
        bitrateKbps: 800,
        scaleFilter: exactScale(426, 240),
    },
    {
        id: '144p',
        label: '144p',
        dimensions: '256×144',
        height: 144,
        bitrateKbps: 400,
        scaleFilter: exactScale(256, 144),
    },
];

export interface TranscodeStartOptions {
    readonly url: string;
    readonly resolutionId: string;
    readonly scaleFilter: string;
    readonly bitrateKbps: number;
    readonly height: number;
    readonly isLive: boolean;
    readonly userAgent?: string;
}

export interface TranscodeStartResult {
    /** Loopback URL the player can open (HLS playlist for live, MP4 for VOD). */
    readonly url: string;
    readonly port: number;
}

export interface TranscodeProgressEvent {
    readonly percent: number;
}

export interface TranscodeErrorEvent {
    readonly message: string;
}

export interface TranscodeListenerHandle {
    remove(): Promise<void>;
}

/**
 * Platform bridge to the native FFmpeg transcoder. Implemented on Android by
 * a Capacitor plugin; absent (null) on every other runtime, where the feature
 * simply hides itself.
 */
export interface TranscodeBridge {
    isAvailable(): Promise<boolean>;
    start(options: TranscodeStartOptions): Promise<TranscodeStartResult>;
    stop(): Promise<void>;
    addListener(
        eventName: 'progress',
        listener: (event: TranscodeProgressEvent) => void
    ): Promise<TranscodeListenerHandle>;
    addListener(
        eventName: 'error',
        listener: (event: TranscodeErrorEvent) => void
    ): Promise<TranscodeListenerHandle>;
}

export const TRANSCODE_BRIDGE = new InjectionToken<TranscodeBridge | null>(
    'TRANSCODE_BRIDGE'
);
