import { Injectable, inject, signal } from '@angular/core';
import { XTREAM_CLIENT_USER_AGENT } from '@iptvnator/shared/interfaces';
import { createCapacitorTranscodeBridge } from './capacitor-transcode.bridge';
import {
    TRANSCODE_BRIDGE,
    TRANSCODE_RESOLUTIONS,
    type TranscodeBridge,
    type TranscodeResolution,
} from './transcode-bridge';

export type TranscodeStatus = 'idle' | 'starting' | 'running' | 'error';

/**
 * Owns the on-device transcoding session: which resolution is active, progress
 * and the loopback URL the preview plays. Rendering is driven entirely by these
 * signals, so the panel stays a thin view over this service.
 *
 * The bridge is an injected `TRANSCODE_BRIDGE` when a host provides one
 * (tests, future platforms), otherwise the Capacitor plugin bridge is created
 * lazily. Only a runtime that actually opens the panel ever loads it.
 */
@Injectable({ providedIn: 'root' })
export class TranscodingService {
    private readonly injectedBridge = inject(TRANSCODE_BRIDGE, {
        optional: true,
    });

    readonly resolutions = TRANSCODE_RESOLUTIONS;
    /** Whether a native transcoder answered. Resolved on first panel open. */
    readonly supported = signal(false);
    readonly status = signal<TranscodeStatus>('idle');
    readonly progress = signal(0);
    readonly error = signal<string | null>(null);
    readonly activeResolution = signal<TranscodeResolution | null>(null);
    readonly outputUrl = signal<string | null>(null);
    /** Source the running session was started from. */
    readonly sourceUrl = signal<string | null>(null);

    /** `undefined` until resolved; `null` when no bridge exists at all. */
    private bridge: TranscodeBridge | null | undefined;
    private probe: Promise<boolean> | null = null;

    async initialize(): Promise<boolean> {
        this.probe ??= this.runProbe();
        return this.probe;
    }

    async start(
        url: string,
        resolution: TranscodeResolution,
        isLive: boolean,
        userAgent?: string
    ): Promise<void> {
        await this.initialize();
        const bridge = this.bridge;
        if (!bridge || !this.supported()) {
            this.fail('On-device transcoding is unavailable on this device.');
            return;
        }

        this.status.set('starting');
        this.progress.set(0);
        this.error.set(null);
        this.outputUrl.set(null);
        this.activeResolution.set(resolution);
        this.sourceUrl.set(url);

        try {
            const result = await bridge.start({
                url,
                resolutionId: resolution.id,
                scaleFilter: resolution.scaleFilter,
                bitrateKbps: resolution.bitrateKbps,
                height: resolution.height,
                isLive,
                // Providers that reject a generic FFmpeg client still accept an
                // established IPTV player; the same VLC identity the Xtream
                // transport uses keeps the transcode fetch aligned with it.
                userAgent: userAgent ?? XTREAM_CLIENT_USER_AGENT,
            });
            this.outputUrl.set(result.url);
            this.status.set('running');
        } catch (error) {
            this.fail(readMessage(error));
        }
    }

    async stop(): Promise<void> {
        this.activeResolution.set(null);
        this.outputUrl.set(null);
        this.sourceUrl.set(null);
        this.progress.set(0);
        this.status.set('idle');
        this.error.set(null);
        await this.bridge?.stop().catch(() => undefined);
    }

    private async runProbe(): Promise<boolean> {
        const bridge = await this.resolveBridge();
        if (!bridge) {
            this.supported.set(false);
            return false;
        }
        const available = await bridge.isAvailable().catch(() => false);
        this.supported.set(available);
        if (available) {
            this.attachListeners(bridge);
        }
        return available;
    }

    private async resolveBridge(): Promise<TranscodeBridge | null> {
        if (this.bridge !== undefined) {
            return this.bridge;
        }
        this.bridge =
            this.injectedBridge ??
            (await createCapacitorTranscodeBridge().catch(() => null));
        return this.bridge;
    }

    private attachListeners(bridge: TranscodeBridge): void {
        void bridge.addListener('progress', (event) => {
            this.progress.set(Math.max(0, Math.min(100, event.percent)));
        });
        void bridge.addListener('error', (event) => {
            this.fail(event.message);
        });
    }

    private fail(message: string): void {
        this.status.set('error');
        this.error.set(message);
    }
}

function readMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Transcoding failed.';
}
