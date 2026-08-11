# miguri-sync

> **Not part of v1.0.** This is parked work. The planner has no reference to it and does
> not need it — v1.0 ships with localStorage plus Export/Import JSON only. Nothing here is
> deployed. Keep it for when device transfer becomes the thing people actually ask for, and
> read the "Parked work" section of `../miguri-planner-PORTING.md` first, since bringing
> this back also means re-adding the client code that was removed.

The transfer-code service for Miguri Planner.
One Cloudflare Worker and one KV namespace.
Free tier is far beyond what this will ever need.

## What it does, and what it deliberately does not

It stores one opaque blob per id and hands it back.
That is all.

It never sees a plan.
The browser generates a 12-character code, derives the storage id as `SHA-256("miguri-id|" + code)` and the AES-GCM key as `SHA-256("miguri-key|" + code)`, and uploads only ciphertext.
Two consequences worth being clear about:

- **You are not holding anyone's data.** If the KV namespace leaked entirely, it would yield random bytes. You cannot read your users' plans, and neither can anyone who compromises the worker.
- **A lost code is a lost plan.** There is no recovery, because there is nothing to recover it with. The UI says so, and points at Export JSON as the real backup.

There are no accounts, no logins and no personal data. The worker stores no IP addresses beyond a per-minute rate-limit counter that expires after 60 seconds.

## Deploy

You need a Cloudflare account. Everything below is free tier.

```bash
npm install -g wrangler
```

```bash
npx wrangler login
```

Create the KV namespace:

```bash
npx wrangler kv namespace create PLANS
```

That prints an id. Put it in `wrangler.toml` in place of `PASTE_THE_KV_NAMESPACE_ID_HERE`.

Set `ALLOWED_ORIGINS` in `wrangler.toml` to wherever you host the planner — for example `https://yourname.github.io`.
Only listed origins can call the worker from a browser.
Use `"*"` for local testing only.

Deploy:

```bash
npx wrangler deploy
```

Wrangler prints the worker URL, something like `https://miguri-sync.yourname.workers.dev`.

## Connect the planner to it

In `index.html`, find:

```js
const SYNC_URL = '';
```

Set it to the worker URL, with no trailing slash:

```js
const SYNC_URL = 'https://miguri-sync.yourname.workers.dev';
```

While it is empty, the short-code buttons are disabled and the panel says no server is configured.
The long offline code and Export JSON keep working either way, so the planner is never broken by the service being absent or down.

## Check it works

```bash
curl -X PUT --data-binary "hello" https://miguri-sync.yourname.workers.dev/v1/AAAAAAAAAAAAAAAAAAAAAA
```

Expect `204`. Then:

```bash
curl https://miguri-sync.yourname.workers.dev/v1/AAAAAAAAAAAAAAAAAAAAAA
```

Expect `hello`.
An id that is not 22 base64url characters returns `400`, and an unknown id returns `404`.

Then use the app itself: create a code on your desktop, type it into your phone.

## API

| method | path | body | returns |
|---|---|---|---|
| `PUT` | `/v1/<id>` | ciphertext bytes | `204` |
| `GET` | `/v1/<id>` | — | ciphertext bytes, or `404` |

`<id>` must match `^[A-Za-z0-9_-]{22}$`.

## Limits

Set at the top of `worker.js`:

- **Max blob** 128 KB. A very large plan encrypts to roughly 10 KB, so this is generous.
- **TTL** 180 days, refreshed on every write. A plan someone keeps using never expires under them; an abandoned one clears itself out.
- **Rate limit** 10 writes and 30 reads per IP per minute. This is the only thing standing between a short code and offline guessing, so do not raise it casually. At 30 guesses a minute, 60 bits of code is not reachable.

## Costs

Cloudflare's free tier covers 100,000 worker requests and 1,000 KV writes per day.
Each transfer is one write; each restore is one read.
A few hundred users doing this a handful of times a month will not come close.

## Operating it

There is nothing to maintain — no database migrations, no dependencies, no build.
If you ever want to shut it down, the planner degrades to the long offline code and Export JSON on its own; nobody is locked out of their data, they just lose the short-code convenience.
Say so if you share this with people, so nobody treats a transfer code as a backup.
