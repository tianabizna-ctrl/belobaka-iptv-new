import {
    DEFAULT_TRANSCODE_RESOLUTION_ID,
    TRANSCODE_RESOLUTIONS,
} from './transcode-bridge';

/**
 * The requested phone ladder. Kept as a literal list so a careless edit to the
 * transcode-bridge cannot silently drop or re-add a resolution.
 */
const EXPECTED_DIMENSIONS = [
    '1920×1080',
    '1280×720',
    '1024×576',
    '704×576',
    '960×540',
    '854×480',
    '640×360',
    '426×240',
    '256×144',
];

describe('transcode resolution ladder', () => {
    it('offers exactly the requested resolutions, highest first', () => {
        expect(TRANSCODE_RESOLUTIONS.map((entry) => entry.dimensions)).toEqual(
            EXPECTED_DIMENSIONS
        );
    });

    it('keeps every output at the advertised size without distortion', () => {
        for (const resolution of TRANSCODE_RESOLUTIONS) {
            const [width, height] = resolution.dimensions
                .split('×')
                .map((value) => Number.parseInt(value, 10));

            expect(resolution.height).toBe(height);
            expect(resolution.scaleFilter).toContain(
                `scale=${width}:${height}:force_original_aspect_ratio=decrease`
            );
            expect(resolution.scaleFilter).toContain(
                `pad=${width}:${height}:`
            );
        }
    });

    it('lowers the bitrate as the picture gets smaller', () => {
        const bitrates = TRANSCODE_RESOLUTIONS.map(
            (resolution) => resolution.bitrateKbps
        );
        expect(bitrates).toEqual([...bitrates].sort((a, b) => b - a));
    });

    it('defaults to the smallest rung', () => {
        expect(TRANSCODE_RESOLUTIONS.at(-1)?.id).toBe(
            DEFAULT_TRANSCODE_RESOLUTION_ID
        );
    });
});
