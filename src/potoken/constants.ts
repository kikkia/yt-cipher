// Ported from https://github.com/ashton045/webpo-generator (LGPL-3.0-or-later).
// See src/potoken/LICENSE. BotGuard research: https://github.com/LuanRT/BgUtils

export const GOOGLE_API_BASE = 'https://jnn-pa.googleapis.com';
export const YT_BASE = 'https://www.youtube.com';
export const INNERTUBE_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36(KHTML, like Gecko)';
export const TV_USER_AGENT = 'Mozilla/5.0 (Linux arm64-v8a; Android 10) Cobalt/25.lts.30.1034958-gold (unlike Gecko) v8/8.8.278.17-jit gles Starboard/15, Sony_ATV_sdm845_13140765/52.1.C.0.268 (KDDI, SOV38) com.google.android.youtube.tv/5.30.301';
export const TV_CONFIG = 'https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl';
export const REG_FOR_BASE64 = /[-_.]/g;
export const BASE64_MAP: Record<string, string> = { '-': '+', '_': '/', '.': '=' };
export const VISITOR_ID_ENDPOINT = `${YT_BASE}/youtubei/v1/visitor_id`;
export const WEB_CLIENT_NAME = 'WEB';
export const WEB_CLIENT_ID = '1';
export const WEB_CLIENT_VERSION = '2.20260227.01.00';
export const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
export const COLD_START_MAX_BINDING_BYTES = 247;
