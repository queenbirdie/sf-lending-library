# Muddy

The wall-tablet checklist for what everyone needs before walking out the door.

See [`docs/vision-and-plan.md`](docs/vision-and-plan.md) for the why (values,
what Muddy is/isn't) and the current MVP roadmap.

## What this is

A small installable web app (PWA) meant to run in a browser tab on a wall-mounted
tablet by the door. It looks like a lined notepad: everyone's list sits side by
side — Lauren, Michael, and Kids — so the whole household's status is one glance,
no tapping between people. Tapping an item checks it off. The list resets
automatically every day and flexes based on context — day of week, today's
calendar (swim lessons, YKids, workout class, ...), and today's weather. None
of that is manually toggled; there's no chip to tap for "it's a swim day" or
"it's raining" — Muddy just looks.

Items can belong to one kid specifically, or to `person: "kids"` for things
that apply to all of them (shown under a "Both kids" heading). For now a
parent checks items off for the kids too, the same tap-to-check as their own
column — kids operating the board themselves (a more analog, physical
interaction) is a later version, not v1.

## Running it locally

No build step. Just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Editing the lists

Everything — people, kids, items, and calendar rules — lives in `config.js`.
Edit that file and reload; no other code changes needed for day-to-day tweaks.
(Day-to-day *content* edits are usually easier done in the Google Sheet — see
below — config.js mostly matters now as the offline/first-load fallback.)

Item shape:

```js
{
  id: "l-keys",              // optional — see below
  person: "lauren",          // a person/kid id, or "kids" for both kids at once
  label: "Keys",
  icon: "key",                // a custom icon key — see "Icons" below
  frequency: "daily",        // or { days: ["mon","tue","wed","thu","fri"] }
  condition: "swim",         // optional — only shows when the viewed day's calendar matched that flag
  weather: "rain",            // optional — only shows when the viewed day's forecast matches — see "Weather" below
  callout: true,              // optional — see "Callouts" below
}
```

`id` is just the stable key Muddy uses internally to remember what's checked
or dismissed — it's never shown anywhere. Leave it out (or, in the Sheet,
leave that column blank or delete it entirely) and Muddy derives one from
`person` + `label`, e.g. "lauren" + "Keys" becomes `lauren-keys`. Day to day,
`label` is the only thing worth touching — reword it freely any time, it's
just display text. Only set `id` explicitly if two items for the same
person happen to share a label (Muddy still keeps them distinct on its own
by appending `-2`, `-3`, ... — an explicit id is just for if you want to
name it yourself instead).

`condition` references a flag activated by a `calendarRules` match (see
"Calendar sync" below) — there's no manual toggle for it anymore, it's purely
"did today's synced calendar match a rule." It also accepts more than one
flag, meaning "show if any of these are active" — either an array
(`condition: ["swim", "ykids"]`) or, in the Sheet, a comma-separated cell
(`swim, ykids`). Use this instead of adding the same physical item twice
under two activities — e.g. Louie's change of clothes is needed for swim
lessons *or* YKids, so it's one row with both conditions, which also means
it only shows once on a day when both are active, no separate
de-duplication needed.

### Callouts

Set `callout: true` on an item (or, in the Sheet, put `TRUE` in the Items
tab's `callout` column) to flag it as outside the normal routine — e.g. the
swim coach mentioned goggles are needed starting next month, so you flip
`callout` on for that item for a while. It gets a small star and a tinted
label, but stays in its normal spot in the person's (or kid's) column —
no separate "heads up" section. Turn it back off once it's not a surprise
anymore. Weather-suggested items (see below) get this same treatment
automatically, no need to also set `callout: true` on them.

## Icons

Every icon in Muddy is a small custom SVG (no emoji) — defined as `<symbol id="i-...">`
elements at the top of `index.html`, and referenced elsewhere by key (e.g. `"key"`,
`"backpack"`, `"raindrop"`). To add a new icon: draw a simple 24×24 viewBox path,
add it as a new `<symbol>` in `index.html`, and add its key to the `KNOWN_ICONS`
set at the top of `app.js`. Anything used as an `icon` that *isn't* in that set
(e.g. an old emoji still sitting in the spreadsheet) just renders as plain text
instead of breaking — a soft fallback, not a hard requirement to migrate everything
at once.

## Calendar sync (optional)

Flags are set entirely from today's Google Calendar events — there's no manual
toggle. E.g. a "Swim lessons" event at a location containing "YMCA" turns on
the "swim" flag, which shows every item with `condition: "swim"`.

