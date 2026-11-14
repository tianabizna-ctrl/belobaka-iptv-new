/**
 * Direct (WebView → provider) transport for Xtream requests.
 *
 * The Android shell has no Electron main process to run portal requests, and
 * the browser/PWA flow proxies them through the hosted playlist-parser
 * backend — shared upstream infrastructure an installable app must not depend
 * on (it is third-party hosting, and it would carry the user's portal
 * credentials). Xtream panels answer cross-origin requests themselves —
 * `player_api.php` echoes any `Origin` and stream routes send
 * `Access-Control-Allow-Origin: *` — so inside the Capacitor WebView (mixed
 * content allowed) the app calls the portal directly.
 *
 * The request contract mirrors the Electron main handler
 * (`apps/electron-backend/src/app/events/xtream.events.ts`): same URL
 * building, 30 s budget, and `{ payload, action }` result shape.
 */

import { normalizeXtreamServerUrl } from '@iptvnator/shared/interfaces';

/** The Electron transport's network budget for one portal call. */
export const XTREAM_DIRECT_TIMEOUT_MS = 30_000;

/**
 * A successful provider response, in the shape the Electron transport
 * resolves: the parsed body plus the action it was requested for.
 */
export interface DirectXtreamResponse {
    payload: unknown;
    action: string | undefined;
}

/**
 * Builds `…/player_api.php?<params>` the way `buildXtreamApiUrl` does in the
 * Electron main handler: the server URL is normalized (portal export links
 * like `/get.php` or a trailing `/player_api.php` never reach the URL) and
 * the credentials are trimmed. A member without a value is dropped, matching
 * `URLSearchParams.append` semantics.
 *
 * @throws when the server URL is not a usable absolute URL.
 */
export function buildXtreamApiRequestUrl(
    url: string,
    params: Record<string, string>
): URL {
    const apiUrl = new URL(`${normalizeXtreamServerUrl(url)}/player_api.php`);
    Object.entries(params).forEach(([key, value]) => {
        apiUrl.searchParams.append(
            key,
            key === 'username' || key === 'password' ? value.trim() : value
        );
    });
    return apiUrl;
}

/**
 * Fetches one portal call directly from the page context.
 *
 * A browser context cannot override `User-Agent` (a forbidden header) and
 * cannot send a Stalker-style `Cookie`, so those Electron-side options have
 * no equivalent here. Panels accept the WebView's own identity — it is
 * scripted clients (curl) whose connections they reset.
 *
 * Uses an explicit controller rather than `AbortSignal.timeout` so the
 * budget also holds on the older WebViews minSdk allows.
 */
export async function fetchXtreamDirectData(
    url: URL,
    timeoutMs = XTREAM_DIRECT_TIMEOUT_MS
): Promise<DirectXtreamResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url.toString(), {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            const statusText = response.statusText?.trim();
            const error = new Error(
                statusText
                    ? `HTTP Error ${response.status}: ${statusText}`
                    : `HTTP Error ${response.status}`
            ) as Error & { status: number; statusText?: string };
            error.status = response.status;
            error.statusText = statusText;
            throw error;
        }
        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new Error('The portal answer is not valid JSON');
        }
        return { payload, action: url.searchParams.get('action') ?? undefined };
    } finally {
        clearTimeout(timer);
    }
}
