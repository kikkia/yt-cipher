import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createColdStartToken, decodeColdStartToken } from "./botguard.ts";
import { base64ToUint8, Uint8ToBase64 } from "./helpers.ts";
import { COLD_START_MAX_BINDING_BYTES } from "./constants.ts";

// The cold-start codec is hand-rolled bit twiddling (magic byte, XOR mask, big-endian timestamp),
// so it gets the one check. Everything else in src/potoken needs YouTube to be reachable.
Deno.test("cold start token round-trips", () => {
    const before = Math.floor(Date.now() / 1000);
    const info = decodeColdStartToken(createColdStartToken("dQw4w9WgXcQ")!);

    assertEquals(info.contentBinding, "dQw4w9WgXcQ");
    assertEquals(info.clientState, 1);
    assert(info.timestamp >= before && info.timestamp <= Math.floor(Date.now() / 1000) + 1);
});

Deno.test("cold start token refuses oversized bindings", () => {
    assert(createColdStartToken("a".repeat(COLD_START_MAX_BINDING_BYTES)) !== undefined);
    assertEquals(createColdStartToken("a".repeat(COLD_START_MAX_BINDING_BYTES + 1)), undefined);
});

Deno.test("cold start token rejects garbage", () => {
    for (const bad of ["", "AAAA", Uint8ToBase64(new Uint8Array([34, 99, 1, 2, 3]), true)]) {
        let threw = false;
        try {
            decodeColdStartToken(bad);
        } catch {
            threw = true;
        }
        assert(threw, `expected throw for ${JSON.stringify(bad)}`);
    }
});

Deno.test("websafe base64 round-trips", () => {
    const bytes = new Uint8Array([0, 62, 63, 251, 252, 253, 254, 255]);
    assertEquals(base64ToUint8(Uint8ToBase64(bytes, true)), bytes);
});
