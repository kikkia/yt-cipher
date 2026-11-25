import { Counter, Gauge, Registry } from "../src/prometheus.ts";
import { sanitizeLabelValue } from "../src/metrics.ts";
import { PlayerScript } from "../src/player.ts";

function assert(condition: unknown, msg: string): asserts condition {
    if (!condition) {
        throw new Error(`Assertion failed: ${msg}`);
    }
}

function assertEquals<T>(actual: T, expected: T, msg?: string): void {
    if (actual !== expected) {
        throw new Error(`${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

Deno.test("prometheus escapes quotes, backslashes, and newlines in labels and help", () => {
    const reg = new Registry();
    const c = Counter.with({
        name: "http_requests_by_user_agent_total",
        help: "Line 1\nLine 2 \\ end",
        labels: ["user_agent"],
        registry: [reg],
    });

    c.labels({ user_agent: 'Mozilla/5.0 "bot"\\test\ninjected' }).inc();

    const out = reg.metrics();
    assertEquals(
        out,
        '# HELP http_requests_by_user_agent_total Line 1\\nLine 2 \\\\ end\n' +
        '# TYPE http_requests_by_user_agent_total counter\n' +
        'http_requests_by_user_agent_total{user_agent="Mozilla/5.0 \\"bot\\"\\\\test\\ninjected"} 1\n',
    );
});

Deno.test("counter evicts idle series after staleTtlMs without resetting active ones", () => {
    let now = 1_000_000;
    const reg = new Registry();
    const ttlMs = 24 * 60 * 60 * 1000;

    const responses = Counter.with({
        name: "http_responses_total",
        help: "Total number of HTTP responses.",
        labels: ["pathname", "status", "player_id", "player_type"],
        registry: [reg],
        staleTtlMs: ttlMs,
        now: () => now,
    });

    // Day 0: two player IDs receive traffic
    responses.labels({ pathname: "/decrypt_signature", status: "200", player_id: "aaaaaaaa", player_type: "IAS" }).inc(5);
    responses.labels({ pathname: "/decrypt_signature", status: "200", player_id: "bbbbbbbb", player_type: "IAS" }).inc(2);

    // 20 hours later: only player "aaaaaaaa" is still active
    now += 20 * 60 * 60 * 1000;
    responses.labels({ pathname: "/decrypt_signature", status: "200", player_id: "aaaaaaaa", player_type: "IAS" }).inc(3);

    // Both still present at 20h (< 24h)
    let out = reg.metrics(now);
    assert(out.includes('player_id="aaaaaaaa",player_type="IAS"} 8'), "active player should have cumulative value 8");
    assert(out.includes('player_id="bbbbbbbb",player_type="IAS"} 2'), "idle player under TTL should remain");

    // 5 more hours later (25h since bbbbbbbb's last hit, 5h since aaaaaaaa's last hit)
    now += 5 * 60 * 60 * 1000;
    out = reg.metrics(now);
    assert(out.includes('player_id="aaaaaaaa",player_type="IAS"} 8'), "active player must not be reset");
    assert(!out.includes('player_id="bbbbbbbb"'), "stale player should be evicted");

    // If bbbbbbbb gets a stray request later, it cleanly re-registers starting at 1
    responses.labels({ pathname: "/decrypt_signature", status: "500", player_id: "bbbbbbbb", player_type: "IAS" }).inc();
    out = reg.metrics(now);
    assert(out.includes('status="500",player_id="bbbbbbbb",player_type="IAS"} 1'), "re-seen player starts cleanly at 1");
});

Deno.test("maxSeries overflows player_id into 'other' while preserving status and player_type", () => {
    let now = 1_000_000;
    const reg = new Registry();
    const ttlMs = 10_000;

    const responses = Counter.with({
        name: "http_responses_total",
        help: "Total number of HTTP responses.",
        labels: ["pathname", "status", "player_id", "player_type"],
        registry: [reg],
        staleTtlMs: ttlMs,
        maxSeries: 2,
        overflowLabels: { player_id: "other" },
        now: () => now,
    });

    responses.labels({ pathname: "/resolve_url", status: "200", player_id: "11111111", player_type: "IAS" }).inc();
    responses.labels({ pathname: "/resolve_url", status: "200", player_id: "22222222", player_type: "IAS" }).inc();
    // Third distinct series overflows into player_id="other" while keeping status="500"
    responses.labels({ pathname: "/resolve_url", status: "500", player_id: "33333333", player_type: "ES6" }).inc();
    responses.labels({ pathname: "/resolve_url", status: "500", player_id: "44444444", player_type: "ES6" }).inc();

    let out = reg.metrics(now);
    assert(out.includes('status="200",player_id="11111111",player_type="IAS"} 1'), "first series present");
    assert(out.includes('status="200",player_id="22222222",player_type="IAS"} 1'), "second series present");
    assert(out.includes('status="500",player_id="other",player_type="ES6"} 2'), "overflow preserves status and player_type");
    assert(!out.includes('player_id="33333333"'), "overflowed ID not minted as separate series");

    // Once stale series expire, slots free up for new player IDs
    now += ttlMs + 1;
    responses.labels({ pathname: "/resolve_url", status: "200", player_id: "55555555", player_type: "IAS" }).inc();
    out = reg.metrics(now);
    assert(out.includes('player_id="55555555"'), "new player ID accepted after stale ones expired");
    assert(!out.includes('player_id="11111111"'), "expired player ID pruned");
});

Deno.test("gauges do not expire and expose latest value", () => {
    const reg = new Registry();
    const g = Gauge.with({
        name: "cache_size",
        help: "Cache size.",
        labels: ["cache_name"],
        registry: [reg],
    });
    g.labels({ cache_name: "player" }).set(12);
    g.labels({ cache_name: "solver" }).set(4);

    const out = reg.metrics(Date.now() + 365 * 24 * 60 * 60 * 1000);
    assert(out.includes('cache_size{cache_name="player"} 12'), "player gauge kept");
    assert(out.includes('cache_size{cache_name="solver"} 4'), "solver gauge kept");
});

Deno.test("PlayerScript rejects non-alphanumeric 8-char IDs and accepts valid ones", () => {
    const valid = PlayerScript.fromUrl("https://www.youtube.com/s/player/6c5cb4f4/player_ias.vflset/en_US/base.js");
    assertEquals(valid.id, "6c5cb4f4");

    let threw = false;
    try {
        PlayerScript.fromUrl('/s/player/ab"cd\\ef/player_ias.vflset/en_US/base.js');
    } catch {
        threw = true;
    }
    assert(threw, "should reject 8-char player ID containing quotes or backslashes");
});

Deno.test("sanitizeLabelValue collapses whitespace/newlines and truncates", () => {
    assertEquals(sanitizeLabelValue("  foo\nbar\t\tbaz  "), "foo bar baz");
    assertEquals(sanitizeLabelValue("   "), "unknown");
    assertEquals(sanitizeLabelValue("a".repeat(200), 50).length, 50);
});
