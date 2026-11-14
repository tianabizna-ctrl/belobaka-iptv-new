import {
    buildXtreamApiRequestUrl,
    fetchXtreamDirectData,
} from './xtream-direct-transport';
import { isCapacitorCapableRuntime } from './capacitor-runtime';

type FetchMock = jest.Mock;

function installFetchMock(response: Partial<Response> | (() => unknown)) {
    const fetchMock: FetchMock = jest.fn(async () => {
        if (typeof response === 'function') {
            throw response();
        }
        return response;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

function jsonResponse(body: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 401,
        statusText: ok ? 'OK' : 'Unauthorized',
        json: async () => body,
    } as unknown as Response;
}

describe('direct Xtream transport', () => {
    afterEach(() => {
        delete (globalThis as { Capacitor?: unknown }).Capacitor;
        delete (globalThis as { fetch?: unknown }).fetch;
    });

    describe('buildXtreamApiRequestUrl', () => {
        it('normalizes the server URL and appends player_api.php', () => {
            expect(
                buildXtreamApiRequestUrl(
                    'http://host.example:8080/get.php?username=u&password=p&type=m3u_plus',
                    { username: 'u', password: 'p', action: 'get_live_categories' }
                ).toString()
            ).toBe(
                'http://host.example:8080/player_api.php?username=u&password=p&action=get_live_categories'
            );
        });

        it('trims the credentials like the Electron transport does', () => {
            const url = buildXtreamApiRequestUrl('http://host.example', {
                username: ' u ',
                password: ' p ',
            });
            expect(url.searchParams.get('username')).toBe('u');
            expect(url.searchParams.get('password')).toBe('p');
        });

        it('omits the action when the request carries none', () => {
            const url = buildXtreamApiRequestUrl('http://host.example', {
                username: 'u',
                password: 'p',
            });
            expect(url.searchParams.get('action')).toBeNull();
        });
    });

    describe('fetchXtreamDirectData', () => {
        it('returns the parsed payload with the requested action', async () => {
            const fetchMock = installFetchMock(
                jsonResponse({ auth: 1, user_info: { status: 'Active' } })
            );
            const url = buildXtreamApiRequestUrl('http://host.example', {
                username: 'u',
                password: 'p',
                action: 'get_account_info',
            });

            const result = await fetchXtreamDirectData(url);

            expect(result).toEqual({
                payload: { auth: 1, user_info: { status: 'Active' } },
                action: 'get_account_info',
            });
            const [requestUrl, init] = fetchMock.mock.calls[0];
            // The WebView's own User-Agent is not overridable and must not be
            // sent; a plain JSON accept header keeps the request simple
            // (CORS-safelisted, so no preflight).
            expect((init as RequestInit).headers).toEqual({
                Accept: 'application/json',
            });
            expect(String(requestUrl)).toBe(url.toString());
        });

        it('throws an error carrying the HTTP status on a refusal', async () => {
            installFetchMock(jsonResponse({}, false));
            const url = buildXtreamApiRequestUrl('http://host.example', {
                username: 'u',
                password: 'p',
            });

            const failure = await fetchXtreamDirectData(url).catch(
                (error: unknown) => error
            );

            expect((failure as Error).message).toBe(
                'HTTP Error 401: Unauthorized'
            );
            expect((failure as { status?: number }).status).toBe(401);
        });

        it('rejects a 200 answer that is not JSON instead of returning it', async () => {
            installFetchMock({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => {
                    throw new SyntaxError('Unexpected token');
                },
            } as unknown as Response);

            await expect(
                fetchXtreamDirectData(
                    buildXtreamApiRequestUrl('http://host.example', {})
                )
            ).rejects.toThrow('not valid JSON');
        });

        it('surfaces network aborts so callers report a connection failure', async () => {
            installFetchMock(() => new DOMException('Aborted', 'AbortError'));
            await expect(
                fetchXtreamDirectData(
                    buildXtreamApiRequestUrl('http://host.example', {})
                )
            ).rejects.toThrow('Aborted');
        });
    });

    describe('isCapacitorCapableRuntime', () => {
        it('is true only when the native platform bridge reports itself', () => {
            (
                globalThis as { Capacitor?: { isNativePlatform: () => boolean } }
            ).Capacitor = { isNativePlatform: () => true };
            expect(isCapacitorCapableRuntime()).toBe(true);
        });

        it('is false when the global is absent', () => {
            expect(isCapacitorCapableRuntime()).toBe(false);
        });

        it('is false when the bridge exists but denies the native platform', () => {
            (
                globalThis as { Capacitor?: { isNativePlatform: () => boolean } }
            ).Capacitor = { isNativePlatform: () => false };
            expect(isCapacitorCapableRuntime()).toBe(false);
        });
    });
});
