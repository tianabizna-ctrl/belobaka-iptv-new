/**
 * Native screen-orientation control for video playback on the Android shell.
 *
 * A viewer watching full-screen video on a phone expects the picture to turn
 * with the content, so starting a stream asks the activity for landscape and
 * leaving playback hands orientation back to the device. This is the web half
 * of the `ScreenOrientation` Capacitor plugin (`tools/mobile-android/plugin`):
 * every call is a no-op outside the native WebView, and `@capacitor/core` is
 * imported lazily so the module never reaches the initial bundle.
 */
interface ScreenOrientationPlugin {
    lockLandscape(): Promise<void>;
    unlock(): Promise<void>;
}

/**
 * `@capacitor/core` is resolved on demand and only on a native platform. The
 * capability is the bridge's own `isNativePlatform()`, evaluated per call so a
 * test double installed after startup is still honoured.
 */
async function resolvePlugin(): Promise<ScreenOrientationPlugin | null> {
    const capacitor = (
        globalThis as {
            Capacitor?: { isNativePlatform?: () => boolean };
        }
    ).Capacitor;
    if (
        typeof capacitor?.isNativePlatform !== 'function' ||
        capacitor.isNativePlatform() !== true
    ) {
        return null;
    }
    try {
        const { registerPlugin } = await import('@capacitor/core');
        return registerPlugin<ScreenOrientationPlugin>('ScreenOrientation');
    } catch {
        return null;
    }
}

/** Turns the player landscape; a no-op off the native shell. */
export function lockPlayerLandscape(): void {
    void resolvePlugin().then((plugin) =>
        plugin?.lockLandscape().catch(() => undefined)
    );
}

/** Returns orientation to the device; a no-op off the native shell. */
export function releasePlayerOrientation(): void {
    void resolvePlugin().then((plugin) =>
        plugin?.unlock().catch(() => undefined)
    );
}
