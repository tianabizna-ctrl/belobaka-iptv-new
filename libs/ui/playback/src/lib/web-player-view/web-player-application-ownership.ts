import { VideoPlayer } from '@iptvnator/shared/interfaces';
import type { WebPlayerApplicationHandoffCoordinator } from './web-player-application-handoff';
import type { PlaybackBinding } from './playback-recovery-session';
import type {
    WebPlayerApplicationToken,
    WebPlayerSourceRevisionToken,
} from './web-player-application-state';

export interface PlaybackApplicationOwnership {
    readonly binding: PlaybackBinding | null;
    readonly embeddedMpv: boolean;
    readonly isLive: boolean;
    readonly sourceRevision: WebPlayerSourceRevisionToken;
    readonly token: WebPlayerApplicationToken;
}

export function ownsPlaybackApplication(options: {
    readonly ownership: PlaybackApplicationOwnership;
    readonly currentToken: WebPlayerApplicationToken;
    readonly currentSourceRevision: WebPlayerSourceRevisionToken;
    readonly bindingOwned: boolean;
    readonly embeddedMpvSelected: boolean;
}): boolean {
    const { ownership } = options;
    if (
        ownership.token !== options.currentToken ||
        ownership.sourceRevision !== options.currentSourceRevision
    ) {
        return false;
    }
    if (ownership.binding) {
        return !ownership.embeddedMpv && options.bindingOwned;
    }
    return ownership.embeddedMpv && options.embeddedMpvSelected;
}

/**
 * Time updates arrive from every mounted engine, so they must pass the same
 * ownership test before they reach history or resume state. Resolving the
 * binding check here keeps that guard out of the component's line budget.
 */
export function ownsTimeUpdateApplication(options: {
    readonly ownership: PlaybackApplicationOwnership;
    readonly currentToken: WebPlayerApplicationToken;
    readonly currentSourceRevision: WebPlayerSourceRevisionToken;
    readonly handoff: Pick<WebPlayerApplicationHandoffCoordinator, 'owns'>;
    readonly selectedPlayer: VideoPlayer;
}): boolean {
    return ownsPlaybackApplication({
        ownership: options.ownership,
        currentToken: options.currentToken,
        currentSourceRevision: options.currentSourceRevision,
        bindingOwned: options.ownership.binding
            ? options.handoff.owns(
                  options.ownership.binding,
                  options.ownership.token
              )
            : false,
        embeddedMpvSelected:
            options.selectedPlayer === VideoPlayer.EmbeddedMpv,
    });
}
