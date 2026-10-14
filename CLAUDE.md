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
   it that way, not a diff or excerpt). **Also update the "Last updated"
   timestamp in the header comment** (top of the file, right under `SF
   LENDING LIBRARY — Google Apps Script`) to the actual current date/time
   — get it with `TZ=America/Los_Angeles date "+%Y-%m-%d %-I:%M %p %Z"`
   rather than guessing, so it reflects when the code actually last
   changed (not when the file was first created).
2. **Always syntax-check before committing** — extract the code block and
   run `node --check` on it. This has caught real mistakes; don't skip it.
3. Tell the user to: open the Apps Script editor → `Code.js` → select all →
   delete → paste the updated block → save, **then redeploy**: Deploy →
   Manage deployments → pencil icon on the existing deployment → Version:
   New version → Deploy. Saving the script does **not** update what the
   live web app actually runs — a deployment stays pinned to whatever
   version was active when it was last deployed, so skipping this step
   leaves old behavior running indefinitely with no error, even though
   the editor shows the new code. (This bit a real change: the referral
   source field was pasted in and confirmed present in the editor, but
   went un-deployed for a while — submissions kept succeeding with the
   field silently ignored, no validation error, nothing written to its
   column — because the live web app was still running the pre-change
   version. Always call out the redeploy step explicitly, don't assume
   "save" was enough.)
4. For anything that needs verifying, point them at the relevant
   `test*()` function (see below) rather than assuming it works.

`Admin.gs` has the same pattern via `ADMIN_GS_RESTORE.md` /
`APPS_SCRIPT_ADMIN_SETUP.md`.

## Bare Apps Script URL — `doGet()`'s legacy fallback

Hitting the deployed `/exec` URL directly (no `?action=` param — e.g. an
old bookmark or shared link from before the Hugo site existed) used to
fall through to `HtmlService.createHtmlOutputFromFile('availability')` —
an entire second copy of the request form, but as a standalone `.html`
file that lives *only* inside the Apps Script project itself. Unlike
`Code.js`/`Admin.gs`, that file was never mirrored anywhere in this repo
(no `*_RESTORE.md` for it), so nothing here could have ever caught it
drifting out of sync — it just silently kept running whatever it looked
like the day it was written.

This caused real, hard-to-diagnose reports (2026-09-24): people submitting
via that stale page got "Please tell us how you heard about us." on
submit with no such field ever shown to fill in. Not a caching bug on the
real site — the browser was genuinely on `script.google.com/macros/s/{id}/
exec`, not `sflendinglibrary.org`. The old page never sent a
`referralSource` field, but it calls the *same*, definitely-current
`submitReservation()`, whose server-side validation now rejects a blank
one with exactly that message — so the old page's generic error display
just surfaced the backend's rejection for a field it doesn't know exists.
Any future frontend-only addition to the real site (a new required field,
a copy change, etc.) would silently reproduce this same failure mode for
anyone still landing on that bare URL, since that page can never be
updated from here.

Fixed by having `doGet()`'s fallback branch redirect to
`https://sflendinglibrary.org/` (or `/{key}/` when `e.parameter.lib` is a
known library key) instead of serving that file at all — so a stray old
link now bounces to the real, current site rather than a relic that can
only fall further out of date. The old `availability.html` file itself is
harmless dead weight once nothing references it — safe for Lauren to
delete from the Apps Script project's file list, but not required.

**Never preview HTML email changes via a Gmail draft.** Gmail's
compose/draft editor is a rich-text editor that silently strips
backgrounds, borders, letter-spacing, `position`, and other CSS — a draft
that looks broken may render perfectly as an actually-received email.
Always test via `GmailApp.sendEmail()` (i.e. the `test*()` functions),
never via `create_draft`.

## Pickup & return reminder emails

`buildReminderEmail(kind, firstName, lib, deco, dateFmt, time, items,
careItems, suppressMultiItemNote)` in `Code.js` is the single shared
template for both the pickup and return reminder emails (`kind: 'pickup' |
'return'`) — don't fork it into two copies. Sent by `sendPickupReminders()` /
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

