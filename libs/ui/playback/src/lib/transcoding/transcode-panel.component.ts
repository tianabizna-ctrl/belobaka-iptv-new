import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnDestroy,
    computed,
    effect,
    inject,
    input,
    signal,
    untracked,
    viewChild,
} from '@angular/core';
import Hls from 'hls.js';
import { HIDE_CONTROLS_DELAY_MS } from '../player-controls/controls-visibility';
import type { TranscodeResolution } from './transcode-bridge';
import { TranscodingService } from './transcoding.service';

/**
 * On-device transcoding launcher and preview.
 *
 * Self-contained: it renders its own floating button and dialog, and plays the
 * loopback output in its own `<video>` (hls.js for HLS). It does not touch the
 * player engines, so enabling transcoding can never regress normal playback —
 * on a runtime without the native bridge (`supported() === false`) it renders
 * nothing at all.
 */
@Component({
    selector: 'app-transcode-panel',
    templateUrl: './transcode-panel.component.html',
    styleUrls: ['./transcode-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranscodePanelComponent implements OnDestroy {
    /** Current playback URL to transcode. */
    readonly streamUrl = input.required<string>();
    readonly isLive = input(false);
    readonly autoStart = input(false);

    private readonly transcoding = inject(TranscodingService);
    private readonly preview =
        viewChild<ElementRef<HTMLVideoElement>>('preview');
    private hls: Hls | null = null;

    readonly supported = this.transcoding.supported;
    readonly resolutions = this.transcoding.resolutions;
    readonly status = this.transcoding.status;
    readonly progress = this.transcoding.progress;
    readonly error = this.transcoding.error;
    readonly outputUrl = this.transcoding.outputUrl;
    readonly activeId = computed(
        () => this.transcoding.activeResolution()?.id ?? null
    );
    readonly busy = computed(
        () => this.status() === 'starting' || this.status() === 'running'
    );
    readonly opened = signal(false);
    /**
     * The launcher sits over the picture next to the player chrome, so it
     * fades with it: shown on load and after a tap anywhere, hidden again
     * after the same idle delay the controls use. Kept on screen while the
     * dialog is open.
     */
    readonly launcherVisible = signal(true);

    private launcherHideTimer: number | null = null;
    private detachLauncherReveal: (() => void) | null = null;

    constructor() {
        // Probe once so the launcher can appear on devices that support it.
        void this.transcoding.initialize();

        effect(() => {
            this.renderPreview(this.outputUrl(), this.preview()?.nativeElement);
        });

        // A tap is the viewer asking for the chrome; the launcher belongs to
        // it. Capture phase so an engine that swallows the bubble (video.js
        // chrome, the controls surface) cannot hide the gesture from us.
        const revealLauncher = () => this.revealLauncher();
        document.addEventListener('pointerdown', revealLauncher, true);
        this.detachLauncherReveal = () =>
            document.removeEventListener('pointerdown', revealLauncher, true);
        this.scheduleLauncherHide();

        // The panel hides as soon as a resolution is picked; a failure that
        // surfaces afterwards (the native error listener) must be visible, so
        // it brings the panel back.
        effect(() => {
            if (this.status() === 'error') {
                this.opened.set(true);
            }
        });

        // While the dialog is open the launcher is its anchor and must stay;
        // closing it restarts the idle countdown.
        effect(() => {
            if (this.opened()) {
                this.clearLauncherHide();
                this.launcherVisible.set(true);
                return;
            }
            this.scheduleLauncherHide();
        });

        // A channel/source switch retires the running session.
        effect(() => {
            const url = this.streamUrl();
            untracked(() => {
                const running = this.transcoding.sourceUrl();
                if (running && running !== url) {
                    void this.transcoding.stop();
                }
            });
        });

        effect(() => {
            const autoStart = this.autoStart();
            const supported = this.supported();
            const status = this.status();
            const url = this.streamUrl();
            const resolutions = this.resolutions;
            const res144p = (resolutions as TranscodeResolution[]).find((r: TranscodeResolution) => r.id === '144p');

            if (
                autoStart &&
                supported &&
                status === 'idle' &&
                url &&
                res144p
            ) {
                untracked(() => {
                    void this.transcoding.start(
                        url,
                        res144p,
                        this.isLive()
                    );
                });
            }
        });
    }

    toggle(): void {
        if (this.opened()) {
            this.close();
            return;
        }
        this.opened.set(true);
        void this.transcoding.initialize();
    }

    close(): void {
        this.opened.set(false);
    }

    select(resolution: TranscodeResolution): void {
        // Get the panel out of the viewer's way the moment a target is picked:
        // it covers the top-right of the player, and the transcoded output
        // takes over the main player anyway. A failure brings it back so the
        // reason is readable.
        this.opened.set(false);
        void this.transcoding
            .start(this.streamUrl(), resolution, this.isLive())
            .then(() => {
                if (this.transcoding.status() === 'error') {
                    this.opened.set(true);
                }
            });
    }

    stop(): void {
        void this.transcoding.stop();
    }

    ngOnDestroy(): void {
        this.teardownHls();
        this.clearLauncherHide();
        this.detachLauncherReveal?.();
        this.detachLauncherReveal = null;
        void this.transcoding.stop();
    }

    private revealLauncher(): void {
        this.launcherVisible.set(true);
        this.scheduleLauncherHide();
    }

    private scheduleLauncherHide(): void {
        this.clearLauncherHide();
        this.launcherHideTimer = window.setTimeout(() => {
            this.launcherHideTimer = null;
            if (!this.opened()) {
                this.launcherVisible.set(false);
            }
        }, HIDE_CONTROLS_DELAY_MS);
    }

    private clearLauncherHide(): void {
        if (this.launcherHideTimer === null) {
            return;
        }
        window.clearTimeout(this.launcherHideTimer);
        this.launcherHideTimer = null;
    }

    private renderPreview(
        url: string | null,
        element: HTMLVideoElement | undefined
    ): void {
        this.teardownHls();
        if (!element || !url) {
            return;
        }
        if (!url.includes('.m3u8') || element.canPlayType('application/vnd.apple.mpegurl')) {
            element.src = url;
        } else if (Hls.isSupported()) {
            const hls = new Hls({ lowLatencyMode: false, enableWorker: true });
            hls.loadSource(url);
            hls.attachMedia(element);
            this.hls = hls;
        } else {
            element.src = url;
        }
        void element.play().catch(() => undefined);
    }

    private teardownHls(): void {
        this.hls?.destroy();
        this.hls = null;
    }
}
