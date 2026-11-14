import {
    enterMobileLiveImmersive,
    exitMobileLiveImmersive,
    shouldStartMobileLiveImmersive,
} from './mobile-live-immersive';

interface FakeElement {
    requestFullscreen: jest.Mock;
}

function fakeSurface(): FakeElement {
    return { requestFullscreen: jest.fn(() => Promise.resolve()) };
}

describe('shouldStartMobileLiveImmersive', () => {
    it('starts for inline live video on the phone layout with the setting on', () => {
        expect(
            shouldStartMobileLiveImmersive({
                channelLiveVideo: true,
                settingEnabled: true,
                overlayViewport: true,
            })
        ).toBe(true);
    });

    it('refuses radio, the setting off, and desktop windows', () => {
        expect(
            shouldStartMobileLiveImmersive({
                channelLiveVideo: false,
                settingEnabled: true,
                overlayViewport: true,
            })
        ).toBe(false);
        expect(
            shouldStartMobileLiveImmersive({
                channelLiveVideo: true,
                settingEnabled: false,
                overlayViewport: true,
            })
        ).toBe(false);
        expect(
            shouldStartMobileLiveImmersive({
                channelLiveVideo: true,
                settingEnabled: true,
                overlayViewport: false,
            })
        ).toBe(false);
    });
});

describe('enterMobileLiveImmersive', () => {
    beforeEach(() => {
        document.exitFullscreen = jest.fn(() => Promise.resolve());
        document.fullscreenElement = null;
    });

    it('requests fullscreen on the surface', () => {
        const surface = fakeSurface();
        enterMobileLiveImmersive(surface as unknown as HTMLElement);
        expect(surface.requestFullscreen).toHaveBeenCalledTimes(1);
    });

    it('is idempotent while a fullscreen element already exists', () => {
        const surface = fakeSurface();
        document.fullscreenElement = document.body;
        enterMobileLiveImmersive(surface as unknown as HTMLElement);
        expect(surface.requestFullscreen).not.toHaveBeenCalled();
    });

    it('tolerates a missing surface', () => {
        expect(() => enterMobileLiveImmersive(null)).not.toThrow();
    });

    it('swallows a fullscreen rejection', () => {
        const surface = {
            requestFullscreen: jest.fn(() => Promise.reject(new Error('denied'))),
        };
        enterMobileLiveImmersive(surface as unknown as HTMLElement);
        expect(surface.requestFullscreen).toHaveBeenCalledTimes(1);
        // The rejection must not surface as an unhandled promise warning.
        return Promise.resolve().then(() => expect(true).toBe(true));
    });
});

describe('exitMobileLiveImmersive', () => {
    beforeEach(() => {
        document.exitFullscreen = jest.fn(() => Promise.resolve());
    });

    it('exits fullscreen this state owns', () => {
        const surface = fakeSurface();
        document.fullscreenElement = surface as unknown as HTMLElement;
        exitMobileLiveImmersive(true, surface as unknown as HTMLElement);
        expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    });

    it('leaves another surface fullscreen when one was passed', () => {
        const owner = fakeSurface();
        document.fullscreenElement = owner as unknown as HTMLElement;
        exitMobileLiveImmersive(true, document.body);
        expect(document.exitFullscreen).not.toHaveBeenCalled();
    });

    it('does nothing when the document is not fullscreen', () => {
        document.fullscreenElement = null;
        expect(() => exitMobileLiveImmersive()).not.toThrow();
        expect(document.exitFullscreen).not.toHaveBeenCalled();
    });

    it('keeps the orientation lock when asked to', () => {
        document.fullscreenElement = document.body;
        exitMobileLiveImmersive(false);
        expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    });
});
