# Pickup reminder emails — setup

New: borrowers now get an automatic reminder email the morning before their
pickup, asking them to WhatsApp you to confirm the time and coordinate. It
covers all their items in one email if they're picking up more than one
thing, and it's styled to match the site's card-catalog look (cream
background, typewriter font, red rubber-stamp "Pickup Tomorrow" badge,
per-library shelf color) instead of a generic modern template.

This lives in `Code.js` as a new function, `sendPickupReminders()`, plus two
new trigger lines. `CODE_GS_RESTORE.md` has been updated with the full,
correct contents of `Code.js` including this feature baked in.

## How it works

- Runs twice daily: **8am** (same pattern as the existing `nightlyAudit`
  trigger) and **4pm** as a catch-all. The 4pm run exists because a
  reservation confirmed after the 8am run — for a pickup happening
  tomorrow — would otherwise never get a reminder, since by the next 8am
  run "tomorrow" has already moved past it. Both runs call the exact same
  function; the second is purely a safety net for late confirmations, not
  a second email — see the idempotency note below.
- Looks at the `reservations` tab for rows where pickup date = tomorrow and
  status is `Confirmed` or `Added to existing request`.
- Groups by borrower (so one person picking up 3 things gets 1 email, not 3).
- Sends an HTML email matching `assets/css/main.css`'s branding: cream
  (`--bg`) page background, ink navy (`--ink`) text, a rotated red
  (`--accent`) double-bordered "Pickup Tomorrow" stamp, a dashed-line
  divider around the item list (echoing the FAQ's notebook-line styling),
  and a top accent bar in that library's own shelf color (`--cat-*`). Body
  copy uses `Courier New` — a universally-supported monospace fallback for
  the site's `Special Elite`/`Courier Prime` fonts, since custom web fonts
  aren't reliable in email clients.
- Subject line: `Reminder: [Library Full Name] pickup tomorrow` (e.g.
  "Reminder: Party Supplies Lending Library pickup tomorrow") — plain text,
  no emoji, since emoji in subjects can trigger encoding/spam-filter quirks
  in some Gmail configurations.
- Includes a checklist-style call-to-action (☐, matching the calendar-invite
  checklist style) with a tappable `wa.me` WhatsApp link — all borrower
  communication funnels to WhatsApp now, no more "text or WhatsApp."
- The pickup date and time (if set) are stated together in the very first
  line, so it's readable at a glance without hunting further down.
- You're bcc'd on every reminder, same as the receipt/confirmation emails.
- **Idempotent** — records what it's sent (keyed by library + borrower +
  pickup time + day) in Script Properties, so re-running it the same day —
  whether that's the 8am run, the 4pm catch-all, or a manual re-run — sends
  at most one email per group. This is what makes running it twice a day
  safe: whichever run finds a confirmed reservation first sends it, and the
  other one just sees it's already been sent and skips it.

## To install

**Easiest path:** open the Apps Script editor → `Code.js` → select all →
delete → paste in the full updated contents of `CODE_GS_RESTORE.md` (the code
block after the intro). This is the same "restore" process you already use;
it now includes the reminder feature.

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

2. **Add four functions** — `pickupReminderWhatsAppLink()`,
   `buildPickupReminderEmail()`, `sendPickupReminders()`, and
   `testPickupReminderEmail()` — copy all of them from `CODE_GS_RESTORE.md`
   (they sit right after `sendReceiptEmail`, before `sendPendingReceipts`).
   `buildPickupReminderEmail()` builds the subject/html/text once and is
   shared by the real sender and the test function, so the two can never
   drift out of sync.

3. **Add two lines to `setupTriggers()`**, next to the other daily triggers:

   ```javascript
   ScriptApp.newTrigger('sendPickupReminders').timeBased().everyDays(1).atHour(8).create();
   ScriptApp.newTrigger('sendPickupReminders').timeBased().everyDays(1).atHour(16).create(); // catch-all for reservations confirmed after the 8am run
   ```

## Preview it for real

Don't preview this by creating a Gmail draft and opening it — Gmail's
compose/draft editor is a rich-text editor with limited style support, and
it silently strips backgrounds, borders, letter-spacing, and the rotated
stamp when you open a styled draft, which makes it look broken even though
the real email is fine.

Instead, run `testPickupReminderEmail()` directly from the Apps Script
editor's function dropdown (Run button). It calls `GmailApp.sendEmail()`
just like the real trigger does, so it sends an actual received email to
yourself — not a draft — with full styling intact. Check it on both
desktop and your phone's Gmail app there. Edit the `libraryKey` variable
at the top of the function to preview a different library's shelf color.

## Activate it today

`setupTriggers()` already reruns itself every day at 3am, so the new
triggers will install themselves automatically overnight. To turn them on
**right now** instead of waiting:

1. In the Apps Script editor, pick `setupTriggers` from the function
   dropdown at the top.
2. Click **Run**.
3. Approve any permission prompts if asked.

No deploy needed — this is a time-driven trigger, not part of the web app
endpoints, so nothing on the live site changes.

## Customizing the message

The wording and colors live inside `buildPickupReminderEmail()`. A few
things you might want to tweak:

- **Colors** — edit `REMINDER_DECOR` (per-library shelf color) or
  `REMINDER_STAMP_COLOR` (the red stamp/accent) at the top.
- **Text sizes** — `REMINDER_FS_XS` / `REMINDER_FS_BASE` / `REMINDER_FS_STAMP`,
  also at the top, so the whole email stays on one deliberate scale.
- **The ask** — currently: *"WhatsApp me today to confirm and coordinate
  pickup."* Change the copy in the `html` and `text` variables inside
  `buildPickupReminderEmail()` if you want different phrasing.
- **Send time** — change `.atHour(8)` in `setupTriggers()` to send earlier
  or later.
- After any change, run `testPickupReminderEmail()` again to see it land
  in your inbox for real before trusting it to go out to borrowers.
