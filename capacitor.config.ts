import type { CapacitorConfig } from '@capacitor/cli';

/**
 * BELOBAKA IPTV Android shell.
 *
 * The Android app is the Angular PWA (apps/web) rendered inside a Capacitor
 * WebView. `webDir` points at the Angular production output that
 * `cap sync android` copies into `android/app/src/main/assets/public`.
 *
 * Cleartext + mixed content are enabled on purpose: IPTV providers commonly
 * serve plain `http://` live streams, and the on-device FFmpeg transcoder
 * publishes its output over a loopback `http://127.0.0.1` server.
 */
const config: CapacitorConfig = {
    appId: 'com.belobaka.iptv',
    appName: 'BELOBAKA IPTV',
    webDir: 'dist/apps/web',
    android: {
        allowMixedContent: true,
        backgroundColor: '#0f1115',
    },
    server: {
        androidScheme: 'https',
        cleartext: true,
    },
};

export default config;
