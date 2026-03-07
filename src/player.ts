export enum PlayerVariant {
    IAS = 'IAS',
    IAS_TCC = 'IAS_TCC',
    IAS_TCE = 'IAS_TCE',
    ES5 = 'ES5',
    ES6 = 'ES6',
    TV = 'TV',
    TV_ES6 = 'TV_ES6',
    PHONE = 'PHONE',
    EMBED = "EMBED",
}

class VariantDetail {
    constructor(
        public readonly variant: PlayerVariant,
        private readonly matchRegex: RegExp,
        private readonly buildTemplate: (region: string) => string,
    ) {}

    match(path: string): { region: string | null } | null {
        const result = path.match(this.matchRegex);
        if (!result) return null;
        // The region is in the first capture group, or null if it's a region-less variant
        return { region: result[1] || null };
    }

    build(region: string | null): string {
        return this.buildTemplate(region ?? 'en_US');
    }
}

const playerVariantDetails: VariantDetail[] = [
    new VariantDetail(PlayerVariant.IAS, /^player_ias\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.IAS_TCC, /^player_ias_tcc\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias_tcc.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.IAS_TCE, /^player_ias_tce\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias_tce.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES5, /^player_es5\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es5.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES6, /^player_es6\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.PHONE, /^player-plasma-ias-phone-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-ias-phone-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.TV, /^tv-player-ias\.vflset\/tv-player-ias\.js$/, () => `tv-player-ias.vflset/tv-player-ias.js`),
    new VariantDetail(PlayerVariant.TV_ES6, /^tv-player-es6\.vflset\/tv-player-es6\.js$/, () => `tv-player-es6.vflset/tv-player-es6.js`),
    new VariantDetail(PlayerVariant.EMBED, /^player_embed\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias.vflset/${region}/base.js`),
];

import { playerScriptOverwrites } from "./metrics.ts";

const overridePlayerId = Deno.env.get('OVERRIDE_PLAYER_ID');
// const overridePlayerVariant = Deno.env.get('OVERRIDE_PLAYER_VARIANT');
// TEMP: Hack to force IAS script till new fix
const overridePlayerVariant = 'IAS';


export class PlayerScript {
    constructor(
        public readonly id: string,
        public readonly variant: PlayerVariant,
        public readonly region: string | null,
    ) {
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

        for (const detail of playerVariantDetails) {
            const result = detail.match(variantPath);
            if (result) {
                return new PlayerScript(id, detail.variant, result.region);
            }
        }

        throw new Error(`Unknown player variant for URL: ${url}`);
    }

    toUrl(): string {
        const detail = playerVariantDetails.find(d => d.variant === this.variant);
        if (!detail) {
            throw new Error(`Cannot build URL for unknown variant: ${this.variant}`);
        }
        const variantPath = detail.build(this.region);
        return `https://www.youtube.com/s/player/${this.id}/${variantPath}`;
    }

    withVariant(variant: PlayerVariant): PlayerScript {
        return new PlayerScript(this.id, variant, this.region);
    }

    withId(id: string): PlayerScript {
        return new PlayerScript(id, this.variant, this.region);
    }
}

export function getPlayerScript(playerUrl: string): PlayerScript {
    let script = PlayerScript.fromUrl(playerUrl);

    if (overridePlayerId) {
        playerScriptOverwrites.labels({ type: "id", source: script.id, forced: overridePlayerId }).inc();
        script = script.withId(overridePlayerId);
    }

    if (overridePlayerVariant) {
        const variant = PlayerVariant[overridePlayerVariant as keyof typeof PlayerVariant];
        if (variant) {
            playerScriptOverwrites.labels({ type: "variant", source: script.variant, forced: overridePlayerVariant }).inc();
            script = script.withVariant(variant);
        }
    }

    return script;
}