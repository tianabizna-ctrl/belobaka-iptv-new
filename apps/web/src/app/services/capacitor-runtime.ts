/**
 * Capability check for the Capacitor native WebView (the Android shell).
 *
 * Runtime behavior follows the relevant capability contract: a bare
 * `window.Capacitor` object is not proof that the native bridge is available,
 * so `isNativePlatform()` must exist *and* report true. Evaluated per call —
 * test doubles can install the global after startup — and cheap enough to
 * gate every request.
 */
export function isCapacitorCapableRuntime(): boolean {
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
