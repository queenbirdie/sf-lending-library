# Admin dashboard — Apps Script setup

The admin dashboard at sflendinglibrary.org/admin/ needs this code in your
Apps Script backend. If you already did the first version of this setup,
this is an **update** — see the "Update, 2026-07-13" section below; you
don't need to redo Step 1/2 from scratch, just replace `Admin.gs`.

There's also a small **separate** change below ("Retire the KG Avail /
KG Out helper tabs") that touches `Code.js` directly rather than
`Admin.gs` — do that one too while you're in the editor.

## Retire the KG Avail / KG Out helper tabs

Now that the admin dashboard covers "what's upcoming" and "what's
checked out," those 8 auto-generated tabs (`KG Avail`, `KG Out`,
`PS Avail`, `PS Out`, `KC Avail`, `KC Out`, `PG Avail`, `PG Out`) are
redundant. Nothing reads from them — not the live site, not the admin
dashboard, not the email/calendar-invite logic — so they're safe to
delete. But your existing code auto-*recreates* them whenever you edit
Inventory, or a reservation's status changes to Returned, Cancelled,
Lent Out, or "Added to existing request." To stop that:

1. Open **`Code.js`**, find the `onSheetEdit` function. It currently
   looks like this:

```javascript
function onSheetEdit(e) {
  var sheetName = e.range.getSheet().getName();
  if (sheetName === INV_TAB) {
    var row = e.range.getRow();
    if (row > 1) {
      var libraryKey = String(e.range.getSheet().getRange(row, COL_LIBRARY + 1).getValue()).trim();
      if (libraryKey) { buildAvailabilityCalendar(libraryKey); buildCurrentlyOut(libraryKey); }
      else { LIBRARIES.forEach(function(lib) { buildAvailabilityCalendar(lib.key); buildCurrentlyOut(lib.key); }); }
    }
  } else if (sheetName === RSVP_TAB && e.range.getColumn() === RSVP_STATUS_COL) {
    var libKey = String(e.range.getSheet().getRange(e.range.getRow(), RSVP_LIBRARY_COL).getValue()).trim();
    var newStatus = String(e.value || '').trim();
    // Send email + calendar invites first — before any slow rebuilds that could time out
    if (newStatus && newStatus !== 'Pending') { maybeSendCombinedConfirmation(e.range.getRow()); }
    // Only rebuild availability when dates actually free up (Returned/Cancelled)
    // Confirmed and Lent Out don't change availability — Pending already blocks those dates
    if (newStatus === 'Returned' || newStatus === 'Cancelled') {
      if (libKey) { buildAvailabilityCalendar(libKey); buildCurrentlyOut(libKey); }
    } else {
      // Still update Currently Out for Lent Out status
      if ((newStatus === 'Lent Out' || newStatus === 'Added to existing request') && libKey) { buildCurrentlyOut(libKey); }
    }
    clearAvailabilityCache(libKey || null);
    colorizeReservations();
  }
}
```

2. Replace the whole function with this trimmed version — it keeps
   everything that actually matters (confirmation emails, calendar
   invites, cache-clearing so the live site updates instantly, and
   the reservations sheet recoloring) and just drops the tab rebuilds:

```javascript
function onSheetEdit(e) {
  var sheetName = e.range.getSheet().getName();
  if (sheetName === RSVP_TAB && e.range.getColumn() === RSVP_STATUS_COL) {
    var libKey = String(e.range.getSheet().getRange(e.range.getRow(), RSVP_LIBRARY_COL).getValue()).trim();
    var newStatus = String(e.value || '').trim();
    if (newStatus && newStatus !== 'Pending') { maybeSendCombinedConfirmation(e.range.getRow()); }
    clearAvailabilityCache(libKey || null);
    colorizeReservations();
  }
}
```

3. **Deploy → Manage deployments → pencil icon → New version → Deploy**
   (bundle this with the Admin.gs update below — one deploy covers both).
4. In the actual Google Sheet, right-click each of the 8 tabs listed
   above and choose **Delete**. They won't come back.

_(Note: `initializeAll()` still references `buildAvailabilityCalendar`/
`buildCurrentlyOut` too, but that function only runs if you manually
trigger it from the Apps Script editor — it's not on any automatic
trigger, so leaving it as-is is harmless. No need to touch it.)_

## Update, 2026-07-13 — do this if you already set up Admin.gs before

New features added: Upcoming Reservations view, Currently Checked Out
view, and a Revise action (edit dates/time/quantity on any reservation).

1. **Before touching anything, open `Admin.gs` and copy your current
   passcode** — the value after `var ADMIN_PASSCODE = '...'` on the first
   real line. You'll need to paste it back in below.
2. Select all the contents of `Admin.gs`, delete it, and paste in the
   **full replacement code** from the "Complete Admin.gs" section below.
3. Change `CHANGE_ME` on the first line back to **your own passcode**
   (the one you copied in step 1 — don't leave it as `CHANGE_ME` or set
   a new one unless you want to change it).
4. Open `Code.js`, find `doPost`, and add **one more line** — see
   "doPost update" below.
