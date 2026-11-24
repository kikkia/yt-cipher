import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { getFromPrepared, preprocessPlayer } from "./ejs/src/yt/solver/solvers.ts";
import { PlayerScript, PlayerVariant } from "./src/player.ts";

// Players reported breaking with `TypeError: a.addOnDisposeCallback is not a function`
// (see yt-dlp/ejs#79 and yt-dlp/yt-dlp#18123)
const BREAKING_PLAYERS = [
    "05a4ffc0",
    "b485e332",
    "b17b74e6",
    "92eef845",
];

const VARIANTS: PlayerVariant[] = [
    PlayerVariant.IAS,
    PlayerVariant.IAS_TCC,
    PlayerVariant.IAS_TCE,
    PlayerVariant.ES5,
    PlayerVariant.ES6,
    PlayerVariant.TV,
    PlayerVariant.TV_ES6,
    PlayerVariant.PHONE,
];

const SAMPLE_N = "zyfc6LXJJ_Fc8A16e";
const SAMPLE_SIG = "GJfQdSswRgIhAOXssbbKYmoLtN8NkbnqZ-y_JiPAnmhaLG2c79kb8BAlAiEAy01T8bzhq5txK6CKaEr27cVdmDw8ZWU1D8fPRMiERkQ==";

const EXPECTED_VECTORS: Record<string, { n?: { input: string; expected: string }[]; sig?: { input: string; expected: string }[] }> = {
    "05a4ffc0": {
        n: [
            { input: "zyfc6LXJJ_Fc8A16e", expected: "E6D9M3x4irRUjQ" },
            { input: "urAtKdZDQ_49CNnoM", expected: "xn3bLr-jLoyXLw" },
            { input: "HgPp0e5U6Rhfmwvzc", expected: "YjxvbUzUN8UHrw" },
        ],
    },
    "92eef845": {
        n: [
            { input: "rYKKd90cGmViBQaX", expected: "3tU2ya-IJqhNt" },
        ],
        sig: [
            {
                input: "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x20\x21\x22\x23\x24\x25\x26\x27\x28\x29\x2a\x2b\x2c\x2d\x2e\x2f\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x3a\x3b\x3c\x3d\x3e\x3f\x40\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a\x5b\x5c\x5d\x5e\x5f\x60\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a",
                expected: "\x5d\x65\x64\x63\x62\x61\x60\x5f\x5e\x44\x5c\x5b\x5a\x59\x58\x57\x56\x55\x54\x53\x52\x51\x50\x4f\x4e\x4d\x4c\x4b\x4a\x49\x48\x47\x46\x45\x66\x43\x42\x41\x40\x3f\x3e\x3d\x3c\x3b\x3a\x39\x38\x37\x36\x35\x00\x33\x32\x31\x30\x2f\x69\x2d\x2c\x2b\x2a\x29\x28\x27\x26\x25\x24\x23\x22\x21\x20\x1f\x1e\x1d\x1c\x1b\x1a\x19\x18\x17\x16\x15\x14\x13\x12\x11\x10\x0f\x0e\x0d\x0c\x0b\x0a\x09\x08\x07\x06\x05\x04\x03\x02\x01\x34",
            },
        ],
    },
};

const CACHE_DIR = join(
    Deno.env.get("XDG_CACHE_HOME") || join(Deno.env.get("HOME") || "/tmp", ".cache"),
    "yt-cipher",
    "test_players",
);

await ensureDir(CACHE_DIR);

async function loadPlayer(id: string, variant: PlayerVariant): Promise<string | null> {
    const cachePath = join(CACHE_DIR, `${id}-${variant}.js`);
    try {
        return await Deno.readTextFile(cachePath);
    } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
            throw err;
        }
    }

    const script = new PlayerScript(id, variant, "en_US");
    const playerUrl = script.toUrl();
    const response = await fetch(playerUrl);
    if (response.status === 404) {
        await response.body?.cancel();
        return null;
    }
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Failed to fetch ${playerUrl}: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    await Deno.writeTextFile(cachePath, content);
    return content;
}

for (const playerId of BREAKING_PLAYERS) {
    Deno.test({
        name: `player ${playerId}`,
        async fn(t) {
            const solvedByVariant = new Map<PlayerVariant, { n: string; sig: string }>();

            for (const variant of VARIANTS) {
                await t.step(`${playerId} [${variant}]`, async () => {
                    const raw = await loadPlayer(playerId, variant);
                    if (raw === null) {
                        console.log(`Skipping unavailable variant ${playerId} [${variant}] (404)`);
                        return;
                    }

                    const preprocessed = preprocessPlayer(raw);
                    const solvers = getFromPrepared(preprocessed);

                    assert(typeof solvers.n === "function", `Expected n solver function for ${playerId} [${variant}]`);
                    assert(typeof solvers.sig === "function", `Expected sig solver function for ${playerId} [${variant}]`);

                    const solvedN = solvers.n(SAMPLE_N);
                    const solvedSig = solvers.sig(SAMPLE_SIG);

                    assert(typeof solvedN === "string" && solvedN.length > 0, `Empty n result for ${playerId} [${variant}]`);
                    assertNotEquals(solvedN, SAMPLE_N, `n solver returned unchanged input for ${playerId} [${variant}]`);

                    assert(typeof solvedSig === "string" && solvedSig.length > 0, `Empty sig result for ${playerId} [${variant}]`);
                    assertNotEquals(solvedSig, SAMPLE_SIG, `sig solver returned unchanged input for ${playerId} [${variant}]`);

                    const expected = EXPECTED_VECTORS[playerId];
                    if (expected?.n) {
                        for (const tc of expected.n) {
                            assertEquals(solvers.n(tc.input), tc.expected, `n vector mismatch for ${playerId} [${variant}]`);
                        }
                    }
                    if (expected?.sig) {
                        for (const tc of expected.sig) {
                            assertEquals(solvers.sig(tc.input), tc.expected, `sig vector mismatch for ${playerId} [${variant}]`);
                        }
                    }

                    solvedByVariant.set(variant, { n: solvedN, sig: solvedSig });
                });
            }

            await t.step(`${playerId} [variant consistency]`, () => {
                assert(solvedByVariant.size > 0, `No variants succeeded for ${playerId}`);
                const entries = [...solvedByVariant.entries()];
                const [baseVariant, baseResult] = entries[0];
                for (const [variant, result] of entries.slice(1)) {
                    assertEquals(
                        result.n,
                        baseResult.n,
                        `n mismatch between ${baseVariant} and ${variant} for ${playerId}`,
                    );
                    assertEquals(
                        result.sig,
                        baseResult.sig,
                        `sig mismatch between ${baseVariant} and ${variant} for ${playerId}`,
                    );
                }
            });
        },
    });
}
