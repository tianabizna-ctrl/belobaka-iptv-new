import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HIDE_CONTROLS_DELAY_MS } from '../player-controls/controls-visibility';
import {
    TRANSCODE_BRIDGE,
    TRANSCODE_RESOLUTIONS,
    type TranscodeBridge,
} from './transcode-bridge';
import { TranscodePanelComponent } from './transcode-panel.component';
import { TranscodingService } from './transcoding.service';

/**
 * Minimal bridge double: only `isAvailable`/`start`/`stop` matter here, and
 * `start` is left unresolved so the panel exercises its own "hide, then let
 * the session report back" flow.
 */
class FakeTranscodeBridge implements TranscodeBridge {
    isAvailable = jest.fn(async () => true);
    start = jest.fn(
        () =>
            new Promise<{ url: string; port: number }>(() => {
                /* resolved by the test that needs it */
            })
    );
    stop = jest.fn(async () => undefined);
    addListener = jest.fn(async () => ({ remove: async () => undefined }));
}

describe('TranscodePanelComponent', () => {
    let fixture: ComponentFixture<TranscodePanelComponent>;
    let component: TranscodePanelComponent;
    let bridge: FakeTranscodeBridge;

    beforeEach(async () => {
        bridge = new FakeTranscodeBridge();
        await TestBed.configureTestingModule({
            imports: [TranscodePanelComponent],
            providers: [{ provide: TRANSCODE_BRIDGE, useValue: bridge }],
        }).compileComponents();

        fixture = TestBed.createComponent(TranscodePanelComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('streamUrl', 'http://example.test/live');
        fixture.detectChanges();
        // Let the constructor's availability probe settle (zoneless apps do not
        // track a bare promise in `whenStable`).
        await TestBed.inject(TranscodingService).initialize();
        await fixture.whenStable();
        fixture.detectChanges();
    });

    it('hides the panel as soon as a resolution is chosen', async () => {
        await fixture.whenStable();
        expect(bridge.isAvailable).toHaveBeenCalled();

        component.toggle();
        fixture.detectChanges();
        expect(component.opened()).toBe(true);

        const [first] = TRANSCODE_RESOLUTIONS;
        component.select(first);
        fixture.detectChanges();

        expect(component.opened()).toBe(false);
        // `start()` awaits the (already-settled) availability probe first, and a
        // zoneless `whenStable()` does not flush bare promise continuations.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(bridge.start).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'http://example.test/live' })
        );
    });

    it('brings the panel back when the start fails', async () => {
        await fixture.whenStable();
        bridge.start.mockRejectedValueOnce(new Error('boom'));

        component.toggle();
        component.select(TRANSCODE_RESOLUTIONS[0]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        fixture.detectChanges();

        expect(TestBed.inject(TranscodingService).status()).toBe('error');
        expect(component.opened()).toBe(true);
    });

    // Fake timers need to be installed before the component schedules its idle
    // countdown, so these rebuild their own fixture instead of using the one
    // above (created on the real clock).
    describe('launcher auto-hide', () => {
        let launcherFixture: ComponentFixture<TranscodePanelComponent>;

        beforeEach(() => {
            fixture.destroy();
            jest.useFakeTimers();
            launcherFixture = TestBed.createComponent(TranscodePanelComponent);
            launcherFixture.componentRef.setInput(
                'streamUrl',
                'http://example.test/live'
            );
            launcherFixture.detectChanges();
        });

        afterEach(() => {
            launcherFixture.destroy();
            jest.useRealTimers();
        });

        it('fades the launcher after the idle delay and shows it again on a tap', () => {
            const launcher = launcherFixture.componentInstance;
            expect(launcher.launcherVisible()).toBe(true);

            jest.advanceTimersByTime(HIDE_CONTROLS_DELAY_MS + 1);
            expect(launcher.launcherVisible()).toBe(false);

            document.dispatchEvent(new Event('pointerdown'));
            expect(launcher.launcherVisible()).toBe(true);

            jest.advanceTimersByTime(HIDE_CONTROLS_DELAY_MS + 1);
            expect(launcher.launcherVisible()).toBe(false);
        });

        it('keeps the launcher on screen while the dialog is open', () => {
            const launcher = launcherFixture.componentInstance;
            launcher.toggle();
            launcherFixture.detectChanges();

            jest.advanceTimersByTime(HIDE_CONTROLS_DELAY_MS * 3);
            expect(launcher.opened()).toBe(true);
            expect(launcher.launcherVisible()).toBe(true);
        });
    });
});