5. **Deploy → Manage deployments → pencil icon → New version → Deploy.**
   (Same as before — this step is what actually pushes the change live.)

### doPost update

Your `doPost` should already have `admin` and `adminUpdateStatus`
branches from the first setup. Add `adminReviseReservation` as a third:

```javascript
    } else if (action === 'admin') {
      result = getAdminData(body.passcode);
    } else if (action === 'adminUpdateStatus') {
      result = adminUpdateStatus(body);
    } else if (action === 'adminReviseReservation') {
      result = adminReviseReservation(body);
    } else {
      result = { success: false, message: 'Unknown action.' };
    }
```

(If you're doing this for the first time and don't have the other two
branches yet, see "First-time setup" below instead.)

---

## Complete Admin.gs (paste this whole thing in)

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
  function fmtISO(d) {
    if (!(d instanceof Date)) d = new Date(d);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  function isSameDay(d, ref) {
    var dt = d instanceof Date ? new Date(d) : new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime() === ref.getTime();
  }

  var pending = [], tomorrowPickups = [], tomorrowReturns = [], overdue = [], upcoming = [], checkedOut = [];

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var rowNum = i + 1;
    var status = String(r[15]).trim();
    var entry = {
      row: rowNum,
      status: status,
      library: String(r[0]).trim(),
      name: String(r[2]).trim(),
      email: String(r[3]).trim(),
      phone: String(r[4]).trim(),
      item: String(r[7]).trim(),
      brand: String(r[6] || '').trim(),
      size: String(r[9] || '').trim(),
      qty: (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1,
      pickupDate: fmt(r[10]), pickupDateISO: fmtISO(r[10]), pickupTime: String(r[11] || '').trim(),
      returnDate: fmt(r[12]), returnDateISO: fmtISO(r[12]), returnTime: String(r[13] || '').trim()
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
      var eCheckedOut = {};
      for (var k in entry) eCheckedOut[k] = entry[k];
      checkedOut.push(eCheckedOut);
      if (rd < today) {
        var eOverdue = {};
        for (var k2 in entry) eOverdue[k2] = entry[k2];
        eOverdue.daysLate = Math.round((today - rd) / 86400000);
        overdue.push(eOverdue);
      }
    }
    if (status === 'Confirmed' && r[10]) {
      var pd = r[10] instanceof Date ? new Date(r[10]) : new Date(r[10]);
      pd.setHours(0, 0, 0, 0);
      if (pd >= today) {
        var eUpcoming = {};
        for (var k3 in entry) eUpcoming[k3] = entry[k3];
        upcoming.push(eUpcoming);
      }
    }
  }

  upcoming.sort(function(a, b) { return new Date(a.pickupDateISO) - new Date(b.pickupDateISO); });
  checkedOut.sort(function(a, b) { return new Date(a.returnDateISO) - new Date(b.returnDateISO); });

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

  return {
    pending: pending, tomorrowPickups: tomorrowPickups, tomorrowReturns: tomorrowReturns,
    overdue: overdue, upcoming: upcoming, checkedOut: checkedOut, conflicts: conflicts
  };
}

