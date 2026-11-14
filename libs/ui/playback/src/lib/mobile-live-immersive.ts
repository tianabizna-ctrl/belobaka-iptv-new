import { lockPlayerLandscape, releasePlayerOrientation } from './player-orientation';

/**
 * Mobile live-TV "immersive start": the one gesture that turns a tap on a
 * channel row into the state a phone viewer expects — the device locked to
 * landscape and the player filling the screen, both released again when the
 * stream or the surface goes away.
 *
 * Fullscreen and orientation are two halves of one effect, which is why they
 * live behind one pair of functions instead of being called side by side at
 * two call sites: DOM fullscreen (`requestFullscreen`) only stretches the
 * element to the WebView viewport; the native orientation lock
 * (`lockPlayerLandscape`) is what actually turns the device. Neither alone
 * produces a fullscreen landscape player.
 *
 * The fullscreen target is always the `app-web-player-view` host element
 * (`WebPlayerViewComponent.fullscreenSurface`) — the same element the shared
 * controls and the fullscreen channel panel track — so an immersive enter
 * never forks the app's notion of "we are in fullscreen": the controls
 * button, the `f` key, and the panel all observe the same element.
 *
 * Off the live-overlay viewport (desktop windows) the callers never invoke
 * these helpers, so the module is inert there; every call is also a no-op
 * outside a document (SSR, test hosts).
 */

/**
 * Whether a channel activation should enter the immersive state. Kept as a
 * predicate so both live surfaces (M3U playlist player and the unified live
 * tab) derive the same answer from the same three facts: the channel plays
 * inline live video, the setting is on, and the phone layout applies.
 */
export function shouldStartMobileLiveImmersive(options: {
    readonly channelLiveVideo: boolean;
    readonly settingEnabled: boolean;
    readonly overlayViewport: boolean;
}): boolean {
    return (
        options.channelLiveVideo &&
        options.settingEnabled &&
        options.overlayViewport
    );
}

/**
 * Enters immersive playback on the given surface: locks the device to
 * landscape and requests DOM fullscreen on it.
 *
 * Idempotent per effect run: a channel-to-channel switch re-runs the enter
 * path while already fullscreen, and re-requesting fullscreen on the element
 * the browser already has fullscreen would reject, so an already-fullscreen
 * document short-circuits (the orientation lock is re-issued regardless —
 * it is cheap and keeps the lock alive across surfaces).
 */
export function enterMobileLiveImmersive(surface: HTMLElement | null): void {
    lockPlayerLandscape();
    if (
        !surface ||
        typeof document === 'undefined' ||
        document.fullscreenElement
    ) {
        return;
    }
    void surface.requestFullscreen?.().catch(() => undefined);
}

/**
 * Leaves immersive playback: exits DOM fullscreen and hands orientation
 * back to the device. Safe when not fullscreen (an exit while portrait, a
 * radio channel after a video one); the fullscreen exit is skipped when the
 * document is not fullscreen so an unrelated fullscreen (a series episode
 * panel on the same stage) cannot be yanked away by a live-surface exit.
 *
 * `releaseOrientation` is false when the caller only wants to drop the
 * fullscreen half (another surface is about to re-lock).
 */
export function exitMobileLiveImmersive(
    releaseOrientation = true,
    surface?: HTMLElement | null
): void {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
        // Only exit fullscreen this state owns: the live surfaces always
        // fullscreen the web-player-view host, so an unrelated fullscreen
        // (a series episode panel on the same stage) is left alone.
        const target = surface ?? document.fullscreenElement;
        if (document.fullscreenElement === target) {
            void document.exitFullscreen?.().catch(() => undefined);
        }
    }
    if (releaseOrientation) {
        releasePlayerOrientation();
    }
}
