# CLAUDE.md

Guidance for Claude Code (or any future session) working in this repo.

## What this is

Static Hugo site for [sflendinglibrary.org](https://sflendinglibrary.org)
(GitHub Pages) + a Google Apps Script backend + a Google Sheet
("SF Lending Library — Unified") as the database. See `README.md` for the
full architecture. Owner/admin: Lauren (lrturon@gmail.com).

## Critical: Apps Script has no API access — sync is manual

`CODE_GS_RESTORE.md` is the **source of truth** for `Code.js`, the Apps
Script backend. There is no tool access to Lauren's live Apps Script
project — every change to backend logic (reminders, reservations, admin
actions, etc.) means:

1. Edit the code inside the ```` ```javascript ```` block in
   `CODE_GS_RESTORE.md` (it's the complete, paste-ready file — always keep
   it that way, not a diff or excerpt).
2. **Always syntax-check before committing** — extract the code block and
   run `node --check` on it. This has caught real mistakes; don't skip it.
3. Tell the user to: open the Apps Script editor → `Code.js` → select all →
   delete → paste the updated block → save.
4. For anything that needs verifying, point them at the relevant
   `test*()` function (see below) rather than assuming it works.

`Admin.gs` has the same pattern via `ADMIN_GS_RESTORE.md` /
`APPS_SCRIPT_ADMIN_SETUP.md`.

**Never preview HTML email changes via a Gmail draft.** Gmail's
compose/draft editor is a rich-text editor that silently strips
backgrounds, borders, letter-spacing, `position`, and other CSS — a draft
that looks broken may render perfectly as an actually-received email.
Always test via `GmailApp.sendEmail()` (i.e. the `test*()` functions),
never via `create_draft`.

## Pickup & return reminder emails

`buildReminderEmail(kind, firstName, lib, deco, dateFmt, time, items,
careItems)` in `Code.js` is the single shared template for both the
pickup and return reminder emails (`kind: 'pickup' | 'return'`) — don't
fork it into two copies. Sent by `sendPickupReminders()` /
`sendReturnReminders()`, each on a twice-daily trigger (8am standard run +
4pm catch-all for late status changes), deduped per day via Script
Properties so the two runs never double-send. Full details:
`REMINDER_EMAILS_SETUP.md`.

Styling matches `assets/css/main.css`'s card-catalog branding (cream
`--bg`, navy `--ink`, red `--accent`, per-library `--cat-*` colors,
`Courier New` as an email-safe stand-in for the site's `Special
Elite`/`Courier Prime` fonts). Checkmarks/checkboxes in emails must be
built with `<table>` + `vertical-align:middle`, not `position:absolute`
or an oversized font glyph — both were tried and broke on mobile Gmail
before landing on the table-cell approach used now.

## Care Tags (return-reminder item-specific guidance)

Optional **Care Tags** column (L) on the `inventory` sheet, comma-separated,
read via `getItemCareTags()`. Current tags, defined in `CARE_GUIDELINES`:
`pieces`, `parts`, `spot-clean`, `wash`, `batteries`, `fold`. Only the tags
that apply to what's actually being returned show up — untagged items add
nothing. A separate, non-tag `multiItemNote` bullet shows automatically
whenever a return covers more than one item ("keep them separate, nothing
tucked inside something else"). No "leave it as good as you found it"
closing line anymore — removed per Lauren's request. Full tag table and
tagging conventions: `REMINDER_EMAILS_SETUP.md`.

`careGuidelinesByItem()` attributes each guideline to the item it came
from ("(Item Name)") on multi-item returns — but only when that guideline
is unique to one item. A guideline shared by more than one item (two
puzzles both tagged `pieces`, several Yoto cards all tagged `spot-clean`)
collapses to a single unattributed bullet instead of repeating the
identical line once per item, since attribution wouldn't disambiguate
anything once it applies to more than one thing. This is a general rule,
not a per-library special case.

## Booking lead time

`BOOKING_LEAD_DAYS = 2` — the earliest a pickup can be booked is 2
calendar days out, enforced in three places that must stay in sync:
- `assets/js/library.js`: the date picker's `min` attribute
- `assets/js/library.js` `submitForm()`: pre-submit validation
- `Code.js` `submitReservation()`: the actual server-side enforcement
  (frontend checks are just UX — this is the real gate)

Admin's revise-reservation date fields (`assets/js/admin.js`) are
deliberately **not** bound by this — that's an authenticated override
path for Lauren, not public self-service booking.

## Borrow window limits (per library)

Each library in `LIBRARIES` (`Code.js`) has a `maxLoanDays` capping how
long an item may be checked out (`returnDate - pickupDate`). Current
values: Kid & Travel Gear 21, Party Supplies 7, Kids' Costumes 7, Puzzles
& Games 60, Yoto 21. Enforced in the same three-places pattern as booking
lead time:
- `Code.js` `getAvailabilityData()` includes `maxLoanDays` in the
  `availability` API response so the frontend knows the current library's
  cap.
- `assets/js/library.js`: `onDatesChange()` sets the return-date picker's
  `max` from `pickupDate + maxLoanDays`, and `submitForm()` re-validates
  before submit.
- `Code.js` `submitReservation()` is the real gate — rejects any
  reservation whose loan length exceeds `lib.maxLoanDays`.

If the natural cutoff (`pickupDate + maxLoanDays`) lands on a blackout
date, it rolls forward to the next open day instead of just shrinking the
borrower's window — `maxLoanCutoff()` in `Code.js`, mirrored by
`loanCutoffMs()` in `library.js`. A blackout date elsewhere in the middle
of the loan period doesn't affect the cap; only one sitting right at the
boundary does.

Same caveat as booking lead time: Admin's revise-reservation flow is not
bound by this.

## Item ID vs Item Name — matching reservations back to inventory

Every reservation row stores an Item Name snapshot (column H) from the
moment it was booked. Renaming an item in `inventory` later doesn't
update that snapshot, so name-based matching between `reservations` and
`inventory` quietly breaks for any reservation booked before the rename —
not just cosmetic stuff like Care Tags, but the live availability
calculation itself (`getAvailabilityData()`) and the conflict check that
blocks double-booking (`checkAvailability()`), since both used to join
purely on name.

Fixed by matching on **Item ID** (column A/F, stable — never changes on a
rename) wherever a reservation is being joined back to inventory, with a
name-based fallback only for the rare row missing an ID. `findInventoryRow(itemId,
itemName, libraryKey, invRows)` is the shared resolver — ID-first, name as
fallback — used by `getItemQty/Brand/Size/CareTags/ImageUrl/Libraries()`,
`checkAvailability()`, `getAvailabilityData()`, `nightlyAudit()`'s
double-booking scan, and `auditForDoubleBookings()`. The one place a name
lookup is unavoidable and intentional: `getItemId()`, resolving a fresh
frontend submission's chosen name to its current inventory row — the
frontend only ever knows items by name, so this is where an ID first gets
attached to a reservation. Everything downstream of that point works from
the ID.

Not touched (name-based, informational only, don't gate booking):
`buildAvailabilityCalendar()` (its Sheets formula still joins on
Reservations!H vs the calendar tab's own name column) and `debugItem()`'s
logging. `buildCurrentlyOut()` was never affected — it reads a
reservation's own stored fields directly, no inventory join involved.

## Deployment

- `assets/`, `layouts/`, `content/`, `data/`, `hugo.toml` → live site,
  auto-deployed by `.github/workflows/hugo.yml` on every push to `main`.
- `CODE_GS_RESTORE.md` / `ADMIN_GS_RESTORE.md` → **not** deployed by
  anything; they only take effect once manually pasted into Apps Script
  (see above).

## Session hygiene — this environment is shared across Lauren's projects

Lauren's Claude Code environment isn't dedicated to this repo — the same
environment has hosted work on at least three unrelated projects: this
lending library, "Friends of Parque Niños Unidos" (a park-cleanup
volunteer site, repo `queenbirdie/parque-ninos-park`, live at
friendsofsfparks.org), and "Muddy" (a household door-checklist app, also
built inside `parque-ninos-park`'s environment). This has caused two
distinct kinds of confusion worth watching for:

- **Wrong-repo sessions.** A session titled around lending-library work
  (e.g. "SF lending library inventory update") can still have
  `parque-ninos-park` as its actual source repo — the title doesn't
  guarantee the repo. If a session's work seems to have vanished or never
  merged, check what repo it actually attached to before assuming the
  work is lost; it may just be sitting in the wrong place (or, per the
  case below, never pushed at all).
- **Cross-project file bleed.** Two commits on `main` (Aug 8, "Add files
  via upload") once replaced `README.md` and added a stray `Code.gs` from
  Muddy — almost certainly an accidental wrong-repo upload. Reverted
  (`5e6cbd4`). If root-level files ever look unrelated to this project
  again, check `git log` before assuming they're intentional.

Within this repo specifically: on 2026-08-25, two Claude Code sessions
were pushing to `main` around the same time — one adding borrow-window
limits, another independently generalizing `careGuidelinesByItem()`'s
Yoto dedupe. Both landed fine (different functions, no line conflicts),
but `main` had moved between fetch and merge, turning an expected
fast-forward into a real merge. `CODE_GS_RESTORE.md` is one large file
most backend changes touch, so a same-region collision is easy to imagine
next time.

**Takeaway for any future session:** confirm you're actually rooted in
`queenbirdie/sf-lending-library` before starting work, prefer one active
session on this repo at a time, and `git fetch origin main` immediately
before merging rather than assuming `main` hasn't moved since you last
checked.
