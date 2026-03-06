export enum PlayerVariant {
    IAS = 'IAS',
    IAS_TCC = 'IAS_TCC',
    IAS_TCE = 'IAS_TCE',
    ES5 = 'ES5',
    ES6 = 'ES6',
    TV = 'TV',
    TV_ES6 = 'TV_ES6',
    PHONE = 'PHONE',
}

const playerVariantDetails: Record<PlayerVariant, string> = {
    [PlayerVariant.IAS]: 'player_ias.vflset/en_US/base.js',
    [PlayerVariant.IAS_TCC]: 'player_ias_tcc.vflset/en_US/base.js',
    [PlayerVariant.IAS_TCE]: 'player_ias_tce.vflset/en_US/base.js',
    [PlayerVariant.ES5]: 'player_es5.vflset/en_US/base.js',
    [PlayerVariant.ES6]: 'player_es6.vflset/en_US/base.js',
    [PlayerVariant.TV]: 'tv-player-ias.vflset/tv-player-ias.js',
    [PlayerVariant.TV_ES6]: 'tv-player-es6.vflset/tv-player-es6.js',
    [PlayerVariant.PHONE]: 'player-plasma-ias-phone-en_US.vflset/base.js',
};

const overridePlayerId = Deno.env.get('OVERRIDE_PLAYER_ID');
// const overridePlayerVariant = Deno.env.get('OVERRIDE_PLAYER_VARIANT');
// TEMP: Hack to force IAS script till new fix
const overridePlayerVariant = 'IAS';


export class PlayerScript {
    constructor(public readonly id: string, public readonly variant: PlayerVariant) {
        if (id.length !== 8) {
            throw new Error(`Invalid player ID: ${id}. Must be 8 characters long.`);
        }
    }

    static fromUrl(url: string): PlayerScript {
        const path = url.startsWith('https') ? new URL(url).pathname : url;
        const pathParts = path.split('/');

        const playerIndex = pathParts.indexOf('player');
        if (playerIndex === -1 || playerIndex + 1 >= pathParts.length) {
            throw new Error(`Invalid player URL: ${url}`);
        }

        const id = pathParts[playerIndex + 1];
        const variantPath = pathParts.slice(playerIndex + 2).join('/');

        for (const [variant, detailPath] of Object.entries(playerVariantDetails)) {
            if (detailPath === variantPath) {
                return new PlayerScript(id, variant as PlayerVariant);
            }
        }

        throw new Error(`Unknown player variant for URL: ${url}`);
    }

    toUrl(): string {
        const variantPath = playerVariantDetails[this.variant];
        return `https://www.youtube.com/s/player/${this.id}/${variantPath}`;
    }

    withVariant(variant: PlayerVariant): PlayerScript {
        return new PlayerScript(this.id, variant);
    }

    withId(id: string): PlayerScript {
        return new PlayerScript(id, this.variant);
    }
}

export function getPlayerScript(playerUrl: string): PlayerScript {
    let script = PlayerScript.fromUrl(playerUrl);

    if (overridePlayerId) {
        script = script.withId(overridePlayerId);
    }

    if (overridePlayerVariant) {
        const variant = PlayerVariant[overridePlayerVariant as keyof typeof PlayerVariant];
        if (variant) {
            script = script.withVariant(variant);
        }
    }

    return script;
}