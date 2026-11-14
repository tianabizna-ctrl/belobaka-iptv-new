#!/usr/bin/env node
/**
 * BELOBAKA IPTV brand asset generator.
 *
 * Generates every icon/logo the Android app, the PWA manifest and the web
 * shell need from a single vector definition, so the branding can never drift
 * between platforms.
 *
 * Usage: node tools/branding/generate-belobaka-assets.mjs
 *
 * Outputs
 *  - apps/web/src/assets/icons/*            (PWA manifest + favicon + about)
 *  - android/app/src/main/res/**            (adaptive mipmaps + splash)
 *  - android/app/src/main/res/values/colors.xml (launcher background colour)
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const WEB_ICONS = join(ROOT, 'apps', 'web', 'src', 'assets', 'icons');
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// --- Brand palette ---------------------------------------------------------
const BRAND = {
    gradientFrom: '#6D28D9', // violet
    gradientTo: '#1B1140', // deep indigo
    signal: '#22D3EE', // cyan
    play: '#FFC53D', // amber
    ink: '#0F1115',
};

// --- Vector primitives -----------------------------------------------------

/** Full-bleed gradient background used by the legacy icon and adaptive bg. */
function backgroundSvg(size = 1024) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.gradientFrom}"/>
      <stop offset="1" stop-color="${BRAND.gradientTo}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;
}

/**
 * The mark itself: a rounded "screen" with a play triangle and signal waves.
 * Drawn into the central 66% safe zone so it survives adaptive-icon masking.
 */
function markSvg({ scale = 1 } = {}) {
    const cx = 512;
    const cy = 530;
    const s = scale;
    const screenW = 540 * s;
    const screenH = 360 * s;
    const x = cx - screenW / 2;
    const y = cy - screenH / 2;
    const r = 72 * s;
    const stroke = 40 * s;
    const play = 132 * s;
    const px = cx - play * 0.42;
    const pyTop = cy - play * 0.62;
    const pyBot = cy + play * 0.62;
    const pxTip = cx + play * 0.62;
    // Signal waves above the screen.
    const waveY = y - 96 * s;
    return `<g>
    <rect x="${x}" y="${y}" width="${screenW}" height="${screenH}" rx="${r}" ry="${r}"
      fill="none" stroke="#FFFFFF" stroke-opacity="0.92" stroke-width="${stroke}"/>
    <path d="M ${px} ${pyTop} L ${px} ${pyBot} L ${pxTip} ${cy} Z" fill="${BRAND.play}"/>
    <path d="M ${cx - 118 * s} ${waveY} a ${118 * s} ${118 * s} 0 0 1 ${236 * s} 0"
      fill="none" stroke="${BRAND.signal}" stroke-width="${26 * s}" stroke-linecap="round"/>
    <path d="M ${cx - 66 * s} ${waveY} a ${66 * s} ${66 * s} 0 0 1 ${132 * s} 0"
      fill="none" stroke="#FFFFFF" stroke-width="${26 * s}" stroke-linecap="round"/>
  </g>`;
}

/** Rounded-square legacy icon: gradient background + mark. */
function legacySvg(size = 1024, radiusRatio = 0.22) {
    const r = Math.round(size * radiusRatio);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.gradientFrom}"/>
      <stop offset="1" stop-color="${BRAND.gradientTo}"/>
    </linearGradient>
    <clipPath id="round"><rect width="1024" height="1024" rx="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#round)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    ${markSvg({ scale: 0.92 })}
  </g>
</svg>`;
}

/** Circular legacy icon for `ic_launcher_round`. */
function roundSvg(size = 1024) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.gradientFrom}"/>
      <stop offset="1" stop-color="${BRAND.gradientTo}"/>
    </linearGradient>
    <clipPath id="circle"><circle cx="512" cy="512" r="512"/></clipPath>
  </defs>
  <g clip-path="url(#circle)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    ${markSvg({ scale: 0.86 })}
  </g>
</svg>`;
}

/** Transparent foreground layer for the adaptive icon. */
function foregroundSvg(size = 1024) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${markSvg({ scale: 0.66 })}
</svg>`;
}

/**
 * Maskable PWA icon: full-bleed gradient with the mark shrunk into the ~60%
 * safe zone, so a circular or squircle launcher mask never clips it.
 */
function maskableSvg(size = 1024) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.gradientFrom}"/>
      <stop offset="1" stop-color="${BRAND.gradientTo}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${markSvg({ scale: 0.6 })}
</svg>`;
}

/** Splash: brand background with the mark and wordmark. */
function splashSvg(width, height) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#241a4d"/>
      <stop offset="1" stop-color="${BRAND.ink}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g transform="translate(${(width - 1024) / 2}, ${(height - 1024) / 2 - 40})">${markSvg({ scale: 0.92 })}</g>
  <text x="${width / 2}" y="${height / 2 + 470}" text-anchor="middle"
    font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="104" font-weight="700"
    fill="#FFFFFF" letter-spacing="6">BELOBAKA IPTV</text>
