# Admin dashboard — Apps Script setup (one-time)

The admin dashboard at sflendinglibrary.org/admin/ is already live, but it
needs a small addition to your Apps Script backend before it'll show real
data. Two steps: paste in a new file, then edit one existing function.

## Step 1 — Add a new script file

1. Open the Apps Script editor for **"SF Lending Library — Unified"**
   (script.google.com, or Extensions → Apps Script from the Sheet).
2. Click the **"+"** next to **Files** → **Script**.
3. Name it `Admin` (it'll become `Admin.gs`).
4. Delete the placeholder content and paste in everything below the line.
5. **Change `CHANGE_ME` on the first real line to your own passcode** —
   this is what you'll type into the dashboard's lock screen. Pick
   something easy to type on a phone.

```javascript
// ============================================
// ADMIN DASHBOARD
// ============================================

var ADMIN_PASSCODE = 'CHANGE_ME'; // <-- set your own passcode here

function checkAdminPasscode(passcode) {
  return ADMIN_PASSCODE !== 'CHANGE_ME' && String(passcode || '') === ADMIN_PASSCODE;
}

function getAdminData(passcode) {
  if (!checkAdminPasscode(passcode)) return { error: 'Invalid passcode.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var invRows = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var rows = ss.getSheetByName(RSVP_TAB).getDataRange().getValues();
  var tz = Session.getScriptTimeZone();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  function fmt(d) {
    if (!(d instanceof Date)) d = new Date(d);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'EEE, MMM d');
  }
  function isSameDay(d, ref) {
    var dt = d instanceof Date ? new Date(d) : new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime() === ref.getTime();
  }

  var pending = [], tomorrowPickups = [], tomorrowReturns = [], overdue = [];

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var rowNum = i + 1;
    var status = String(r[15]).trim();
    var entry = {
      row: rowNum,
      library: String(r[0]).trim(),
      name: String(r[2]).trim(),
      email: String(r[3]).trim(),
      phone: String(r[4]).trim(),
      item: String(r[7]).trim(),
      brand: String(r[6] || '').trim(),
      size: String(r[9] || '').trim(),
      qty: (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1,
      pickupDate: fmt(r[10]), pickupTime: String(r[11] || '').trim(),
      returnDate: fmt(r[12]), returnTime: String(r[13] || '').trim()
    };

    if (status === 'Pending') pending.push(entry);

    if ((status === 'Confirmed' || status === 'Added to existing request') && r[10] && isSameDay(r[10], tomorrow)) {
      tomorrowPickups.push(entry);
    }
    if ((status === 'Lent Out' || status === 'Added to existing request') && r[12] && isSameDay(r[12], tomorrow)) {
      tomorrowReturns.push(entry);
    }
    if ((status === 'Lent Out' || status === 'Added to existing request') && r[12]) {
      var rd = r[12] instanceof Date ? new Date(r[12]) : new Date(r[12]);
      rd.setHours(0, 0, 0, 0);
      if (rd < today) {
        var e2 = {};
        for (var k in entry) e2[k] = entry[k];
        e2.daysLate = Math.round((today - rd) / 86400000);
        overdue.push(e2);
      }
    }
  }

  // Double-booking conflicts (same logic as auditForDoubleBookings)
  var ACTIVE = ['Pending', 'Confirmed', 'Lent Out', 'Added to existing request'];
  var active = [];
  for (var j = 1; j < rows.length; j++) {
    if (ACTIVE.indexOf(String(rows[j][15]).trim()) !== -1) active.push({ r: rows[j], rowNum: j + 1 });
  }
  var conflicts = [], seenItems = {};
  active.forEach(function(x) {
    var itemName = String(x.r[7]).trim();
    var libraryKey = String(x.r[0]).trim();
    var itemKey = libraryKey + '|' + itemName;
    if (seenItems[itemKey]) return;
    seenItems[itemKey] = true;
    var totalQty = getItemQty(itemName, libraryKey, invRows);
    var itemRows = active.filter(function(y) {
      return String(y.r[7]).trim() === itemName && String(y.r[0]).trim() === libraryKey;
    });
    var dates = [];
    itemRows.forEach(function(y) {
      var ep = new Date(y.r[10] instanceof Date ? y.r[10] : new Date(y.r[10])); ep.setHours(0, 0, 0, 0);
      var er = new Date(y.r[12] instanceof Date ? y.r[12] : new Date(y.r[12])); er.setHours(0, 0, 0, 0);
      dates.push(ep.getTime()); dates.push(er.getTime());
    });
    dates = dates.filter(function(v, idx, a) { return a.indexOf(v) === idx; }).sort(function(a, b) { return a - b; });
    var maxQty = 0, worstDate = null, worstRows = [];
    dates.forEach(function(ts) {
      var d = new Date(ts);
      var dayRows = itemRows.filter(function(y) {
        var ep = new Date(y.r[10] instanceof Date ? y.r[10] : new Date(y.r[10])); ep.setHours(0, 0, 0, 0);
        var er = new Date(y.r[12] instanceof Date ? y.r[12] : new Date(y.r[12])); er.setHours(0, 0, 0, 0);
        return d >= ep && d <= er;
      });
      var dayQty = dayRows.reduce(function(sum, y) { return sum + ((y.r[8] && !isNaN(parseInt(y.r[8]))) ? parseInt(y.r[8]) : 1); }, 0);
      if (dayQty > maxQty) { maxQty = dayQty; worstDate = d; worstRows = dayRows; }
    });
    if (maxQty > totalQty) {
      conflicts.push({
        item: itemName, library: libraryKey, totalQty: totalQty, bookedQty: maxQty,
        worstDate: worstDate ? fmt(worstDate) : null,
        rows: worstRows.map(function(y) { return { row: y.rowNum, name: String(y.r[2]).trim(), status: String(y.r[15]).trim() }; })
      });
    }
  });

  return { pending: pending, tomorrowPickups: tomorrowPickups, tomorrowReturns: tomorrowReturns, overdue: overdue, conflicts: conflicts };
}

function adminUpdateStatus(formData) {
  if (!checkAdminPasscode(formData.passcode)) return { success: false, message: 'Invalid passcode.' };
  var row = parseInt(formData.row);
  var newStatus = String(formData.status || '').trim();
  var validStatuses = ['Confirmed', 'Cancelled', 'Lent Out', 'Returned'];
  if (!row || row < 2 || validStatuses.indexOf(newStatus) === -1) {
    return { success: false, message: 'Invalid request.' };
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  sheet.getRange(row, RSVP_STATUS_COL).setValue(newStatus);
  if (newStatus === 'Returned') {
    var returnDateCell = sheet.getRange(row, 13).getValue(); // M: Return Date
    var today = new Date(); today.setHours(0, 0, 0, 0);
    sheet.getRange(row, 18).setValue(today); // R: Actual Return Date
    if (returnDateCell) {
      var rd = returnDateCell instanceof Date ? new Date(returnDateCell) : new Date(returnDateCell);
      rd.setHours(0, 0, 0, 0);
      var daysLate = Math.max(0, Math.round((today - rd) / 86400000));
      sheet.getRange(row, 19).setValue(daysLate); // S: # of Days Returned Late
    }
  }
  return { success: true };
}
```

## Step 2 — Wire it into `doPost`

Open **`Code.js`**, find the existing `doPost` function (near the bottom).
It currently looks like this:

```javascript
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    if (action === 'submitReservation') {
      result = submitReservation(body);
    } else if (action === 'sendContactMessage') {
      result = sendContactMessage(body);
    } else {
      result = { success: false, message: 'Unknown action.' };
    }
```

Add two new `else if` branches **before** the final `else`, like this:

```javascript
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    if (action === 'submitReservation') {
      result = submitReservation(body);
    } else if (action === 'sendContactMessage') {
      result = sendContactMessage(body);
    } else if (action === 'admin') {
      result = getAdminData(body.passcode);
    } else if (action === 'adminUpdateStatus') {
      result = adminUpdateStatus(body);
    } else {
      result = { success: false, message: 'Unknown action.' };
    }
```

Everything else in `doPost` stays exactly the same.

## Step 3 — Deploy

This is the step people usually forget: pasting code alone doesn't update
the live site.

1. Click **Deploy → Manage deployments**.
2. Click the pencil/edit icon next to your existing deployment.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

That's it — no need to change the URL, "Execute as," or "Who has access"
settings; those stay exactly as they are.

## Test it

Go to https://sflendinglibrary.org/admin/ and enter the passcode you set
in Step 1. If your Sheet currently has no pending/overdue/conflicting
reservations, everything will just show "you're caught up" / "nothing
scheduled" — that's correct, not a bug. To see it in action, you could
temporarily change one reservation's status to "Pending" in the Sheet and
refresh the dashboard.

## What each dashboard section does

| Section | Shows | Action button |
|---|---|---|
| New requests | Status = Pending | Confirm / Decline |
| Tomorrow's pickups | Confirmed, pickup date = tomorrow | Mark Lent Out |
| Tomorrow's returns | Lent Out, return date = tomorrow | Mark Returned |
| Overdue returns | Lent Out, return date < today | Mark Returned |
| Double-booking conflicts | More booked than you have in stock | (informational only — resolve manually in the Sheet) |

Marking something "Returned" also auto-fills the **Actual Return Date**
and **# of Days Returned Late** columns in the Sheet, so you don't have
to enter those by hand afterward.

## A note on the passcode's security level

This is intentionally simple, matching what you asked for: a single
shared passcode, not a real login system. It keeps the dashboard off
Google search results and away from casual visitors, but it's not
airtight — anyone who has both the URL and the passcode can see borrower
names, emails, and phone numbers. Don't share the passcode outside your
household, and if you ever suspect it's leaked, just change
`ADMIN_PASSCODE` in Admin.gs and redeploy (Step 3) to invalidate it
immediately.