**"WhatsApp me, don't reply to this email" note.** Both the reminder
email (`buildReminderEmail()`, HTML and plain-text versions) and the
receipt/confirmation email (`sendReceiptEmail()`) steer the recipient to
WhatsApp instead of replying to the email itself — added per Lauren's
request (2026-10-05) so borrowers don't mistake an auto-generated email
for one she personally wrote and sent, then reply to it expecting her to
see it there. Distinct from the existing `waLink`/"WhatsApp me" CTA
already in the reminder's "To Do" box, which is about confirming that
specific pickup/return — this note is a general "if you need me for
anything else" footer. Wording differs between the two: the reminder
email keeps "This reminder is sent automatically. Want to reach me
directly? WhatsApp me." as a clickable link, styled muted/small
(`REMINDER_FS_XS`, `#8A97A6`) so it doesn't compete with the reminder's
real CTA; the receipt email (plain text, no `htmlBody`) settled — after
two rounds of wording changes (2026-10-09, 2026-10-11, per Lauren) — on
`'This confirmation is sent automatically — if you\'d like to reach me
directly, WhatsApp me at ' + lib.phone + '.'`, a plain phone number with
**no** `reminderWhatsAppLink()` wa.me link appended, unlike every other
WhatsApp mention in this file — a deliberate, Lauren-specified exception,
not an oversight; don't "fix" it by adding the link back.
Internal-only emails (nightly audit, double-booking alerts, etc. — sent
to Lauren herself, not borrowers) deliberately don't get either note.

## Care Tags (return-reminder item-specific guidance)

Optional **Care Tags** column (L) on the `inventory` sheet, comma-separated,
read via `getItemCareTags()`. Current tags, defined in `CARE_GUIDELINES`:
`pieces`, `parts`, `spot-clean`, `wash`, `batteries`, `fold`. Only the tags
that apply to what's actually being returned show up — untagged items add
nothing. A separate, non-tag `multiItemNote` bullet shows automatically
whenever a return covers more than one item ("keep them separate, nothing
tucked inside something else") — suppressed in two cases: when the return
is exactly one of the item-ID sets in `NESTING_EXPECTED_ITEM_SETS` (e.g.
`KG-101` + `KG-162`, car seat + carrier, where the car seat is meant to
sit inside the carrier — nesting is correct for that pairing), or when
the library is listed in `MULTI_ITEM_NOTE_SUPPRESSED_LIBRARIES` (Yoto —
its cards are small/thin enough that the note isn't relevant guidance
regardless of which ones are mixed together). No "leave it as good as
you found it" closing line anymore — removed per Lauren's request. Full
tag table, tagging conventions, and the running log of these
rules/exceptions: `REMINDER_EMAILS_SETUP.md`.

`careGuidelinesByItem()` attributes each guideline to the item it came
from ("(Item Name)") on multi-item returns — but only when that guideline
is unique to one item. A guideline shared by more than one item (two
puzzles both tagged `pieces`, several Yoto cards all tagged `spot-clean`)
collapses to a single unattributed bullet instead of repeating the
identical line once per item, since attribution wouldn't disambiguate
anything once it applies to more than one thing. This is a general rule,
not a per-library special case.

## Referral source ("How did you hear about us?")

Required free-text field on the request form (`modalReferralSource` in
`layouts/library.html`) — required (not a dropdown) so people have to
actually type something instead of clicking whatever option is nearest,
per Lauren's call. Enforced in the same three-places pattern as other
required fields:
- `assets/js/library.js` `submitForm()`: pre-submit validation.
- `Code.js` `submitReservation()`: the real gate — rejects the request if
  blank.

Stored as **column T ("Referral Source"), appended at the end** of the
`reservations` sheet — not inserted earlier in the row — because
reservation columns (unlike the inventory sheet's `COL_*` constants)
aren't named; most functions read them by raw numeric index (`r[0]`,
`r[5]`, `r[12]`, etc. throughout `Code.js`). Inserting a new column
anywhere before the existing ones would silently shift every one of those
indices. Appending avoids that entirely. `colorizeReservations()`'s
`numCols` was bumped from 19 to 20 to match so row-banding still covers
the new column.

**One-time manual step**: `getOrCreateReservationsSheet()` only writes
headers when it creates the sheet from scratch, which won't happen again
on the live sheet — so the "Referral Source" header needs to be added to
column T by hand, the same one-time pattern as the Care Tags column (see
`REMINDER_EMAILS_SETUP.md`).

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
values: Kid & Travel Gear 21, Party Supplies 7, Kids' Costumes 21 (raised
from 7, 2026-10-14, per Lauren), Puzzles & Games 60, Yoto 21. Enforced in
the same three-places pattern as booking lead time:
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

