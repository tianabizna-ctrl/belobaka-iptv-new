import { inject, provideAppInitializer } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
    PlaylistStorageBackend,
    PlaylistsService,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import {
    extractXtreamCredentialsFromUrl,
    normalizeXtreamServerUrl,
    Playlist,
} from '@iptvnator/shared/interfaces';

/**
 * Built-in BELOBAKA IPTV source.
 *
 * The user asked for their subscription to ship with the app, so the Android
 * (PWA) build seeds this Xtream Code portal on first launch. The URL is the
 * panel's M3U export; we only read the username/password from it and derive
 * the API base (`player_api.php`) the same way the Xtream import dialog does,
 * so the embedded source behaves exactly like one added by hand.
 *
 * NOTE: these credentials are intentionally embedded (the user's own
 * subscription) and are therefore visible in the shipped APK.
 */
export const BELOBAKA_EMBEDDED_XTREAM_URL =
    'http://megatv5074.com:80/get.php?username=81NQAFA7Q5S4188&password=JWyIZeiu08&type=m3u_plus';

/** Stable id so seeding is idempotent across launches. */
const BUILT_IN_SOURCE_ID = 'belobaka-iptv-xtream';
const BUILT_IN_SOURCE_TITLE = 'BELOBAKA IPTV';

function createBuiltInXtreamPlaylist(): Playlist | null {
    const credentials = extractXtreamCredentialsFromUrl(
        BELOBAKA_EMBEDDED_XTREAM_URL
    );
    if (!credentials) {
        return null;
    }

    let serverUrl: string;
    try {
        serverUrl = normalizeXtreamServerUrl(BELOBAKA_EMBEDDED_XTREAM_URL);
    } catch {
        return null;
    }

    const now = new Date().toISOString();
    return {
        _id: BUILT_IN_SOURCE_ID,
        title: BUILT_IN_SOURCE_TITLE,
        serverUrl,
        username: credentials.username,
        password: credentials.password,
        count: 0,
        importDate: now,
        lastUsage: now,
        autoRefresh: true,
        favorites: [],
        recentlyViewed: [],
    };
}

/**
 * Idempotently adds the built-in source. Only the browser/PWA runtime stores
 * its library in IndexedDB — desktop Electron and self-hosted server storage
 * are deliberately left untouched so this never writes to a user's real DB.
 */
export async function seedBuiltInSource(): Promise<void> {
    const runtime = inject(RuntimeCapabilitiesService);
    const storage = inject(PlaylistStorageBackend);
    const playlists = inject(PlaylistsService);

    if (!runtime.isPwa || storage.kind() !== 'indexeddb') {
        return;
    }

    const playlist = createBuiltInXtreamPlaylist();
    if (!playlist) {
        return;
    }

    try {
        const existing = await firstValueFrom(playlists.getAllPlaylists());
        const existingPlaylist = existing.find((item) => item._id === playlist._id);
        if (existingPlaylist) {
            if (
                existingPlaylist.username !== playlist.username ||
                existingPlaylist.password !== playlist.password
            ) {
                await firstValueFrom(
                    playlists.updatePlaylist(playlist._id, {
                        ...existingPlaylist,
                        username: playlist.username,
                        password: playlist.password,
                    })
                );
            }
            return;
        }
        await firstValueFrom(playlists.addPlaylist(playlist));
    } catch (error) {
        // Never block startup on seeding; the user can still add the source
        // manually if the built-in one fails to persist.
        console.warn('[BELOBAKA IPTV] built-in source seeding skipped', error);
    }
}

export function provideBuiltInSource() {
    return provideAppInitializer(() => seedBuiltInSource());
}