</svg>`;
}

// --- Rasterisation helpers -------------------------------------------------

async function render(svg, size, out) {
    await mkdir(dirname(out), { recursive: true });
    const buffer = await sharp(Buffer.from(svg), { density: 384 })
        .resize(size, size)
        .png()
        .toBuffer();
    await writeFile(out, buffer);
}

async function renderSized(svg, width, height, out) {
    await mkdir(dirname(out), { recursive: true });
    const buffer = await sharp(Buffer.from(svg), { density: 384 })
        .resize(width, height)
        .png()
        .toBuffer();
    await writeFile(out, buffer);
}

/** Minimal ICO container with embedded PNG frames (valid on Vista+). */
async function writeIco(svg, sizes, out) {
    const frames = await Promise.all(
        sizes.map((s) =>
            sharp(Buffer.from(svg), { density: 384 }).resize(s, s).png().toBuffer()
        )
    );
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(frames.length, 4);
    const dir = Buffer.alloc(16 * frames.length);
    let offset = 6 + 16 * frames.length;
    frames.forEach((png, i) => {
        const e = 16 * i;
        const dim = sizes[i] >= 256 ? 0 : sizes[i];
        dir.writeUInt8(dim, e + 0);
        dir.writeUInt8(dim, e + 1);
        dir.writeUInt8(0, e + 2); // palette
        dir.writeUInt8(0, e + 3); // reserved
        dir.writeUInt16LE(1, e + 4); // planes
        dir.writeUInt16LE(32, e + 6); // bpp
        dir.writeUInt32LE(png.length, e + 8);
        dir.writeUInt32LE(offset, e + 12);
        offset += png.length;
    });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.concat([header, dir, ...frames]));
}

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

// --- Web icons -------------------------------------------------------------

async function generateWebIcons() {
    const legacy = legacySvg();
    const round = roundSvg();
    const any = maskableSvg(); // padded for maskable safe zone
    const jobs = [
        ['favicon.256x256.png', legacy, 256],
        ['favicon.512x512.png', legacy, 512],
        ['favicon.png', legacy, 256],
        ['icon.png', legacy, 512],
        ['icon-16.png', legacy, 16],
        ['icon-32.png', legacy, 32],
        ['icon-48.png', legacy, 48],
        ['icon-64.png', legacy, 64],
        ['icon-128.png', legacy, 128],
        ['icon-1024.png', legacy, 1024],
        ['apple-touch-icon.png', legacy, 180],
        ['android-chrome-192x192.png', legacy, 192],
        ['android-chrome-512x512.png', legacy, 512],
        ['android-chrome-maskable-192x192.png', any, 192],
        ['android-chrome-maskable-512x512.png', any, 512],
        ['icon-tv-256.png', round, 256],
    ];
    for (const [name, svg, size] of jobs) {
        await render(svg, size, join(WEB_ICONS, name));
    }
    await writeIco(legacy, [16, 32, 48, 64], join(WEB_ICONS, 'favicon.ico'));
    console.log(`  web icons -> ${WEB_ICONS}`);
}

// --- Android icons ---------------------------------------------------------

const ANDROID_DENSITIES = [
    ['mdpi', 1],
    ['hdpi', 1.5],
    ['xhdpi', 2],
    ['xxhdpi', 3],
    ['xxxhdpi', 4],
];

async function generateAndroidIcons() {
    if (!(await exists(ANDROID_RES))) {
        console.log('  android/ not present yet — skipping native icons');
        return false;
    }
    const legacy = legacySvg();
    const round = roundSvg();
    const fg = foregroundSvg();
    const bg = backgroundSvg();
    for (const [density, factor] of ANDROID_DENSITIES) {
        const dir = join(ANDROID_RES, `mipmap-${density}`);
        await render(legacy, Math.round(48 * factor), join(dir, 'ic_launcher.png'));
        await render(round, Math.round(48 * factor), join(dir, 'ic_launcher_round.png'));
        await render(fg, Math.round(108 * factor), join(dir, 'ic_launcher_foreground.png'));
        await render(bg, Math.round(108 * factor), join(dir, 'ic_launcher_background.png'));
    }
    const anydpi = join(ANDROID_RES, 'mipmap-anydpi-v26');
    await mkdir(anydpi, { recursive: true });
    const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
    await writeFile(join(anydpi, 'ic_launcher.xml'), adaptive);
    await writeFile(join(anydpi, 'ic_launcher_round.xml'), adaptive);

    // Splash screens (portrait + landscape at the common densities).
    const splashes = [
        ['drawable/splash.png', 480, 800],
        ['drawable-land-hdpi/splash.png', 800, 480],
        ['drawable-land-xhdpi/splash.png', 1280, 720],
        ['drawable-land-xxhdpi/splash.png', 1600, 960],
        ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
        ['drawable-port-mdpi/splash.png', 320, 480],
        ['drawable-port-hdpi/splash.png', 480, 800],
        ['drawable-port-xhdpi/splash.png', 720, 1280],
        ['drawable-port-xxhdpi/splash.png', 960, 1600],
        ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
    ];
    for (const [rel, w, h] of splashes) {
        await renderSized(splashSvg(w, h), w, h, join(ANDROID_RES, rel));
    }
    console.log(`  android icons -> ${ANDROID_RES}`);
    return true;
}

async function main() {
    console.log('BELOBAKA IPTV — generating brand assets');
    await generateWebIcons();
    await generateAndroidIcons();
    console.log('Done.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