## Revising a multi-item reservation — one combined calendar invite

A single reservation can span several rows in `reservations` (one row per
item). `Admin.gs` `adminReviseReservation(formData)` handles both a
single-item revise (`formData.row`) and a multi-item group revise
(`formData.rows`: `[{row, qty}, ...]`, all sharing one new pickup/return
date+time from the group-revise form in `assets/js/admin.js`) — **the
group case must stay a single batched call**, not the frontend looping
one `adminReviseReservation` call per row. Every row's availability is
validated before anything is written (so one conflicting item aborts the
whole revise instead of partially applying it), then the old combined
calendar invite is deleted once and exactly one new combined invite is
recreated from the full, post-revise item list via `sendCalendarInvites()`
(which already accepts multiple items — this is the same function
`maybeSendCombinedConfirmation()` uses to send one invite for a
multi-item request when it's first confirmed). Looping per row instead —
the original bug — deletes+recreates the invite once per item, leaving
one separate calendar invite per item rather than a single combined one.

**The single-item revise path also auto-discovers siblings.** The admin
dashboard still shows a per-item "Revise" button on every item even inside
a multi-item group (alongside the group's "Revise all") — that button
calls `adminReviseReservation` with just `formData.row`, no `formData.rows`.
Since a reservation always has one shared date+time and one combined
invite, `adminReviseReservation` checks whether that lone row has siblings
(same library + email + current pickup/return dates + original submission
timestamp — the same grouping key `maybeSendCombinedConfirmation()` uses)
and folds them into the batch automatically, keeping each sibling's
existing qty untouched and only applying the requested qty change to the
row actually being revised. Without this, using the per-item button on a
grouped reservation would silently regenerate the combined invite with
just that one item, dropping the others off the borrower's calendar — the
same failure mode the batching fix above addresses, just reachable through
a different button.

**Revising also has to mark its own dedup key, not just send the invite.**
`sendPendingInvites()` (a periodic catch-all trigger — see
`REMINDER_EMAILS_SETUP.md`) and `maybeSendCombinedConfirmation()` both
dedup on a Script Properties key that includes the pickup/return dates
themselves (`'sent_' + libraryKey + '_' + email + '_' + pickupFmt + '_' +
returnFmt + '_' + tsFmt`). Since `adminReviseReservation()` changes those
dates, the *new* dates always produce a key that's never been marked sent
— so after it sends the recreated invite directly, it also sets that same
key itself; otherwise `sendPendingInvites()`'s next run (every few
minutes) would see an apparently-unsent reservation and fire a second,
duplicate pickup+return invite on top of the one revise already sent.

**Every admin dashboard section groups multi-item reservations into one
card, with per-section bulk actions.** `Admin.gs` `getAdminData()` tags
every row with a `groupKey` (the original submission timestamp — shared
by every item of one request, unique across different requests), and
`assets/js/admin.js`'s `renderGroupedSection()` uses it to fold same-
request rows into a single card (`groupItems()`), showing a "N items ·
same request" label plus bulk buttons: a primary one from `bulkDef`
(`"Mark all returned"`, `"Mark all lent out"`, `"Confirm all"` — calls
`adminBatchUpdateStatus`, which is already status-agnostic and works on
any rows list) and, when `actions` includes `'revise'`/`'cancel'`/
`'decline'`, a secondary `"Revise all"`/`"Cancel all"`/`"Decline all"`.
**All eight sections use this** (`renderSection()`, the old ungrouped
per-row renderer, was removed once the last four sections — Tomorrow's
returns, Checked out, Overdue pickups, Overdue — were switched over to
match); before that, those four rendered each item in a multi-item
reservation as a fully separate card with no way to act on the whole
request at once — reported 2026-09-29 as a multi-item Yoto return (3
cards, one request) with no "mark all returned" option in "Tomorrow's
returns." No backend change was needed — `groupKey` and
`adminBatchUpdateStatus` already existed and worked identically for
every section; it was purely that four call sites had never been wired
up to the grouped renderer. `renderGroupedSection()` takes a `showLate`
param (threaded through to `metaHtml()`) so the "N days late" line still
shows on the Overdue/Overdue-pickups sections once grouped — that's the
one thing the old `renderSection()` did that a naive copy-paste of the
other sections' calls would have silently dropped.

**Every admin write that targets a row number verifies that row's
identity first.** The dashboard's buttons (mark returned/lent out,
revise, bulk actions) carry a row number captured whenever
`getAdminData()` last ran. Nothing in `Code.js`/`Admin.gs` ever inserts
or deletes sheet rows — but Lauren does, manually, directly in the sheet
(e.g. blank spacer rows between days). That shifts every row number below
the edit, so a dashboard tab left open from before the edit writes its
next click into whatever now sits at that stale row number instead of
the reservation it meant — silently corrupting an unrelated reservation,
or, if rows were only inserted, landing on a blank row and leaving an
orphaned `Status`-only value with nothing else next to it (reported
2026-10-06: blank rows plus a couple of stray "Lent Out" cells with no
other data, found in the `reservations` sheet). Fixed by
`verifyRowTimestamp(sheet, row, ts)` in `Admin.gs` — `ts` is the row's own
Timestamp (col B) in ms, exactly `sortKey` from `getAdminData()`'s
entries, which `assets/js/admin.js` now threads through every write call
(`updateStatus`, `bulkUpdateStatus`, `saveRevise`, `saveGroupRevise`,
`bulkButtonsHtml`'s per-row `{row, ts}` pairs). `adminUpdateStatus()`,
`adminBatchUpdateStatus()`, and `adminReviseReservation()` all check this
before writing anything (the whole batch is checked before any row in it
is touched, same all-or-nothing pattern as the existing availability
check) — on a mismatch, the write is refused with "This reservation may
have moved — please refresh the dashboard and try again." instead of
silently landing on the wrong row. `adminReviseReservation()`'s
sibling-auto-discovery also waits for this check, since discovering
"siblings" from a stale/wrong row's data would find rows unrelated to the
reservation actually being revised.

**That same change briefly broke every bulk button** ("Confirm all",
"Mark all returned", "Mark all lent out", "Cancel all", "Decline all" —
reported 2026-10-11 as "Confirm all" not clickable). `bulkButtonsHtml()`
in `assets/js/admin.js` builds each button's `onclick="..."` as a
double-quoted HTML attribute, and splices the per-row `{row, ts}` list
into it via `JSON.stringify()` — but `JSON.stringify` always
double-quotes object keys (`[{"row":5,"ts":...}]`), so those embedded
`"` characters terminated the `onclick="..."` attribute early and
corrupted the button's markup. Before this change `rows` was a plain
array of numbers (`[5,6]` — no quotes in its JSON at all), so the same
double-quoted attribute was always safe; adding `ts` is what exposed it.
Fixed by single-quoting those two `onclick='...'` attributes instead
(matching the pattern `toggleGroupRevise()`'s button already used safely
a few lines below) and switching the JS string literals inside them
(`status`, `label`) from single to double quotes so they don't conflict
with the new single-quoted attribute delimiter. Any future change to
what gets JSON-stringified into one of these inline `onclick` attributes
should be checked against which quote character the surrounding HTML
attribute uses — mixing them is what caused this.

**Follow-up from reviewing that fix (2026-10-12):** switching those two
attributes to single-quoted exposed a second, still-latent version of the
same bug — `esc()` (`common.js`) escapes `"` but not `'`, so an
apostrophe anywhere in `bulkDef.label` or `cancelLabel` would terminate
the new single-quoted attribute the same way the unescaped JSON did.
Currently harmless (every label is a hardcoded string with no apostrophe:
"Confirm all", "Mark all returned", etc.), but fixed anyway rather than
left as a landmine for whoever adds a differently-worded label later.
Fixed with a attribute-scoped helper, `escForSingleQuoteAttr()` in
`admin.js`, used only for the copy of the label spliced into the
`onclick='...'` attribute (the visible button text still uses plain
`esc()`). **Deliberately not fixed by hardening `esc()` itself** to also
escape `'` — `esc()`'s output is also used as a CSS attribute-selector
value in `library.js`'s `removeFromCart()`
(`document.querySelector('.item-card[data-name="' + esc(name) + '"]')`),
where escaping `'` would break matching for any item name that actually
contains an apostrophe (plausible for real inventory — "Kid's costume",
etc.) — confirmed by simulating both the attribute-breakout and the
CSS-selector cases before deciding. If a similar quote-mismatch bug shows
up at a new call site, prefer a scoped fix over widening `esc()`'s
behavior, since callers rely on it differently in different contexts.

**Known improvement, not yet done:** every button in `admin.js` is wired
via a hand-built inline `onclick="..."` string with manually-matched
quote characters — the exact bug class behind both of the above. Moving
dynamic values into `data-*` attributes (HTML-entity-escaped by the DOM
automatically) and binding click handlers with `addEventListener` instead
would remove this bug class entirely rather than relying on every future
edit to re-verify quote-matching by hand. Not done here — it's a real
rewrite of the rendering approach across the whole file, not a small fix,
and nothing is currently broken — but worth doing deliberately rather
than patching the same bug a third time.

**Cancelling/declining prompts for an optional note, appended to column
Q** (2026-10-14, per Lauren). Both the per-row "Cancel"/"Decline" buttons
and the group "Cancel all"/"Decline all" bulk button now go through
`cancelWithNote()`/`bulkCancelWithNote()` (`assets/js/admin.js`) instead
of calling `updateStatus()`/`bulkUpdateStatus()` directly — a `prompt()`
asks for a note; clicking its own Cancel button backs out of the whole
cancellation (nothing is changed), while OK proceeds whether or not any
text was entered. `updateStatus()`/`bulkUpdateStatus()` gained a trailing
`note` param (default `''`, so every other status change — Confirm, Mark
Lent Out, Mark Returned, Lost/Damaged — is unaffected and never prompts).
On the backend, `applyReservationStatus()` (`Admin.gs`) takes the same
`note` param and, when non-empty, calls `appendNote(sheet, row, note)` —
**appends** to whatever's already in column Q (Notes) on a new line
rather than overwriting it, since that column may already hold a note
Lauren wrote by hand. For a bulk cancel, the one note typed is appended
to every row in the batch. No separator/prefix beyond a newline — just
the note text as typed, stacked under anything already there.

**Cancelling the *entire* reservation also deletes its calendar invite —
cancelling one item within a multi-item reservation deliberately does
not** (2026-10-15, per Lauren's explicit distinction). After
`applyReservationStatus()` writes a `'Cancelled'` status,
`adminUpdateStatus()`/`adminBatchUpdateStatus()` call
`maybeDeleteInviteIfFullyCancelled(sheet, row, tz)`, which uses a new
`findReservationGroupRows()` helper (same library+email+pickup/return-
dates+original-timestamp grouping key as `maybeSendCombinedConfirmation()`
and `adminReviseReservation()`'s sibling auto-discovery — see "Revising a
multi-item reservation" above) to look at *every* item in that original
reservation, not just the row(s) just cancelled. If any sibling is still
in an active status (`Pending`/`Confirmed`/`Lent Out`/`Added to existing
request`), the reservation isn't fully cancelled yet — e.g. cancelling one
item via its per-item "Cancel"/"Decline" button while its siblings stay
Confirmed — so the shared invite (which still covers those active
items) is deliberately left alone. Only when **no** sibling is still
active (every one is now `Cancelled` or `Lost or Damaged` — a true
single-item reservation counts too, since it has no siblings to begin
with) does it delete the invite, via a new shared `deleteInviteEvents()`
helper (factored out of `adminReviseReservation()`'s existing old-invite
cleanup, which now calls the same helper — identical behavior, no longer
duplicated). For the bulk "Cancel all"/"Decline all" path, this check
runs once per distinct reservation group *after* every row in the batch
has already been written — not interleaved into the per-row write loop,
which would see not-yet-processed siblings as still active and skip the
deletion even on a full cancel-all.

## Dedicated calendar for pickup/return invites

Invites go to `LIBRARY_CALENDAR_ID` (`Code.js`) — a secondary calendar in
Lauren's own Google account, not her personal/default one, so borrower
invites don't clutter it. Because it's still her account, she remains the
organizer on every invite exactly as before; the separate calendar only
means it shows as its own toggleable entry under "My calendars" that she
can show/hide independently. Applies **going forward only** — invites
created before this was added are not migrated and stay on the personal
calendar, since moving an event with an attendee can re-send them a
notification email and confuse borrowers about a reservation that hasn't
actually changed. Three places reference it:
- `sendCalendarInvites()` — creates new invites on `LIBRARY_CALENDAR_ID`
  (previously hardcoded to `'primary'`).
- `auditCalendarInvites()` / `nightlyAudit()`'s missing-invite check —
  both use the shared `findInviteEvents(firstName, libNameClean, dayStart,
  dayEnd, kind)` helper, which checks `LIBRARY_CALENDAR_ID` first and
  falls back to the personal default calendar. This isn't optional: a
  reservation confirmed *before* the calendar split still has its invite
  on the personal calendar, so checking only `LIBRARY_CALENDAR_ID` would
  flag every one of those as "missing" every night until it completes —
  the two-calendar check is what avoids that false positive.
- `Admin.gs` `adminReviseReservation()`'s old-invite cleanup — checks
  **both** `LIBRARY_CALENDAR_ID` and the personal default calendar when
  deleting the old invite before recreating it, since a revised
  reservation might predate the calendar split. (Same two-calendar
  principle as `findInviteEvents()` above, just for deletion instead of
  existence-checking, and it lives in `Admin.gs` rather than `Code.js`.)

`findOldTitleInvites()` (a one-off legacy migration helper, unrelated to
this) is intentionally untouched — it still searches the personal
calendar, since it's looking for old-format-titled events that predate
even the current naming convention and were never affected by this.

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

**Item ID shown next to the item name, admin-facing surfaces only**
(2026-10-11, per Lauren's request, for cross-referencing against the
`inventory` sheet) — as `[KG-175]` immediately after the name, before any
brand/size parenthetical. Deliberately scoped to what she herself sees:
- **Admin dashboard** (`assets/js/admin.js`): `itemLineHtml()` — the one
  function every reservation card's item row renders through — plus
  `renderConflicts()`'s double-booking cards. Styled muted
  (`.admin-item-id`, `#8A97A6`) so it doesn't compete with the item name.
  Also folded into `searchTextFor()` so the dashboard search box matches
  on Item ID too, not just name/email/phone.
- **Admin-only audit emails** (`Code.js`, all sent only to
  `Session.getEffectiveUser().getEmail()`, never to borrowers):
  `nightlyAudit()` (both its double-booking section and its overdue-
  pickup/return lines), `auditForDoubleBookings()`, `dailyScheduleEmail()`.
- **Borrower-facing emails & calendar invites** — `sendReceiptEmail()`,
  `buildReminderEmail()` (via `sendPickupReminders()`/
  `sendReturnReminders()`'s local `itemLabel()` helpers), and
  `sendCalendarInvites()` (both its item list and its "MULTIPLE UNITS"
  banner) — borrowers see `[ID]` too here, not just Lauren; she explicitly
  opted into this scope rather than admin-only.
- **Deliberately left out**: the public site's item-listing cards
  (`library.js`) — would need a backend change since the public API
  doesn't send Item ID at all today, and Lauren didn't ask for borrowers
  to see it while *browsing*, only on what they already receive.

`getAdminData()`'s reservation `entry` objects (and
`collectPastFromSheet()`'s past-reservation objects, and the
double-booking `conflicts` array) didn't carry an `itemId` field before
this — each function computed its own local `itemId`/`xItemId` var for
lookups (availability, image URL) but never attached it to the object it
returned, even though the data was sitting right there. Same gap existed
in `Code.js`'s audit functions and reminder `itemLabel()` helpers — the
row's `r[5]` (Item ID column) was already in scope at every one of these
call sites, just never read. No new data flow was needed anywhere, only
threading an already-available value one step further.

**Duplicate Item IDs are checked nightly** (2026-10-12, per Lauren — she
found a couple manually). `findInventoryRow()`'s ID-match branch scans
the *entire* `inventory` sheet with no per-library scoping (unlike its
name-match fallback, which does check library) — every lookup that
resolves by Item ID (availability, qty, image URL, Care Tags, etc.)
assumes each ID is globally unique across all libraries, not just unique
within one. If two rows ever share an ID, the first match in sheet order
silently wins for every one of those lookups — no error, just a wrong
item's availability/qty quietly answering for both. `nightlyAudit()`
(`Code.js`) now has a "Duplicate item IDs" section (checked first, before
double-bookings, since a duplicate ID could itself be *causing* a bogus
double-booking conflict) that groups `inventory` rows by Item ID and
reports any ID used by more than one row — included in the same combined
"all clear" / summary email as the other checks, same dedup-free style
(no Script Properties key; it just re-scans fresh every run, like the
double-booking section does). No separate standalone function added for
manual on-demand checks — `nightlyAudit()` itself can just be run
directly from the Apps Script editor any time.

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
