# Pickup reminder emails — setup

New: borrowers now get an automatic reminder email at **8am the morning
before their pickup**, asking them to text/WhatsApp you to confirm the time
and coordinate. It's colorful/fun (matches each library's color + emoji) and
covers all their items in one email if they're picking up more than one thing.

This lives in `Code.js` as a new function, `sendPickupReminders()`, plus one
new trigger line. `CODE_GS_RESTORE.md` has been updated with the full,
correct contents of `Code.js` including this feature baked in.

## How it works

- Runs daily at 8am (same pattern as the existing `nightlyAudit` trigger).
- Looks at the `reservations` tab for rows where pickup date = tomorrow and
  status is `Confirmed` or `Added to existing request`.
- Groups by borrower (so one person picking up 3 things gets 1 email, not 3).
- Sends an HTML email with the library's color/emoji, the item list, the
  requested time, and a highlighted call-to-action to text/WhatsApp you at
  the library's phone number to confirm and coordinate.
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
   const REMINDER_DECOR = {
     'kid-gear': { emoji: '🧳', color: '#2E5FA3' },
     'party':    { emoji: '🎉', color: '#D9622B' },
     'costumes': { emoji: '🎭', color: '#6B4A8C' },
     'puzzles':  { emoji: '🧩', color: '#2F7A4F' },
     'yoto':     { emoji: '🎧', color: '#C77D18' }
   };
   ```

2. **Add the `sendPickupReminders()` function** — copy it from
   `CODE_GS_RESTORE.md` (it sits right after `sendReceiptEmail`, before
   `sendPendingReceipts`).

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

- **Colors/emoji** — edit `REMINDER_DECOR` at the top.
- **The ask** — currently: *"Please text or WhatsApp me at [phone] today to
  confirm the time and coordinate pickup."* Change the copy in the `html`
  and `text` variables if you want different phrasing.
- **Send time** — change `.atHour(8)` in `setupTriggers()` to send earlier
  or later.