Muddy itself never talks to Google directly (it's a static page with no login).
Instead, `calendar-sync/Code.gs` is a small Google Apps Script Web App you deploy
under your own Google account — it reads *today's and tomorrow's* events (title +
location only, nothing else) and returns them as JSON. Muddy fetches that URL
once per day. See the setup steps at the top of `calendar-sync/Code.gs`.

**If you already had this deployed before the tonight/tomorrow toggle was
added:** you need to redeploy for tomorrow's events to start coming through —
paste the updated `calendar-sync/Code.gs` into the Apps Script editor, then
"Manage deployments" → edit → new version. Same as any other change to that
file. Today's view keeps working either way; it's specifically the "Prep for
tomorrow" toggle that needs the new version to detect tomorrow's activities.

Responses are served as JSONP, not plain JSON — Apps Script Web Apps don't send
the `Access-Control-Allow-Origin` header a cross-origin `fetch()` needs, so a
plain fetch gets silently blocked by the browser even though the request
succeeds. Muddy loads the URL via a `<script>` tag instead (see `jsonpFetch` in
`app.js`), which isn't subject to CORS.

Matching rules live in `config.js` under `calendarRules`, e.g.:

```js
{
  id: "swim-lessons-ymca",
  label: "Swim lessons",
  match: { titleContains: ["swim lessons"], locationContains: "ymca" },
  activatesFlag: "swim",
}
```

`activeFlags` is recomputed fresh from the calendar on every load — it isn't
persisted or remembered, so there's nothing to accidentally leave "stuck on"
from a previous day.

## Weather

The header shows today's date front and center, with the current temperature
and today's high/low next to it — pulled from
[Open-Meteo](https://open-meteo.com/) for San Francisco (`WEATHER_LAT`/
`WEATHER_LON` in `app.js`, if that ever needs to change). No API key needed;
it's a free, no-signup endpoint that supports being called directly from the
browser.

Beyond just showing in the header, weather can also surface items via
`item.weather` (see "Editing the lists" above) — `"rain"`, `"snow"`,
`"below:N"` (today's low), `"above:N"` (today's high), comma-separated for
"any of these". A weather-matched item always gets the star/nudge treatment
(same visual as a callout) rather than appearing as a plain item — a forecast
is a suggestion to double-check standing in the mudroom, not a certainty the
way a calendar event is. If the weather fetch fails (offline, etc.), the
header just shows the date without a weather line, and any weather-only items
simply don't show that day rather than erroring.

## Dismissing an item

Long-press (about half a second) an item to mark it "not needed today"
instead of tapping to check it off — for a one-off reason that isn't worth a
whole calendar/weather rule (e.g. skipping a normally-daily item just for
today). A dismissed item stays visible — italic and faded — rather than
disappearing, since that's a deliberate choice, not something silently
missing. It drops out of that column's "X of Y" count and "all set" check.
Tap it normally to bring it back. Dismissed state is tracked the same way
checked state is: separately for today vs. the tomorrow-prep view (see
below), so dismissing something in tonight's prep view doesn't dismiss it
for today, and vice versa.

## Filling the screen

Row height (and every font/icon size on the board, all proportional to it)
is computed on every load — and on resize — from the busiest column or kids'
subsection that day, growing on a light day to use the space that would
otherwise sit empty, and backing off toward normal on a busy one so nothing
overflows. There's a small floor and cap on how far it'll grow either way.

## Tonight / tomorrow toggle

Two buttons under the date, "Today" and "Prep for tomorrow", switch the whole
board between today's list and a preview of tomorrow's — same layout, same
calendar/weather-driven filtering, just computed against tomorrow's date,
weekday, calendar events, and forecast instead of today's.

Checking an item in the tomorrow view is a completely separate "prepped"
state from the real checked state — packing the swim bag tonight doesn't
check it off tomorrow morning, on purpose, since being packed the night
before and actually being in the car are two different things. The prepped
state lives under today's date (it's *today* doing the prepping), so it
clears out naturally the same way everything else does once the day rolls
over — tomorrow starts its own real checked state fresh, like always.

## Master item list in Google Sheets (optional)

People, kids, items, household tasks, and calendar rules can all live in a
Google Sheet instead of `config.js` — "Muddy Master List", with tabs `People`,
`Kids`, `Items`, `HouseholdTasks`, `CalendarRules` (see the sheet's own
`ReadMe` tab for column-by-column notes). The same Apps Script bridge that serves
calendar events also serves this, via `?type=config`. `config.js` becomes the
offline/first-load fallback — Muddy always tries the sheet first, falls back to
the last successful fetch if the network's down, and falls back to the bundled
`config.js` if it's never synced successfully at all.

**Note:** the sheet's `Items` tab doesn't need an `id` column at all anymore
— see "Editing the lists" above. Safe to delete that column if it's there,
or leave it blank per row; Muddy derives an id from `person` + `label`
either way.

