export enum PlayerVariant {
    IAS = 'IAS',
    IAS_TCC = 'IAS_TCC',
    IAS_TCE = 'IAS_TCE',
    IAS_TCL = 'IAS_TCL',
    ES5 = 'ES5',
    ES6 = 'ES6',
    ES6_TCC = 'ES6_TCC',
    ES6_TCE = 'ES6_TCE',
    ES6_TCL = 'ES6_TCL',
    TV = 'TV',
    TV_TCC = 'TV_TCC',
    TV_TCE = 'TV_TCE',
    TV_TCL = 'TV_TCL',
    TV_ES6 = 'TV_ES6',
    TV_ES6_TCC = 'TV_ES6_TCC',
    TV_ES6_TCE = 'TV_ES6_TCE',
    TV_ES6_TCL = 'TV_ES6_TCL',
    PHONE = 'PHONE',
    PHONE_TCC = 'PHONE_TCC',
    PHONE_TCE = 'PHONE_TCE',
    PHONE_TCL = 'PHONE_TCL',
    PLASMA_ES6 = 'PLASMA_ES6',
    PLASMA_ES6_TCC = 'PLASMA_ES6_TCC',
    PLASMA_ES6_TCE = 'PLASMA_ES6_TCE',
    PLASMA_ES6_TCL = 'PLASMA_ES6_TCL',
    EMBED = "EMBED",
    EMBED_TCC = "EMBED_TCC",
    EMBED_TCE = "EMBED_TCE",
    EMBED_TCL = "EMBED_TCL",
    EMBED_ES6 = "EMBED_ES6",
    EMBED_ES6_TCC = "EMBED_ES6_TCC",
    EMBED_ES6_TCE = "EMBED_ES6_TCE",
    EMBED_ES6_TCL = "EMBED_ES6_TCL",
    HOUSE = "HOUSE",
    HOUSE_ES6 = "HOUSE_ES6",
}

class VariantDetail {
    constructor(
        public readonly variant: PlayerVariant,
        private readonly matchRegex: RegExp,
        private readonly buildTemplate: (region: string) => string,
    ) { }

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
    new VariantDetail(PlayerVariant.IAS_TCL, /^player_ias_tcl\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias_tcl.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES5, /^player_es5\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es5.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES6, /^player_es6\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES6_TCC, /^player_es6_tcc\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6_tcc.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES6_TCE, /^player_es6_tce\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6_tce.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.ES6_TCL, /^player_es6_tcl\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6_tcl.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.PHONE, /^player-plasma-ias-phone-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-ias-phone-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PHONE_TCC, /^player-plasma-ias-phone-tcc-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-ias-phone-tcc-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PHONE_TCE, /^player-plasma-ias-phone-tce-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-ias-phone-tce-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PHONE_TCL, /^player-plasma-ias-phone-tcl-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-ias-phone-tcl-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PLASMA_ES6, /^player-plasma-es6-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-es6-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PLASMA_ES6_TCC, /^player-plasma-es6-tcc-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-es6-tcc-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PLASMA_ES6_TCE, /^player-plasma-es6-tce-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-es6-tce-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.PLASMA_ES6_TCL, /^player-plasma-es6-tcl-([a-zA-Z_]+)\.vflset\/base\.js$/, (region) => `player-plasma-es6-tcl-${region}.vflset/base.js`),
    new VariantDetail(PlayerVariant.TV, /^tv-player-ias\.vflset\/tv-player-ias\.js$/, () => `tv-player-ias.vflset/tv-player-ias.js`),
    new VariantDetail(PlayerVariant.TV_TCC, /^tv-player-ias-tcc\.vflset\/tv-player-ias-tcc\.js$/, () => `tv-player-ias-tcc.vflset/tv-player-ias-tcc.js`),
    new VariantDetail(PlayerVariant.TV_TCE, /^tv-player-ias-tce\.vflset\/tv-player-ias-tce\.js$/, () => `tv-player-ias-tce.vflset/tv-player-ias-tce.js`),
    new VariantDetail(PlayerVariant.TV_TCL, /^tv-player-ias-tcl\.vflset\/tv-player-ias-tcl\.js$/, () => `tv-player-ias-tcl.vflset/tv-player-ias-tcl.js`),
    new VariantDetail(PlayerVariant.TV_ES6, /^tv-player-es6\.vflset\/tv-player-es6\.js$/, () => `tv-player-es6.vflset/tv-player-es6.js`),
    new VariantDetail(PlayerVariant.TV_ES6_TCC, /^tv-player-es6-tcc\.vflset\/tv-player-es6-tcc\.js$/, () => `tv-player-es6-tcc.vflset/tv-player-es6-tcc.js`),
    new VariantDetail(PlayerVariant.TV_ES6_TCE, /^tv-player-es6-tce\.vflset\/tv-player-es6-tce\.js$/, () => `tv-player-es6-tce.vflset/tv-player-es6-tce.js`),
    new VariantDetail(PlayerVariant.TV_ES6_TCL, /^tv-player-es6-tcl\.vflset\/tv-player-es6-tcl\.js$/, () => `tv-player-es6-tcl.vflset/tv-player-es6-tcl.js`),
    new VariantDetail(PlayerVariant.EMBED, /^player_embed\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_ias.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_TCC, /^player_embed_tcc\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_tcc.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_TCE, /^player_embed_tce\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_tce.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_TCL, /^player_embed_tcl\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_tcl.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_ES6, /^player_embed_es6\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_es6.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_ES6_TCC, /^player_embed_es6_tcc\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_es6_tcc.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_ES6_TCE, /^player_embed_es6_tce\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_es6_tce.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.EMBED_ES6_TCL, /^player_embed_es6_tcl\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `player_embed_es6_tcl.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.HOUSE, /^house_brand_player\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `house_brand_player.vflset/${region}/base.js`),
    new VariantDetail(PlayerVariant.HOUSE_ES6, /^house_brand_player_es6\.vflset\/([a-zA-Z_]+)\/base\.js$/, (region) => `house_brand_player_es6.vflset/${region}/base.js`),
];

import { playerScriptOverwrites } from "./metrics.ts";

const overridePlayerId = Deno.env.get('OVERRIDE_PLAYER_ID');
const overridePlayerVariant = Deno.env.get('OVERRIDE_PLAYER_VARIANT');


export class PlayerScript {
    constructor(
        public readonly id: string,
        public readonly variant: PlayerVariant,
        public readonly region: string | null,
    ) {
        if (!/^[a-zA-Z0-9_-]{8}$/.test(id)) {
            throw new Error(`Invalid player ID: ${id}. Must be 8 alphanumeric characters.`);
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

        console.warn(`Unknown player variant for URL: ${url}. Defaulting to IAS variant.`);
        return new PlayerScript(id, PlayerVariant.IAS, null);
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
