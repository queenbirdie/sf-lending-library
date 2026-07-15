# Restore Admin.gs

Use this to make sure `Admin.gs` has the complete, correct code — same
idea as `CODE_GS_RESTORE.md`, but for the admin file.

**Before you paste over it: open `Admin.gs` and check the first real
line** — `var ADMIN_PASSCODE = '...'`. Copy whatever passcode is
currently there (if any) so you can put it back in step 3 below. If it
already says `CHANGE_ME` or the file looks empty/broken, you don't need
to preserve anything — just pick a new passcode.

1. Open **Admin.gs**, select everything (Cmd+A / Ctrl+A), delete.
2. Paste in the complete code below.
3. Change `CHANGE_ME` on the first line to your passcode (the one you
   copied above, or a new one if there wasn't one to save).
4. Save.
5. Double check `Code.gs`'s `doPost` function has these three branches
   (it should, if you followed `CODE_GS_RESTORE.md` — this is just a
   sanity check, no action needed if they're already there):

```javascript
    } else if (action === 'admin') {
      result = getAdminData(body.passcode);
    } else if (action === 'adminUpdateStatus') {
      result = adminUpdateStatus(body);
    } else if (action === 'adminBatchUpdateStatus') {
      result = adminBatchUpdateStatus(body);
    } else if (action === 'adminReviseReservation') {
      result = adminReviseReservation(body);
```

6. **Deploy → Manage deployments → pencil icon → New version → Deploy.**

---

## Complete Admin.gs

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

  var pending = [], tomorrowPickups = [], tomorrowReturns = [], todayReturns = [], overdue = [], upcoming = [], checkedOut = [];

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var rowNum = i + 1;
    var status = String(r[15]).trim();
    var entry = {
      row: rowNum,
      status: status,
      library: String(r[0]).trim(),
      groupKey: r[1] ? String((r[1] instanceof Date ? r[1] : new Date(r[1])).getTime()) : ('row-' + rowNum),
      name: String(r[2]).trim(),
      email: String(r[3]).trim(),
      phone: String(r[4]).trim(),
      item: String(r[7]).trim(),
      brand: String(r[6] || '').trim(),
      size: String(r[9] || '').trim(),
      qty: (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1,
      availabilityStatus: String(r[14] || '').trim(),
      imageUrl: getItemImageUrl(String(r[7]).trim(), String(r[0]).trim(), invRows),
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
    if ((status === 'Lent Out' || status === 'Added to existing request') && r[12] && isSameDay(r[12], today)) {
      todayReturns.push(entry);
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
    pending: pending, tomorrowPickups: tomorrowPickups, tomorrowReturns: tomorrowReturns, todayReturns: todayReturns,
    overdue: overdue, upcoming: upcoming, checkedOut: checkedOut, conflicts: conflicts
  };
}

function applyReservationStatus(sheet, row, newStatus, today) {
  sheet.getRange(row, RSVP_STATUS_COL).setValue(newStatus);
  if (newStatus === 'Returned') {
    var returnDateCell = sheet.getRange(row, 13).getValue(); // M: Return Date
    sheet.getRange(row, 18).setValue(today); // R: Actual Return Date
    if (returnDateCell) {
      var rd = returnDateCell instanceof Date ? new Date(returnDateCell) : new Date(returnDateCell);
      rd.setHours(0, 0, 0, 0);
      var daysLate = Math.max(0, Math.round((today - rd) / 86400000));
      sheet.getRange(row, 19).setValue(daysLate); // S: # of Days Returned Late
    }
  }
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
  var today = new Date(); today.setHours(0, 0, 0, 0);
  applyReservationStatus(sheet, row, newStatus, today);
  return { success: true };
}

function adminBatchUpdateStatus(formData) {
  if (!checkAdminPasscode(formData.passcode)) return { success: false, message: 'Invalid passcode.' };
  var newStatus = String(formData.status || '').trim();
  var validStatuses = ['Confirmed', 'Cancelled', 'Lent Out', 'Returned', 'Lost or Damaged'];
  var rows = (Array.isArray(formData.rows) ? formData.rows : []).map(function(r) { return parseInt(r); }).filter(function(r) { return r && r >= 2; });
  if (!rows.length || validStatuses.indexOf(newStatus) === -1) {
    return { success: false, message: 'Invalid request.' };
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var today = new Date(); today.setHours(0, 0, 0, 0);
  rows.forEach(function(row) { applyReservationStatus(sheet, row, newStatus, today); });
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
