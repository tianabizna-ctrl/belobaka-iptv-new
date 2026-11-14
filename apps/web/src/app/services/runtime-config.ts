import { AppConfig } from '../../environments/environment';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';

export interface IptvnatorRuntimeConfig {
    readonly BACKEND_URL?: string;
}

export function resolveBackendUrl(
    runtimeConfig: IptvnatorRuntimeConfig | undefined,
    fallbackUrl: string
): string {
    const runtimeUrl = runtimeConfig?.BACKEND_URL?.trim();
    return runtimeUrl || fallbackUrl;
}

export function getRuntimeBackendUrl(): string {
    if (sourceConnection() && !globalThis.window?.electron) return sourceConnection()!.apiUrl;
    return resolveBackendUrl(
        globalThis.window?.__IPTVNATOR_CONFIG__,
        AppConfig.BACKEND_URL
    );
}

export interface ServiceWorkerRuntimeContext {
    readonly electronBridge?: unknown;
    readonly protocol?: string;
    /** Capacitor injects this global in its native WebView. */
    readonly capacitor?: unknown;
}

function getDefaultServiceWorkerRuntimeContext(): ServiceWorkerRuntimeContext {
    const browserWindow = globalThis.window as
        | (Window & { electron?: unknown; Capacitor?: unknown })
        | undefined;

    return {
        electronBridge: browserWindow?.electron,
        // The Capacitor WebView serves the app from a local origin; the Angular
        // service worker would then pin stale bundles across app updates, so it
        // is disabled there (the Android shell bundles the assets anyway).
        capacitor: browserWindow?.Capacitor,
        protocol:
            browserWindow?.location?.protocol ?? globalThis.location?.protocol,
    };
}

export function shouldEnableServiceWorker(
    production = AppConfig.production,
    navigatorRef: Navigator | undefined = globalThis.navigator,
    runtimeContext = getDefaultServiceWorkerRuntimeContext()
): boolean {
    return (
        production &&
        !!navigatorRef &&
        'serviceWorker' in navigatorRef &&
        !runtimeContext.electronBridge &&
        !runtimeContext.capacitor &&
        runtimeContext.protocol !== 'file:'
    );
}
