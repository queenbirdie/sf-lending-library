# Pickup & return reminder emails — setup

Borrowers now get an automatic reminder email the morning before their
**pickup**, and a matching one the morning before their **return** —
asking them to WhatsApp you to confirm the time and coordinate. Each covers
all their items in one email if there's more than one thing, and both are
styled to match the site's card-catalog look (cream background, typewriter
font, red rubber-stamp badge, per-library shelf color) instead of a generic
modern template.

Both emails come from one shared template, `buildReminderEmail(kind, ...)`
(`kind` is `'pickup'` or `'return'`), so there's a single place to tweak
wording/styling instead of two copies that could drift apart. This lives in
`Code.js` alongside `sendPickupReminders()` / `sendReturnReminders()` and
four trigger lines. `CODE_GS_RESTORE.md` has the full, correct contents of
`Code.js` including both features baked in.

## How it works

- Each runs twice daily: **8am** (same pattern as the existing
  `nightlyAudit` trigger) and **4pm** as a catch-all. The 4pm run exists
  because a reservation confirmed (or marked Lent Out) after the 8am run —
  for a pickup/return happening tomorrow — would otherwise never get a
  reminder, since by the next 8am run "tomorrow" has already moved past it.
  Both runs call the exact same function; the second is purely a safety net
  for late status changes, not a second email — see the idempotency note
  below.
- **Pickup reminder** (`sendPickupReminders`) looks at the `reservations`
  tab for rows where pickup date = tomorrow and status is `Confirmed` or
  `Added to existing request`.
- **Return reminder** (`sendReturnReminders`) looks for rows where return
  date = tomorrow and status is `Lent Out` or `Added to existing request`
  (matching the same criteria `dailyScheduleEmail` already uses for
  tomorrow's returns).
- Groups by borrower (so one person with 3 items gets 1 email, not 3).
- Sends an HTML email matching `assets/css/main.css`'s branding: cream
  (`--bg`) page background, ink navy (`--ink`) text, a rotated red
  (`--accent`) double-bordered "Pickup Tomorrow" / "Return Tomorrow" stamp,
  a dashed-line divider around the item list (echoing the FAQ's
  notebook-line styling), and a top accent bar in that library's own shelf
  color (`--cat-*`). Body copy uses `Courier New` — a universally-supported
  monospace fallback for the site's `Special Elite`/`Courier Prime` fonts,
  since custom web fonts aren't reliable in email clients.
- Subject line: `Reminder: [Library Full Name] pickup tomorrow` or
  `... return tomorrow` — plain text, no emoji, since emoji in subjects can
  trigger encoding/spam-filter quirks in some Gmail configurations.
- Includes a checklist-style call-to-action — a checkmark drawn with a
  single `<table>` cell (not a Unicode glyph inside a separately-shaped
  icon; that rendered inconsistently across mail clients during testing) —
  with a tappable `wa.me` WhatsApp link. All borrower communication funnels
  to WhatsApp now, no more "text or WhatsApp."
- The pickup/return date and time (if set) are stated together in the very
  first line, so it's readable at a glance without hunting further down.
- You're bcc'd on every reminder, same as the receipt/confirmation emails.
- **Idempotent** — records what it's sent (keyed by library + borrower +
  time + day, with separate `pickupReminder_...` / `returnReminder_...`
  prefixes) in Script Properties, so re-running either the same day —
  whether that's the 8am run, the 4pm catch-all, or a manual re-run — sends
  at most one email per group. This is what makes running each twice a day
  safe: whichever run finds the row first sends it, the other just sees
  it's already been sent and skips it.

## To install

**Easiest path:** open the Apps Script editor → `Code.js` → select all →
delete → paste in the full updated contents of `CODE_GS_RESTORE.md` (the
code block after the intro). This is the same "restore" process you already
use; it now includes both reminder features.

**If you've made other manual edits to `Code.js`** you don't want to lose,
patch in these three pieces instead:

1. **Add near the top**, right after the `LIBRARIES` array (before
   `function getLibrary(key) {`):

   ```javascript
   const REMINDER_STAMP_COLOR = '#C0392B'; // --accent
   const REMINDER_DECOR = {
     'kid-gear': { color: '#2E5FA3' },
     'party':    { color: '#D9622B' },
     'costumes': { color: '#6B4A8C' },
     'puzzles':  { color: '#2F7A4F' },
     'yoto':     { color: '#C77D18' }
   };
   ```

2. **Add six functions** — `reminderWhatsAppLink()`, `buildReminderEmail()`,
   `sendPickupReminders()`, `sendReturnReminders()`,
   `testPickupReminderEmail()`, and `testReturnReminderEmail()` — copy all
   of them from `CODE_GS_RESTORE.md` (they sit right after
   `sendReceiptEmail`, before `sendPendingReceipts`).

3. **Add four lines to `setupTriggers()`**, next to the other daily
   triggers:

   ```javascript
   ScriptApp.newTrigger('sendPickupReminders').timeBased().everyDays(1).atHour(8).create();
   ScriptApp.newTrigger('sendPickupReminders').timeBased().everyDays(1).atHour(16).create(); // catch-all for reservations confirmed after the 8am run
   ScriptApp.newTrigger('sendReturnReminders').timeBased().everyDays(1).atHour(8).create();
   ScriptApp.newTrigger('sendReturnReminders').timeBased().everyDays(1).atHour(16).create(); // catch-all for items marked Lent Out after the 8am run
   ```

## Preview it for real

Don't preview this by creating a Gmail draft and opening it — Gmail's
compose/draft editor is a rich-text editor with limited style support, and
it silently strips backgrounds, borders, letter-spacing, and the rotated
stamp when you open a styled draft, which makes it look broken even though
the real email is fine.

