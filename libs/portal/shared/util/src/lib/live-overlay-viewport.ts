/**
 * The viewport query under which the live layouts float the lists (channels /
 * categories rail and EPG guide) over the player instead of reserving
 * columns beside it. Two arms: any phone-width viewport, and touch-first
 * devices up to a tablet width. A mouse-driven window wider than 640px keeps
 * the side-by-side layout, and so does a very wide touch display, where there
 * is room for both panes.
 *
 * Kept in step with the `@media` blocks in the portal live-layout stylesheets.
 */
export const LIVE_OVERLAY_VIEWPORT_QUERY =
    '(max-width: 640px), (pointer: coarse) and (max-width: 1024px)';

/**
 * True when the live layout renders as a transparent rail over the player.
 * No `matchMedia` (SSR, some test hosts) reads as false — the safe default
 * that keeps the in-flow layout.
 */
export function isLiveOverlayViewport(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia(LIVE_OVERLAY_VIEWPORT_QUERY).matches
    );
}
