# Miguri Planner

A planner for forTUNE music 個別握手会 (miguri) ticket applications.

Work out how many tickets to apply for, across which dates, parts and members, without going over the per-round limit — then track what you actually won.

One self-contained HTML file. No build, no dependencies, no server, no account. Your data stays in your browser.

## Use it

Open `index.html` in a browser. That is the whole install.

It works equally well saved to disk and opened from `file://`, or served from any static host.

## What it does

**Rounds.** One tab per application window. Round 1 is a single window; later rounds run the same mechanism several times, so their caps scale — a round can also override the defaults itself.

**The grid.** Dates down, one row per member within each date, one column per 部 — the order the forTUNE ballot is filled in: pick the member, then choose parts along the row. Tap a cell to add a ticket, long-press or shift-click to remove. Cells grey out when you hit the round limit, the way the real site does.

**Applied vs won.** Two modes on the same grid. Won can never exceed applied. The "All rounds" tab accumulates everything, with won shown large and applied small beside it.

**Budget.** Entries used against the limit, tickets, committed yen and paid yen, per round and overall.

**Checklist.** A plain-text list of every allocation for the current round, in the order you work down the forTUNE site.

**Totals.** By member, by round, by date and by part, each with applied, won, win rate and yen.

**Settings.** Dates, visible parts, members, per-round limit, ticket cap, window count and unit price.

### The limit, and what counts against it

The per-round limit is counted in **entries** by default — one entry is one member within one date+part, matching one line on the receipt. A block holding two members is 1 block but 2 entries. This is why 15 × 3 tickets = 45. The block option exists in Settings only in case a future single changes the rule.

Allocations in a part you have hidden from the grid still count against the limit. The app says so when it happens, rather than letting a lockout look mysterious.

## Your data

It lives in your browser's localStorage and nowhere else. Nothing is uploaded.

**Export JSON is the backup.** Take one. Clearing site data, private browsing, or switching phones all lose the plan otherwise, and there is no way to recover it.

- **Export / Import JSON** — the full round trip, and the way to move between devices.
- **Export CSV** — for opening in Sheets or Excel. One-way: the CSV does not carry per-round overrides, visible parts, colours or round labels, so it cannot be imported back.
- **Undo** — appears after an import or a reset, and puts back what was there before.

The app refuses to import a file that is not a planner backup rather than trying to repair it, warns at the top of the page if the browser is not saving, and keeps an unreadable saved state under a separate key instead of overwriting it.

## Scope

v1.0 is deliberately five things: the planner, JSON export/import, CSV export, the results views, and settings.

Planned: keeping past singles rather than one at a time, so win rates accumulate across singles instead of being lost when the next one is set up.

`miguri-sync/` is parked work — a device-transfer service that is not part of v1.0 and is not deployed. See [miguri-planner-PORTING.md](miguri-planner-PORTING.md) for what it was, what else is deferred, and the argument for and against porting this to TypeScript later.

## Browser support

Anything current. Uses no APIs newer than `localStorage`, `Blob` and `navigator.storage.persist()`.