Instead, run `testPickupReminderEmail()` or `testReturnReminderEmail()`
directly from the Apps Script editor's function dropdown (Run button). Each
calls `GmailApp.sendEmail()` just like the real trigger does, so it sends
an actual received email to yourself — not a draft — with full styling
intact. Check it on both desktop and your phone's Gmail app there. Edit the
`libraryKey` variable at the top of either function to preview a different
library's shelf color.

## Activate it today

`setupTriggers()` already reruns itself every day at 3am, so the new
triggers will install themselves automatically overnight. To turn them on
**right now** instead of waiting:

1. In the Apps Script editor, pick `setupTriggers` from the function
   dropdown at the top.
2. Click **Run**.
3. Approve any permission prompts if asked.

No deploy needed — these are time-driven triggers, not part of the web app
endpoints, so nothing on the live site changes.

## Tagging items for return care instructions

The return reminder's "Before You Return" section only shows guidelines
relevant to what's actually being returned — someone returning a single
puzzle won't be told to wipe down high chair clips. This is driven by an
optional **Care Tags** column on the `inventory` sheet.

**One-time setup:**

1. In the `inventory` sheet, add a header in **column L** (right after
   Qty) called `Care Tags`.
2. For any item where a guideline applies, put a comma-separated list of
   tags in that item's row. Recognized tags:

   | Tag | Guideline shown |
   |---|---|
   | `pieces` | Ensure you're returning with all puzzle/game/toy pieces — for anything under 100 pieces, a manual count is appreciated |
   | `parts` | Double-check for stray parts (clips, chargers, small accessories) so nothing gets left behind |
   | `spot-clean` | Spot clean if it's dirty — if a wipe won't cut it, go ahead and give it a proper wash before returning |
   | `wash` | Clean, as appropriate, before returning — either in the laundry or dishwasher, or disinfecting by hand |
   | `batteries` | Check that the batteries still work — swap in fresh ones before returning if not |
   | `fold` | Pack it up neatly, especially if it comes in any sort of carrying case |

   Separately (not a tag — it's automatic): any return with more than one
   item gets an extra "keep them separate, nothing tucked inside something
   else" bullet, regardless of what's tagged. See `multiItemNote` inside
   `buildReminderEmail()` if you want to change that wording.

   **When a return has more than one item, each guideline gets "(Item
   Name)" appended** so it's clear which item it's about — e.g. a
   SlumberPod (`spot-clean`) returned alongside a high chair (`wash,
   parts`) shows three distinct, attributed bullets instead of a flat list
   that reads like contradictory instructions for the same thing.
   Single-item returns skip the attribution since there's nothing to
   disambiguate.

   `spot-clean` is for occasional-wipe items (bath tubs, bottle bags);
   `wash` is for anything that needs an actual clean rather than a wipe —
   fabric in regular food/mouth contact (clip-on high chair straps,
   sheets), dishware (plates, bowls, cups), and hard-plastic bathroom
   items (travel potty) all fall under it, whichever cleaning method fits;
   `batteries` is for anything battery-powered (sound machines, scales,
   electronic toys). Example: an Inglesina clip-on high chair might get
   `wash, parts`; a travel potty might get `wash`; a sound machine might
   get `batteries`; a jigsaw puzzle might get `pieces`; a pack-and-play
   might get `fold, parts`. Leave the cell blank for anything with nothing
   special to call out — no
   guidelines show for that item, and if a return is a single untagged
   item, the whole "Before You Return" section is skipped entirely rather
   than showing an empty label.
3. Nothing else needs to change — `sendReturnReminders()` already reads
   this column, unions the tags across everything in a return, and shows
   only the matching guidelines.

You don't have to tag everything at once — untagged items simply don't add
extra guidance, so this is safe to fill in gradually.

**To check it's working:** run `testReturnReminderEmail()` (see "Preview it
for real" above). It looks up real Care Tags for the sample item names set
in that function (`itemNames`, near the top) — change those to real item
names from your sheet, run it, and check the Apps Script execution log
(`View → Executions` or the log panel after running) for a line like
`care tags found: {"food":true,"parts":true}` confirming what it read.

## Customizing the message

The wording and colors live inside `buildReminderEmail()`, shared by both
reminders. A few things you might want to tweak:

- **Colors** — edit `REMINDER_DECOR` (per-library shelf color) or
  `REMINDER_STAMP_COLOR` (the red stamp/accent) at the top.
- **Text sizes** — `REMINDER_FS_XS` / `REMINDER_FS_BASE` / `REMINDER_FS_STAMP`,
  also at the top, so the whole email stays on one deliberate scale.
- **Return care guidelines** — which items get asked for what is controlled
  by inventory tagging (see "Tagging items" above). To change the *wording*
  of an existing guideline, or add a brand-new tag, edit `CARE_GUIDELINES`
  just above `buildReminderEmail()` — each entry is `{ tag: '...', text:
  '...' }`; a new tag also needs to be added to items' Care Tags cells in
  the sheet to actually show up anywhere.
- **The ask** — currently: *"WhatsApp me today to confirm and coordinate
  pickup."* / *"...your return."* Change the copy in the `html` and `text`
  variables inside `buildReminderEmail()` if you want different phrasing —
  it applies to both reminders at once since they share this function.
- **Send time** — change `.atHour(8)` in `setupTriggers()` to send earlier
  or later (each reminder's two triggers can be changed independently).
- After any change, run `testPickupReminderEmail()` and
  `testReturnReminderEmail()` again to see them land in your inbox for real
  before trusting either to go out to borrowers.
