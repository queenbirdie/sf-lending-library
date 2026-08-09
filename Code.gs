/**
 * Muddy bridge: calendar events + master item list.
 *
 * Deploy this as a Google Apps Script Web App. It does two things:
 *   - default (no `type` param, or `type=calendar`): reads *today's and
 *     tomorrow's* events off the calendars listed below (tomorrow's is for
 *     the "prep tonight for tomorrow" toggle) and returns just their title +
 *     location as JSON — nothing else (no description, no attendees, no
 *     other days).
 *   - `type=config`: reads the Muddy Master List spreadsheet (people, kids,
 *     flags, items, household tasks, calendar rules) and returns it as JSON
 *     in the shape Muddy's config.js expects.
 * Muddy's own matching logic (in app.js) decides what calendar events mean
 * and how to render the item list; this script's only job is handing over
 * raw data.
 *
 * Responses are served as JSONP (?callback=name wraps the JSON in a
 * function call) rather than plain JSON, because Apps Script Web Apps don't
 * send the Access-Control-Allow-Origin header a cross-origin fetch() needs —
 * the browser blocks reading the response even though the request succeeds.
 * Script tags aren't subject to CORS, so Muddy loads this via a <script> tag
 * instead (see jsonpFetch in app.js). If no callback param is given, it
 * falls back to plain JSON — handy for testing the URL directly in a
 * browser or with curl.
 *
 * Setup:
 *   1. https://script.google.com/ → New project → paste this whole file in,
 *      replacing the default Code.gs content.
 *   2. Change SHARED_KEY below to a random string of your choosing — this
 *      is a lightweight guard so the URL isn't wide open to anyone who
 *      finds it, not real auth. Treat the URL+key like a shared secret.
 *   3. Set SHEET_ID below to your "Muddy Master List" spreadsheet's ID —
 *      the long string in its URL: docs.google.com/spreadsheets/d/THIS_PART/edit
 *   4. (Optional) Add more calendar IDs to CALENDAR_IDS — e.g. Michael's,
 *      if he's shared it with your Google account, or a shared "Family"
 *      calendar. Find a calendar's ID in Google Calendar → calendar
 *      settings → "Integrate calendar" → Calendar ID. Leave "primary" in
 *      the list to keep including your own main calendar.
 *   5. Deploy → New deployment → type: Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *      Deploy, and authorize it when prompted — you'll now also see a
 *      Google Sheets permission request alongside Calendar, since this
 *      version also reads the spreadsheet.
 *   6. Copy the Web app URL it gives you, then in Muddy's config.js set:
 *        calendarSync: { enabled: true, url: "PASTE_URL_HERE?key=YOUR_SHARED_KEY" }
 *   7. Reload Muddy. The date label should show "📅 Synced with calendar",
 *      and the item lists should match whatever's in the spreadsheet.
 *
 * If you ever change something in this file, you have to create a new
 * deployment (or "Manage deployments" → edit → new version) for the
 * change to actually go live — same as the park site's Apps Script.
 * Editing the spreadsheet itself needs no redeploy — Muddy re-fetches it
 * on every load.
 */

const SHARED_KEY = "mud-7f2a91-doorway";
const CALENDAR_IDS = ["primary"];
const SHEET_ID = "1KkeX27tK-mnDoiDLb6PgW7ciH1e5aOXA";

function doGet(e) {
  const callback = safeCallbackName(e && e.parameter.callback);

  if (!e || e.parameter.key !== SHARED_KEY) {
    return output({ error: "unauthorized" }, callback);
  }

  if (e.parameter.type === "config") {
    return output(getConfig(), callback);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const tomorrowStart = todayEnd;
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  return output(
    {
      date: Utilities.formatDate(todayStart, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      events: eventsBetween(todayStart, todayEnd),
      tomorrowDate: Utilities.formatDate(tomorrowStart, Session.getScriptTimeZone(), "yyyy-MM-dd"),
      tomorrowEvents: eventsBetween(tomorrowStart, tomorrowEnd),
    },
    callback
  );
}

function eventsBetween(start, end) {
  const events = [];
  CALENDAR_IDS.forEach((id) => {
    const cal = id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;
    cal.getEvents(start, end).forEach((ev) => {
      events.push({
        title: ev.getTitle(),
        location: ev.getLocation() || "",
      });
    });
  });
  return events;
}

// Only allow the charset a valid JS identifier can use — this gets echoed
// straight back into a script response, so it must never be able to break
// out of the function-call wrapper.
function safeCallbackName(name) {
  return name && /^[A-Za-z0-9_$]+$/.test(name) ? name : null;
}

// The Items tab has one row per physical item with a checkbox column per
// person instead of a single "person" column — an item three people need
// (e.g. Swimsuit) is one row with three boxes checked, rather than three
// separate rows. This expands each checked box into its own item object,
// so on the board it's still an independent, independently-checkable row
// per person, exactly as if it had been typed as separate rows. "Both
// kids" is its own column (not just Louie+Dottie both checked) — it's for
// one shared task (packed/checked once for both), as opposed to Louie and
// Dottie individually, which are each checked off separately.
const ITEM_PERSON_COLUMNS = [
  { header: "Lauren", person: "lauren" },
  { header: "Michael", person: "michael" },
  { header: "Both kids", person: "kids" },
  { header: "Louie", person: "louie" },
  { header: "Dottie", person: "dottie" },
];

function isChecked(value) {
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

function getConfig() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  const items = [];
  readSheet(ss, "Items").forEach((row) => {
    const freq = String(row.frequency || "daily").trim();
    const frequency =
      freq.toLowerCase() === "daily"
        ? "daily"
        : { days: freq.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) };
    const base = {
      // No id — Muddy derives a stable one from person+label on its own.
      label: row.label,
      icon: row.icon,
      frequency: frequency,
      condition: row.condition || "",
      weather: row.weather || "",
      callout: row.callout === true || String(row.callout).trim().toUpperCase() === "TRUE",
    };
    ITEM_PERSON_COLUMNS.forEach(({ header, person }) => {
      if (isChecked(row[header])) {
        items.push(Object.assign({ person: person }, base));
      }
    });
  });

  const calendarRules = readSheet(ss, "CalendarRules").map((row) => ({
    id: row.id,
    label: row.label,
    match: {
      titleContains: String(row.titleContains || "").split(",").map((s) => s.trim()).filter(Boolean),
      locationContains: row.locationContains || "",
    },
    activatesFlag: row.activatesFlag,
  }));

  return {
    people: readSheet(ss, "People"),
    kids: readSheet(ss, "Kids"),
    flags: readSheet(ss, "Flags"),
    items: items,
    householdTasks: readSheet(ss, "HouseholdTasks"),
    calendarRules: calendarRules,
  };
}

// Reads a tab into an array of {header: value} objects, using row 1 as
// headers. Skips fully-blank rows.
function readSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  return values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = typeof row[i] === "string" ? row[i].trim() : row[i];
      });
      return obj;
    });
}

function output(obj, callback) {
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(obj)})`).setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
