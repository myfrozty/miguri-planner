# Miguri Planner — porting and improvement plan

Status as of 2026-08-09.
The app is one self-contained `index.html`, around 1,380 lines, no build step, no dependencies, no server.
It has been hardened for public use (see "What was already fixed").

This document is the argument for and against porting it, and the plan if you do.

## v1.0 scope

Deliberately five things:

1. The planner grid, per round, applied and won
2. Export and import JSON
3. Export CSV, for looking at the data in Sheets
4. The results views — budget bar, checklist, totals, accumulated
5. Settings — dates, parts, members, caps, price

Everything else is a later version.

**Not in v1.0, on purpose:**

- **CSV import.** `records.csv` is lossy relative to the state: it carries no per-round overrides, no `limitUnit`, no visible-parts selection, no member colours, no round labels. Importing an edited CSV would silently drop all of that, and the old implementation rebuilt the entire state from scratch to do it. JSON is the round trip; CSV is the way out to a spreadsheet.
- **Transfer codes and the sync service.** Built and working, parked in `miguri-sync/`. See "Parked work" below.

## The short version

Do not port before the 18th single opens.
Ship the hardened single file, get real users on it, then port with their data as your regression corpus.

The file being long is not the reason to port.
The reasons are that the state schema has no type safety and the calculation layer has no tests, and those are exactly where a bug costs someone real money.
Everything else — bundling, components, a framework — is incidental.

At v1.0's scope the case for porting is weaker than it looks, because there is not much logic and it changes rarely. It gets stronger the moment you add the parked work back.

## What was already fixed

Listed so a port does not silently reintroduce them.

**The one that mattered most.** `load()` was called near the top of the script and `migrate()` referenced `const`s declared further down, so every startup threw `ReferenceError` inside a `try`, the `catch` logged a console warning nobody reads, and the first `render()` autosaved defaults over the real data.
The app lost everything on every reload while displaying "autosaved in this browser".
Fixed structurally: `S` is declared at the top and initialised at the very bottom, after every declaration in the file.

Also fixed:

- `validate()` split out of `migrate()`. It rejects a non-conforming file instead of repairing it. Previously a backup with no `dates` key merged in default dates carrying fresh `uid()`s, orphaning every entry, and `purge()` deleted them all — presented as a normal empty planner.
- Import and reset take a snapshot first, and an Undo button restores it.
- A state that fails to parse is parked under `miguri-planner-v1-unreadable` rather than overwritten, and the UI says so.
- Ids are validated against `SAFE_ID` and escaped at render. They were interpolated raw into `data-` attributes.
- Round `blocks`/`maxTickets` are coerced to positive integers or null. As raw strings they both injected markup through `stat()` and disabled the round limit silently, because `n >= "abc"` is always false.
- Entry values are coerced to whole non-negative counts. Strings made `sum()` concatenate (`"0" + "3" + "2"` = `"032"`); primitives made the click handler throw under strict mode.
- Settings number inputs clamp. `+value || 1` accepted `-3`, which produced negative ticket counts that `set()` would not delete because they were not zero.
- CSV export neutralises leading `=`, `+`, `-`, `@` and control characters.
- The BOM is written only for CSV. It was on the JSON backup too, which `jq` and Python's `json.load` both reject.
- `exportRecords` iterates `partsInUse()`, not `allParts`, so allocations in a forgotten part still export.
- Long press decrements a cell, for phones with no shift key.
- The mobile header is static and compact — it was sticky and about 340px of an 812px screen.
- Grid cells carry `aria-label`.
- Defaults are neutral: blank single name, one empty date, one placeholder member.

## Known issues still open

None of these are launch blockers. They are the natural first work in a port.

1. **No cross-tab coordination.** `save()` writes the whole state on every render and nothing listens for the `storage` event. Two tabs open, and the second overwrites the first.
2. **Duplicated grid markup.** `renderGrid` and `renderSummaryGrid` share a byte-identical header row and date cell, and have already drifted on which parts they show. That drift is what produced the `exportRecords` bug.
3. **`capBlocks` is named for the wrong unit.** It returns the cap for whichever unit the limit uses — entries by default — while sitting next to a genuinely block-specific `blocksUsedIn`, held in a variable called `maxBlocks`, and rendered under `limitNoun()`. Same mismatch on `S.config.blocksPerRound` versus its "Limit per round" label. This is the most likely source of a future miscount.
4. **Full re-render on every interaction.** Fine at this size. Worth knowing it is `innerHTML =` on the whole grid each click.
5. **Accessibility beyond the cells.** Generated inputs and the `remove` buttons have no labels. The Settings block uses proper wrapping `<label>`s — the pattern exists, it just is not applied to generated controls.

## Should you port?

### Reasons that are real

**Testing the calculation layer.** The rules are not trivial: entries versus blocks as the limit unit, per-round window scaling, per-round overrides, the won-cannot-exceed-applied invariant, hidden parts still counting toward the limit.
Today none of it can be tested without a browser and manual clicking.
A bug here shows the wrong number of tickets to buy.

**Schema safety across versions.** Migrations are the highest-risk code in the app and are hand-written against untyped input.
The two worst bugs found so far both lived in `migrate()`.
A typed schema with parse-don't-validate semantics makes an entire class of them unrepresentable.

**Refactoring without fear.** Points 2 and 3 above are things you would fix immediately if a test suite would tell you when you broke a total.

### Reasons that are not real

**"It is 1,300 lines."** It is one screen of state, one render pass and a dozen pure functions. That is a fine size.

