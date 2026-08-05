# Pickup reminder emails — setup

New: borrowers now get an automatic reminder email at **8am the morning
before their pickup**, asking them to text/WhatsApp you to confirm the time
and coordinate. It covers all their items in one email if they're picking up
more than one thing, and it's styled to match the site's card-catalog look
(cream background, typewriter font, red rubber-stamp "Pickup Due Tomorrow"
badge, per-library shelf color) instead of a generic modern template.

This lives in `Code.js` as a new function, `sendPickupReminders()`, plus one
new trigger line. `CODE_GS_RESTORE.md` has been updated with the full,
correct contents of `Code.js` including this feature baked in.

## How it works

- Runs daily at 8am (same pattern as the existing `nightlyAudit` trigger).
- Looks at the `reservations` tab for rows where pickup date = tomorrow and
  status is `Confirmed` or `Added to existing request`.
- Groups by borrower (so one person picking up 3 things gets 1 email, not 3).
- Sends an HTML email matching `assets/css/main.css`'s branding: cream
  (`--bg`) page background, ink navy (`--ink`) text, a rotated red
  (`--accent`) double-bordered "Pickup Due Tomorrow" stamp, a dashed-line
  divider around the item list (echoing the FAQ's notebook-line styling),
  and a top accent bar in that library's own shelf color (`--cat-*`). Body
  copy uses `Courier New` — a universally-supported monospace fallback for
  the site's `Special Elite`/`Courier Prime` fonts, since custom web fonts
  aren't reliable in email clients.
- Includes a checklist-style call-to-action (☐, matching the calendar-invite
  checklist style) with a tappable `wa.me` WhatsApp link — all borrower
  communication funnels to WhatsApp now, no more "text or WhatsApp."
- The pickup date and time (if set) are stated together in the very first
  line, so it's readable at a glance without hunting further down.
- You're bcc'd on every reminder, same as the receipt/confirmation emails.
- Idempotent — records what it's sent in Script Properties, so re-running it
  the same day won't double-send even if the trigger fires twice.

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

2. **Add the `pickupReminderWhatsAppLink()` helper and the
   `sendPickupReminders()` function** — copy both from `CODE_GS_RESTORE.md`
   (they sit right after `sendReceiptEmail`, before `sendPendingReceipts`).

3. **Add one line to `setupTriggers()`**, next to the other daily triggers:

   ```javascript
   ScriptApp.newTrigger('sendPickupReminders').timeBased().everyDays(1).atHour(8).create();
   ```

## Activate it today

`setupTriggers()` already reruns itself every day at 3am, so the new trigger
will install itself automatically overnight. To turn it on **right now**
instead of waiting:

1. In the Apps Script editor, pick `setupTriggers` from the function
   dropdown at the top.
2. Click **Run**.
3. Approve any permission prompts if asked.

No deploy needed — this is a time-driven trigger, not part of the web app
endpoints, so nothing on the live site changes.

## Customizing the message

The wording and colors live inside `sendPickupReminders()`. A few things
you might want to tweak:

- **Colors** — edit `REMINDER_DECOR` (per-library shelf color) or
  `REMINDER_STAMP_COLOR` (the red stamp/accent) at the top.
- **The ask** — currently: *"Please text or WhatsApp me at [phone] today to
  confirm the time and coordinate pickup."* Change the copy in the `html`
  and `text` variables if you want different phrasing.
- **Send time** — change `.atHour(8)` in `setupTriggers()` to send earlier
  or later.
