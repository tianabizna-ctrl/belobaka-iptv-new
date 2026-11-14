export type PortalDebugProvider = 'xtream' | 'stalker';

export type PortalDebugTransport =
    | 'electron-main'
    | 'electron-renderer'
    | 'pwa-http'
    // Capacitor WebView calling the portal directly (no parser backend).
    | 'pwa-direct';

export type PortalDebugStatus = 'success' | 'error';

export interface PortalDebugEvent {
    requestId: string;
    provider: PortalDebugProvider;
    operation: string;
    transport: PortalDebugTransport;
    startedAt: string;
    durationMs: number;
    status: PortalDebugStatus;
    request: unknown;
    response?: unknown;
    error?: unknown;
}