**"It should use a framework."** The render model — mutate `S`, call `render()` — is correct for an app this size and has zero reactivity bugs by construction. A framework would trade that for a different set of problems.

**"It needs a build step to deploy."** It does not. One file on static hosting is the most robust deployment this will ever have.

### Recommendation

Port after the 18th, for the tests and the schema, not for the framework.
Keep the deployment identical: a static bundle on the same host, still localStorage, still no server.

## Porting plan

Only start this once the 18th round has actually been used and you have real backup files to test against.

### Target

- **Vite + TypeScript.** Static output, deploys the same way.
- **Preact, or no framework at all.** The current model is one root render; both suit it. Do not reach for React state management — the app has one state object and that is correct.
- **Vitest** for the logic layer. This is the point of the exercise.
- **Zod** for the state schema, or a hand-written parser if you would rather keep dependencies at zero. Either is fine; what matters is one place that turns unknown input into a typed `State` or throws.

### Order of work

**Step 1 — extract the domain, with tests, no UI changes.**
Pull out of the HTML, unchanged in behaviour:
`ekey`, `get`, `set`, `sum`, `blocksUsedIn`, `entriesUsedIn`, `limitUsedIn`, `windowsOf`, `capBlocks`, `capTickets`, `partsInUse`, `hiddenInRound`, `purge`.
These are already pure or nearly so.
Write the tests first against the current behaviour, including:
- entries versus blocks as the limit unit
- window scaling for rounds after the first, and explicit per-round overrides beating it
- `w > a` clamping in `set` and in migration
- hidden parts counting toward the limit but not appearing in the grid
- the cap-exceeded path where a cell sits above the cap after an import

Rename `capBlocks` to `capForLimit` and `blocksPerRound` to `limitPerWindow` here, where the tests will catch a mistake.

**Step 2 — the schema and migrations.**
One module owning `defaultState`, `validate`, `migrate` and the version number.
Test every migration hop with real fixture files, including the v1 `waves` rename and the v2 to v3 `limitUnit` flip.
Keep fixtures of actual exports from real use — that is what makes this worth doing.
Port the hardening listed above verbatim; each item is a test case.

**Step 3 — persistence.**
`load`, `save`, `snapshot`, the transfer code encode/decode, the storage probe.
Add the `storage` event listener here to close the cross-tab issue.
Test the transfer code round trip and its rejection paths.

**Step 4 — the UI.**
Only now.
Split `renderGrid` and `renderSummaryGrid` so the shared header and date cell exist once.
Replace string concatenation with JSX, which removes the manual `esc()` discipline and with it the whole XSS category.
Give generated inputs real labels while you are in there.

**Step 5 — deploy.**
Same static host. Keep the storage key identical so existing users' data loads untouched — verify that with a real pre-port export as a fixture.

### What not to do during the port

- Do not change the storage key or the state shape at the same time as the framework. One at a time.
- Do not add a backend. The transfer code and JSON export already solve device transfer without hosting anyone's data.
- Do not redesign the UI. The port is for testability; a visual change mid-port makes it impossible to tell a regression from an intention.

## Deployment

Static hosting, any of GitHub Pages, Cloudflare Pages or Netlify. No build for the current file.

Serve over HTTPS — `navigator.clipboard.writeText` needs a secure context, so the "Copy transfer code" button silently falls back to select-and-copy on plain HTTP.

### Durability in v1.0

1. **localStorage** — primary. `navigator.storage.persist()` is requested at startup to resist eviction. Best-effort; Safari may decline.
2. **JSON export** — the backup, and the only way to move a plan between devices in v1.0.

The app warns at the top of the page when storage is unavailable or a save has failed, and tells people to export.
Say the same thing wherever you share the link: the data lives in their browser, and Export JSON is the backup.

That is a real limitation. Someone who clears site data, or opens it in private browsing, or switches phones, loses their plan unless they exported. Decide whether you are comfortable with that before sharing widely — the parked work below is what fixes it.

## Parked work

### Transfer codes and `miguri-sync/`

Built, tested and removed from v1.0 as scope creep. Nothing is wired into the planner: `miguri-sync/` is self-contained and the HTML has no reference to it.

What it was: a 12-character code shown as `XXXX-XXXX-XXXX` that moves a plan between devices, backed by a Cloudflare Worker plus KV. End-to-end encrypted — the code is the secret, the storage id is `SHA-256("miguri-id|" + code)` and the AES-GCM key is `SHA-256("miguri-key|" + code)`, so the worker stores ciphertext under an id it cannot reverse. The operator never holds anyone's spending records. A lost code is unrecoverable by design.

There was also a serverless variant: the whole plan deflated into one ~1,400-character line, pasteable, no infrastructure at all. Both are in git history if you want them back.

Bring this back when device transfer becomes the thing people actually complain about. Two things to remember when you do:

- It needs `CompressionStream('deflate-raw')` — Chrome 80+, Firefox 113+, Safari 16.4+ — so the buttons have to degrade to Export JSON below that.
- A transfer code is not a backup. If someone treats it as one and loses it, you cannot help them. Say so in the UI and wherever you share the link.

This is also the feature that flips the porting decision. Crypto, network calls, expiry and a pile of error states is materially more logic than v1.0 has, and it is logic you want under test.

### Other deferred items

- CSV import, for the lossiness reasons above. If it ever comes back, it should merge into the existing config rather than rebuild the state.
- Cross-tab coordination, the duplicated grid renderers, the `capBlocks` naming, and accessibility on generated inputs — see "Known issues still open".