function adminUpdateStatus(formData) {
  if (!checkAdminPasscode(formData.passcode)) return { success: false, message: 'Invalid passcode.' };
  var row = parseInt(formData.row);
  var newStatus = String(formData.status || '').trim();
  var validStatuses = ['Confirmed', 'Cancelled', 'Lent Out', 'Returned', 'Lost or Damaged'];
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

function adminReviseReservation(formData) {
  if (!checkAdminPasscode(formData.passcode)) return { success: false, message: 'Invalid passcode.' };
  var row = parseInt(formData.row);
  if (!row || row < 2) return { success: false, message: 'Invalid request.' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var data = sheet.getRange(row, 1, 1, 19).getValues()[0];
  var libraryKey = String(data[0]).trim();
  var itemName = String(data[7]).trim();
  var status = String(data[15]).trim();
  var oldPickupDate = data[10];
  var oldReturnDate = data[12];

  var newPickupDateStr = String(formData.pickupDate || '').trim();
  var newPickupTime = String(formData.pickupTime || '').trim();
  var newReturnDateStr = String(formData.returnDate || '').trim();
  var newReturnTime = String(formData.returnTime || '').trim();
  var newQty = parseInt(formData.qty);
  if (isNaN(newQty) || newQty < 1) newQty = 1;

  if (!newPickupDateStr || !newReturnDateStr) return { success: false, message: 'Pickup and return dates are required.' };
  var newPickupDate = parseDateString(newPickupDateStr);
  var newReturnDate = parseDateString(newReturnDateStr);
  if (newReturnDate <= newPickupDate) return { success: false, message: 'Return date must be after pickup date.' };

  // Re-check availability against every OTHER row (excluding this reservation itself)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var invRows = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var allRsvpRows = sheet.getDataRange().getValues().slice(1);
  var otherRows = [];
  for (var i = 0; i < allRsvpRows.length; i++) {
    if (i + 2 === row) continue;
    otherRows.push(allRsvpRows[i]);
  }
  var availStatus = checkAvailability(itemName, newPickupDate, newReturnDate, newQty, libraryKey, invRows, otherRows);
  if (availStatus === '✗ Unavailable') {
    return { success: false, message: 'Not enough availability for the new dates/quantity.' };
  }

  // If calendar invites were already sent (Confirmed/Lent Out/Added to existing request),
  // delete the old ones before writing new dates so stale invites don't linger.
  var hadInvites = (status === 'Confirmed' || status === 'Lent Out' || status === 'Added to existing request');
  if (hadInvites) {
    try {
      var cal = CalendarApp.getDefaultCalendar();
      var lib = getLibrary(libraryKey);
      var firstName = String(data[2]).trim().split(' ')[0];
      var libNameClean = lib.name.replace(/'/g, '');
      if (oldPickupDate) {
        var pStart = new Date(oldPickupDate); pStart.setHours(0, 0, 0, 0);
        var pEnd = new Date(oldPickupDate); pEnd.setHours(23, 59, 59, 999);
        cal.getEvents(pStart, pEnd, { search: firstName + ' <> ' + libNameClean + ' Pickup' }).forEach(function(ev) { ev.deleteEvent(); });
      }
      if (oldReturnDate) {
        var rStart = new Date(oldReturnDate); rStart.setHours(0, 0, 0, 0);
        var rEnd = new Date(oldReturnDate); rEnd.setHours(23, 59, 59, 999);
        cal.getEvents(rStart, rEnd, { search: firstName + ' <> ' + libNameClean + ' Return' }).forEach(function(ev) { ev.deleteEvent(); });
      }
    } catch (e) { Logger.log('Calendar cleanup failed during revise: ' + e.message); }
  }

  // Write the new values
  sheet.getRange(row, 9).setValue(newQty);          // I: Qty Requested
  sheet.getRange(row, 11).setValue(newPickupDate);  // K: Pickup Date
  sheet.getRange(row, 12).setValue(newPickupTime);  // L: Pickup Time
  sheet.getRange(row, 13).setValue(newReturnDate);  // M: Return Date
  sheet.getRange(row, 14).setValue(newReturnTime);  // N: Return Time
  sheet.getRange(row, 15).setValue(availStatus);    // O: Availability Status

  // Recreate calendar invites with the new dates, if they existed before
  if (hadInvites) {
    try {
      var itemObj = { name: itemName, brand: String(data[6] || '').trim(), size: String(data[9] || '').trim(), qty: newQty };
      var newRowData = sheet.getRange(row, 1, 1, 17).getValues()[0];
      sendCalendarInvites(newRowData, [itemObj], libraryKey);
    } catch (e) {
      return { success: true, warning: 'Reservation updated, but calendar invites failed to regenerate: ' + e.message };
    }
  }

  clearAvailabilityCache(libraryKey);
  return { success: true };
}
```

---

## First-time setup (skip if you already did this before)

1. Open the Apps Script editor for **"SF Lending Library — Unified"**.
2. Click **"+"** next to **Files** → **Script** → name it `Admin`.
3. Paste in the complete `Admin.gs` code above, and set your passcode
   on the first line.
4. Open `Code.js`, find `doPost`. It currently looks like:

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

Change it to:

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
    } else if (action === 'adminReviseReservation') {
      result = adminReviseReservation(body);
    } else {
      result = { success: false, message: 'Unknown action.' };
    }
```

5. **Deploy → Manage deployments → pencil icon → New version → Deploy.**

---

## What each section does now

| Section | Shows | Actions |
|---|---|---|
| New requests | Status = Pending | Confirm, Decline, Revise |
| Upcoming reservations | Confirmed, pickup date today or later | Mark Lent Out, Revise, Cancel |
| Tomorrow's pickups | Confirmed, pickup date = tomorrow | Mark Lent Out, Revise, Cancel |
| Tomorrow's returns | Lent Out, return date = tomorrow | Mark Returned, Revise |
| Currently checked out | All Lent Out items, sorted by return date | Mark Returned, Lost/Damaged, Revise |
| Overdue returns | Checked out, return date in the past | Mark Returned, Revise |
| Double-booking conflicts | More booked than in stock | Informational only |

**Revise** opens an inline editor for pickup date/time, return date/time,
and quantity. It re-checks availability against every other booking
before saving, and — if the reservation already had calendar invites
sent — deletes the old invites and creates fresh ones with the new
dates, so the borrower's calendar always matches what's in the Sheet.

**Revise is scoped to dates/time/qty only** — it doesn't let you change
which item, library, or borrower a reservation is for. Those are rare
enough edits that doing them directly in the Sheet stays simplest.

## Known limitation (inherited, not new)

Cancelling or declining a reservation that already had calendar invites
sent does **not** delete those invites — this was already true before
today's changes (the original system never had invite-cleanup-on-cancel
logic). If a borrower cancels after being confirmed, you may want to
manually delete their calendar events. Happy to add automatic cleanup
for this too if it becomes annoying — just ask.
