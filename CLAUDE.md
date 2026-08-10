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

## Deployment

- `assets/`, `layouts/`, `content/`, `data/`, `hugo.toml` → live site,
  auto-deployed by `.github/workflows/hugo.yml` on every push to `main`.
- `CODE_GS_RESTORE.md` / `ADMIN_GS_RESTORE.md` → **not** deployed by
  anything; they only take effect once manually pasted into Apps Script
  (see above).
- Repo history note: two commits on `main` (Aug 8, "Add files via
  upload") once replaced `README.md` and added a stray `Code.gs` from an
  unrelated project ("Muddy", a household checklist app) — almost
  certainly an accidental wrong-repo upload. They were reverted
  (`5e6cbd4`). If root-level files ever look unrelated to this project
  again, check `git log` before assuming they're intentional.
