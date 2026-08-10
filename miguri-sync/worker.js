/* Miguri Planner sync service.
 *
 * Stores one opaque blob per id and hands it back. That is the whole service.
 *
 * It never sees a plan. The client holds a short secret code, derives the storage id as
 * one hash of it and the encryption key as a different hash of it, and uploads only
 * ciphertext. This worker cannot decrypt what it stores, and cannot recover a code from an
 * id, so a breach of the KV namespace yields nothing but random bytes. That is deliberate:
 * it keeps the operator out of the position of holding other people's spending records.
 *
 * Endpoints:
 *   PUT  /v1/<id>   body = ciphertext bytes   -> 204
 *   GET  /v1/<id>                             -> ciphertext bytes, or 404
 */

const MAX_BYTES = 128 * 1024;      // a very large plan is ~10KB; this is generous
const TTL_SECONDS = 180 * 24 * 60 * 60;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;   // base64url of a 16-byte hash

/* Online guessing is the only attack on a short code, so make it slow. Per-IP, per-minute,
 * counted in KV. Deliberately coarse: this is a brake, not an access control system. */
const RATE_LIMIT = { reads: 30, writes: 10 };

function cors(origin, allowed) {
  // Reflect only origins on the allow list, so a random site cannot drive this with a
  // user's browser. ALLOWED_ORIGINS is a comma-separated list in the worker's vars.
  const list = (allowed || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = origin && (list.includes('*') || list.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

async function rateLimit(env, ip, kind) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${kind}:${ip}:${minute}`;
  const n = Number(await env.PLANS.get(key)) || 0;
  if (n >= RATE_LIMIT[kind]) return false;
  // expirationTtl has a 60s floor, which is exactly the window we want anyway.
  await env.PLANS.put(key, String(n + 1), { expirationTtl: 60 });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = cors(origin, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    const m = /^\/v1\/([^/]+)$/.exec(url.pathname);
    if (!m) return new Response('not found', { status: 404, headers });

    const id = m[1];
    if (!ID_RE.test(id)) return new Response('bad id', { status: 400, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (request.method === 'GET') {
      if (!await rateLimit(env, ip, 'reads')) {
        return new Response('slow down', { status: 429, headers });
      }
      const body = await env.PLANS.get(id, 'arrayBuffer');
      if (!body) return new Response('not found', { status: 404, headers });
      return new Response(body, {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/octet-stream',
                   'Cache-Control': 'no-store' }
      });
    }

    if (request.method === 'PUT') {
      if (!await rateLimit(env, ip, 'writes')) {
        return new Response('slow down', { status: 429, headers });
      }
      const body = await request.arrayBuffer();
      if (!body.byteLength) return new Response('empty', { status: 400, headers });
      if (body.byteLength > MAX_BYTES) return new Response('too large', { status: 413, headers });
      // Writing refreshes the TTL, so a plan someone keeps using never expires under them.
      await env.PLANS.put(id, body, { expirationTtl: TTL_SECONDS });
      return new Response(null, { status: 204, headers });
    }

    return new Response('method not allowed', { status: 405, headers });
  }
};
