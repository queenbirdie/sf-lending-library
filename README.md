# The SF Lending Library

Static Hugo site for [sflendinglibrary.org](https://sflendinglibrary.org), hosted free on GitHub Pages.

## Architecture

Everything stays free — no paid services:

```
Browser
  │
  ├─ GitHub Pages (this repo) ── serves the static site (home, /kid-gear/, /party/, /costumes/, /puzzles/)
  │
  └─ fetch() ──► Google Apps Script web app ("SF Lending Library — Unified")
                   │   GET  ?action=availability&lib=<key>  → items + reservations + blackouts
                   │   GET  ?action=faq                     → FAQ groups
                   │   POST {action: submitReservation ...} → writes a row to the reservations tab
                   │   POST {action: sendContactMessage ..} → emails Lauren
                   │
                   └─► Google Sheet ("SF Lending Library — Unified")
                        tabs: inventory · reservations · faq · Blackout Dates · KG/PS/KC/PG Avail · KG/PS/KC/PG Out
```

The Apps Script keeps doing everything it does today with **zero code changes**:
receipt emails, calendar invites on confirmation, the 5-minute retry triggers,
nightly audit, and the daily schedule email. Only the *hosting of the web page*
moves to GitHub Pages. The old Apps Script URL keeps working as a fallback.

## One-time setup

1. **Get the Apps Script web app URL.** In the Apps Script editor (SF Lending
   Library — Unified): Deploy → Manage deployments → copy the Web app URL
   ending in `/exec`. It must be deployed as **Execute as: Me** and
   **Who has access: Anyone**. (If it's already deployed that way, reuse the
   existing URL — no redeploy needed.)
2. **Paste it into `hugo.toml`** as `apiUrl` (replacing
   `REPLACE_WITH_APPS_SCRIPT_EXEC_URL`).
3. **Create a GitHub repo** (e.g. `sf-lending-library`), push this folder to
   `main`.
4. In the repo: **Settings → Pages → Source: GitHub Actions.** The included
   workflow (`.github/workflows/hugo.yml`) builds and deploys on every push.
5. **Custom domain (optional):** Settings → Pages → Custom domain →
   `sflendinglibrary.org`, then at your DNS provider point the domain at
   GitHub Pages (CNAME `www` → `<username>.github.io`, plus the four A records
   for the apex — GitHub shows them on the Pages settings screen). GitHub
   provisions HTTPS automatically.

## Local preview

```
hugo server
```

(Install Hugo with `brew install hugo` if needed.) The site fetches live data
from the Apps Script API, so local preview shows real availability once
`apiUrl` is set.

## Editing content

- **Inventory, reservations, FAQs, blackout dates** — edit the Google Sheet,
  same as always. The site reads them live; availability data is cached ~15
  minutes on the Apps Script side.
- **Library names / descriptions / colors on the home page** —
  `data/libraries.yaml`.
- **Styling** — `assets/css/main.css`.
- **Page structure** — `layouts/home.html` (home) and `layouts/library.html`
  (browse pages).

## How the API calls work (for future reference)

- GETs go straight to the `/exec` URL; Apps Script serves JSON with permissive
  CORS when deployed with "Anyone" access.
- POSTs are sent with `Content-Type: text/plain` so the browser skips the CORS
  preflight (Apps Script can't answer preflights). `doPost` parses the raw
  body, so this behaves identically to JSON.
