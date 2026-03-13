import { type RuntimeModRegistration, createHookClient } from '@nimiplatform/sdk/mod';
import { MUSIC_SCORE_CAPABILITIES, MUSIC_SCORE_MOD_ID } from './contracts.js';
import { registerMusicScoreUiExtensions } from './registrars/ui.js';

export function createMusicScoreRuntimeMod(): RuntimeModRegistration {
    return {
        modId: MUSIC_SCORE_MOD_ID,
        capabilities: [...MUSIC_SCORE_CAPABILITIES],
        isDefaultPrivateExecution: false,
        setup: async ({ sdkRuntimeContext }) => {
            const hookClient = createHookClient(MUSIC_SCORE_MOD_ID, sdkRuntimeContext);
            await registerMusicScoreUiExtensions({ hookClient });
        },
        teardown: async () => {
            // No cleanup needed — pure client-side mod
        },
    };
}

export const createRuntimeMod = createMusicScoreRuntimeMod;