**The Sheet's `Items` tab shape is different from `config.js`'s.** `config.js`
still uses one row (object) per person per item, with a single `person`
field — that's plain code, so there's no real cost to typing "lauren" a
dozen times. The Sheet instead has one row per *physical item*, with a
checkbox column for each person (`Lauren`, `Michael`, `Louie`, `Dottie`) plus
a `Both kids` column — check off everyone who needs that item instead of
adding a separate row per person. "Swimsuit" is one row with Lauren, Louie,
and Dottie all checked, instead of three. `Both kids` is its own column, not
just Louie *and* Dottie both checked — use it for one shared task (packed
once, checked once, e.g. "Snacks"); check Louie and Dottie individually
instead when each genuinely needs their own and should be checked off
separately (e.g. "Backpack" — two backpacks, two checks). Muddy expands each
checked box back into its own independent item behind the scenes, so the
board itself doesn't change — Louie's and Dottie's Backpacks are still two
separate rows they each check on their own.

**Note:** the sheet's `Flags` tab is no longer read by the app — flags don't
have their own label/icon anymore since there's no chip UI to render them
into, they're just plain id strings referenced by `calendarRules` and item
`condition`s. Safe to delete that tab, or leave it — it's just ignored.

Editing the spreadsheet takes effect on next load — no code changes, no git, no
redeploy. `config.js`'s `people` / `kids` / `items` / `householdTasks` /
`calendarRules` fields only matter now as that offline fallback; `calendarSync`
(the URL/key) is the one thing that always stays local, since that's what tells
Muddy where to even find the sheet.

**Note:** the sheet's `Items` icon column likely still has old emoji values
from before Muddy switched to custom SVG icons. Those will just render as
plain emoji text (harmless, just inconsistent with the rest of the UI) until the
column is updated to use the new icon keys — see "Icons" above for the current key
list (in `index.html`'s `<symbol>` ids / `app.js`'s `KNOWN_ICONS`).

## Current state / next steps

- [x] Board layout — everyone's list side by side, no tabs
- [x] Lined-notepad visual style: ruled paper, red margin rule, handwriting font
      (Fredoka, via Google Fonts — falls back to the system font if offline), text
      precisely baseline-aligned to the rules
- [x] Custom SVG icon set (no emoji) for every item, with graceful text fallback
      for anything not yet in the icon set
- [x] Conditional items driven entirely by calendar detection (swim, YKids,
      workout class) and live weather (rain, snow, temperature thresholds) —
      no manual chip/toggle, Muddy just looks at the calendar and forecast.
      Weather-triggered items get a nudge/star treatment since a forecast
      can be wrong in a way a calendar event can't.
- [x] Kids column, tappable checklist same as the parent columns, split into
      "Both kids" (shared items) + each kid individually — a parent checks
      items off for the kids for now; kids operating the board themselves is
      a later version
- [x] Calendar-driven flag pre-fill via an Apps Script bridge (see above) — deployed and wired up
- [x] Master item list editable in Google Sheets instead of code (see above) — deployed and wired up
- [ ] Household strip ("set up so-and-so's board" reminder) — paused; data model
      (`householdTasks` in config/sheet) still exists, just not rendered anywhere
      right now. Revisit once there's a design for it that fits the board layout.
- [ ] Home-screen icon polish (currently a plain emoji-on-color SVG — should switch
      to the new custom-icon style)
- [x] Hosting — live at mymuddy.com via Cloudflare Pages, auto-deploys on every push to `main`

### v1 roadmap (see docs/vision-and-plan.md for the full rationale)

The Google Sheet is currently the only way to add/edit items — these are the
lower-friction capture and day-shaping features scoped for v1, not started yet:

- [ ] Shared text-in number — text a shared number, item lands on the right
      person's list (main unlock: works for Michael without a new app habit)
- [ ] Quick-add favorites — preset activities (park, pool, museum), each with
      its own prebuilt list, layered onto today's list on demand
- [x] Star/highlight callout on an item — flags something outside the normal
      routine (e.g. "goggles needed next month") without a whole new section
- [ ] Sick-day override — a quick-add favorite that swaps in a short comfort
      list instead of the normal day (not a task tracker for school follow-ups)
- [x] Tonight/tomorrow toggle — preview + prep tomorrow's list the night
      before, distinct from "ready to walk out today"
- [x] A clear "all set" state once everything for the day is checked off

Explicitly parked for v2/v3 (streaks/badges, departure timer, idle nudge
texts, a physical magnet/log-cabin-themed kids' board) and explicitly out of
scope (general to-do tracking, becoming a family command center) — see the
vision doc.
