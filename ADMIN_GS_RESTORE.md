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

  var pending = [], tomorrowPickups = [], tomorrowReturns = [], todayReturns = [], overdue = [], overduePickups = [], upcoming = [], checkedOut = [], pastReservations = [];
  var PAST_STATUSES = ['Returned', 'Cancelled', 'Lost or Damaged'];
  var ARCHIVE_TAB = 'reservations archive';

  function collectPastFromSheet(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var sheetRows = sheet.getDataRange().getValues();
    var out = [];
    for (var i = 1; i < sheetRows.length; i++) {
      var r = sheetRows[i];
      var rowNum = i + 1;
      var status = String(r[15]).trim();
      if (PAST_STATUSES.indexOf(status) === -1) continue;
      var itemIdP = String(r[5] || '').trim();
      out.push({
        row: rowNum,
        status: status,
        library: String(r[0]).trim(),
        groupKey: r[1] ? String((r[1] instanceof Date ? r[1] : new Date(r[1])).getTime()) : (sheetName + '-row-' + rowNum),
        sortKey: r[1] ? (r[1] instanceof Date ? r[1].getTime() : new Date(r[1]).getTime()) : 0,
        name: String(r[2]).trim(),
        email: String(r[3]).trim(),
        phone: String(r[4]).trim(),
        item: String(r[7]).trim(),
        brand: String(r[6] || '').trim(),
        size: String(r[9] || '').trim(),
        qty: (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1,
        availabilityStatus: String(r[14] || '').trim(),
        imageUrl: getItemImageUrl(itemIdP, String(r[7]).trim(), String(r[0]).trim(), invRows),
        pickupDate: fmt(r[10]), pickupDateISO: fmtISO(r[10]), pickupTime: String(r[11] || '').trim(),
        returnDate: fmt(r[12]), returnDateISO: fmtISO(r[12]), returnTime: String(r[13] || '').trim()
      });
    }
    return out;
  }

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var rowNum = i + 1;
    var status = String(r[15]).trim();
    var itemId = String(r[5] || '').trim();
    var entry = {
      row: rowNum,
      status: status,
      library: String(r[0]).trim(),
      groupKey: r[1] ? String((r[1] instanceof Date ? r[1] : new Date(r[1])).getTime()) : ('row-' + rowNum),
      sortKey: r[1] ? (r[1] instanceof Date ? r[1].getTime() : new Date(r[1]).getTime()) : 0,
      name: String(r[2]).trim(),
      email: String(r[3]).trim(),
      phone: String(r[4]).trim(),
      item: String(r[7]).trim(),
      brand: String(r[6] || '').trim(),
      size: String(r[9] || '').trim(),
      qty: (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1,
      availabilityStatus: String(r[14] || '').trim(),
      imageUrl: getItemImageUrl(itemId, String(r[7]).trim(), String(r[0]).trim(), invRows),
      pickupDate: fmt(r[10]), pickupDateISO: fmtISO(r[10]), pickupTime: String(r[11] || '').trim(),
      returnDate: fmt(r[12]), returnDateISO: fmtISO(r[12]), returnTime: String(r[13] || '').trim()
    };

    if (status === 'Pending') pending.push(entry);
    if (PAST_STATUSES.indexOf(status) !== -1) pastReservations.push(entry);

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
      } else {
        // Pickup date has passed but status was never flipped to "Lent
        // Out" — without this bucket these rows match none of the
        // sections above (not pending, not upcoming, not checked-out/
        // overdue since those only look at Lent Out, not past) and are
        // silently invisible on the dashboard. Mirrors nightlyAudit()'s
        // overduePickups check in Code.js — the two are meant to stay in
        // sync.
        var eOverduePickup = {};
        for (var k4 in entry) eOverduePickup[k4] = entry[k4];
        eOverduePickup.daysLate = Math.round((today - pd) / 86400000);
        overduePickups.push(eOverduePickup);
      }
    }
  }

  upcoming.sort(function(a, b) { return new Date(a.pickupDateISO) - new Date(b.pickupDateISO); });
  overduePickups.sort(function(a, b) { return new Date(a.pickupDateISO) - new Date(b.pickupDateISO); });
  checkedOut.sort(function(a, b) { return new Date(a.returnDateISO) - new Date(b.returnDateISO); });
  pastReservations = pastReservations.concat(collectPastFromSheet(ARCHIVE_TAB));
  pastReservations.sort(function(a, b) { return b.sortKey - a.sortKey; });
  pastReservations = pastReservations.slice(0, 150);

  // Double-booking conflicts (same logic as auditForDoubleBookings)
  var ACTIVE = ['Pending', 'Confirmed', 'Lent Out', 'Added to existing request'];
  var active = [];
  for (var j = 1; j < rows.length; j++) {
    if (ACTIVE.indexOf(String(rows[j][15]).trim()) !== -1) active.push({ r: rows[j], rowNum: j + 1 });
  }
  var conflicts = [], seenItems = {};
  active.forEach(function(x) {
    var itemName = String(x.r[7]).trim();
    var xItemId = String(x.r[5] || '').trim();
    var rowLibraryKey = String(x.r[0]).trim();
    var itemLibs = getItemLibraries(xItemId, itemName, rowLibraryKey, invRows);
    // Group/match by Item ID when available — same ID-first-with-name-fallback
    // rule used everywhere else (findInventoryRow, checkAvailability,
    // auditForDoubleBookings), so a renamed item's rows still group together
    // and two different items that happen to share a name aren't merged.
    var itemKey = itemLibs.slice().sort().join(',') + '|' + (xItemId || itemName);
    if (seenItems[itemKey]) return;
    seenItems[itemKey] = true;
    var totalQty = getItemQty(xItemId, itemName, rowLibraryKey, invRows);
    var itemRows = active.filter(function(y) {
      var yItemId = String(y.r[5] || '').trim();
      var sameItem = (xItemId && yItemId) ? (yItemId === xItemId) : (String(y.r[7]).trim() === itemName);
      return sameItem && itemLibs.indexOf(String(y.r[0]).trim()) !== -1;
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
        item: itemName, library: itemLibs.join(' + '), totalQty: totalQty, bookedQty: maxQty,
        worstDate: worstDate ? fmt(worstDate) : null,
        rows: worstRows.map(function(y) { return { row: y.rowNum, name: String(y.r[2]).trim(), status: String(y.r[15]).trim() }; })
      });
    }
  });

  return {
    pending: pending, tomorrowPickups: tomorrowPickups, tomorrowReturns: tomorrowReturns, todayReturns: todayReturns,
    overdue: overdue, overduePickups: overduePickups, upcoming: upcoming, checkedOut: checkedOut, conflicts: conflicts, pastReservations: pastReservations
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

// Revises one reservation row (single-item revise, formData.row) or several
// at once (multi-item group revise, formData.rows: [{row, qty}, ...] — all
// sharing the same new pickup/return date+time from one group-revise form).
// Batching the group case into one call — rather than the frontend looping
// one adminReviseReservation call per row — matters because calendar invites
// are combined across a whole reservation: validate/write every row first,
// then delete the old combined invite and recreate exactly one new combined
// invite from the full, post-revise item list. Doing this per row instead
// (as the old code did) deleted+recreated the invite once per item, leaving
// one separate calendar invite per item rather than a single combined one.
function adminReviseReservation(formData) {
  if (!checkAdminPasscode(formData.passcode)) return { success: false, message: 'Invalid passcode.' };

  var rowsInput = Array.isArray(formData.rows) ? formData.rows : [{ row: formData.row, qty: formData.qty }];
  var entries = rowsInput.map(function(r) { return { row: parseInt(r.row), qty: parseInt(r.qty) }; });
  if (!entries.length || entries.some(function(e) { return !e.row || e.row < 2; })) {
    return { success: false, message: 'Invalid request.' };
  }

  var newPickupDateStr = String(formData.pickupDate || '').trim();
  var newPickupTime = String(formData.pickupTime || '').trim();
  var newReturnDateStr = String(formData.returnDate || '').trim();
  var newReturnTime = String(formData.returnTime || '').trim();
  if (!newPickupDateStr || !newReturnDateStr) return { success: false, message: 'Pickup and return dates are required.' };
  var newPickupDate = parseDateString(newPickupDateStr);
  var newReturnDate = parseDateString(newReturnDateStr);
  if (newReturnDate <= newPickupDate) return { success: false, message: 'Return date must be after pickup date.' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var invRows = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var allRsvpRows = sheet.getDataRange().getValues().slice(1);
  var tz = Session.getScriptTimeZone();

  // A single row (the per-item revise form, formData.row) might actually be
  // part of a multi-item reservation. A reservation always has one shared
  // pickup/return date+time and one combined calendar invite, so revising
  // just this row's dates without its siblings would silently orphan them
  // from both the sheet's date columns and the invite (the invite would get
  // recreated with only this one item). Auto-discover siblings the same way
  // maybeSendCombinedConfirmation() does — same library + email + current
  // pickup/return dates + original submission timestamp — and fold them
  // into the batch, keeping each sibling's own existing qty untouched.
  if (!Array.isArray(formData.rows) && entries.length === 1) {
    var soleRow = entries[0].row;
    var soleData = sheet.getRange(soleRow, 1, 1, 19).getValues()[0];
    var soleEmail = String(soleData[3]).trim();
    var soleLib = String(soleData[0]).trim();
    var solePickupFmt = soleData[10] instanceof Date ? Utilities.formatDate(soleData[10], tz, 'yyyy-MM-dd') : String(soleData[10]);
    var soleReturnFmt = soleData[12] instanceof Date ? Utilities.formatDate(soleData[12], tz, 'yyyy-MM-dd') : String(soleData[12]);
    var soleTsFmt = soleData[1] instanceof Date ? Utilities.formatDate(soleData[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(soleData[1]);
    for (var s = 0; s < allRsvpRows.length; s++) {
      var siblingRowNum = s + 2;
      if (siblingRowNum === soleRow) continue;
      var sr = allRsvpRows[s];
      if (String(sr[0]).trim() !== soleLib || String(sr[3]).trim() !== soleEmail) continue;
      var sPickupFmt = sr[10] instanceof Date ? Utilities.formatDate(sr[10], tz, 'yyyy-MM-dd') : String(sr[10]);
      var sReturnFmt = sr[12] instanceof Date ? Utilities.formatDate(sr[12], tz, 'yyyy-MM-dd') : String(sr[12]);
      var sTsFmt = sr[1] instanceof Date ? Utilities.formatDate(sr[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(sr[1]);
      if (sPickupFmt === solePickupFmt && sReturnFmt === soleReturnFmt && sTsFmt === soleTsFmt) {
        var siblingQty = (sr[8] && !isNaN(parseInt(sr[8]))) ? parseInt(sr[8]) : 1;
        entries.push({ row: siblingRowNum, qty: siblingQty });
      }
    }
  }

  var reviseRowNums = entries.map(function(e) { return e.row; });

  // Validate every row in this batch (against every OTHER row — i.e. every
  // row not part of this same revise batch) before writing anything, so a
  // conflict on any one item aborts the whole revise instead of leaving it
  // partially applied.
  var rowInfos = [];
  for (var k = 0; k < entries.length; k++) {
    var row = entries[k].row;
    var qty = (!isNaN(entries[k].qty) && entries[k].qty >= 1) ? entries[k].qty : 1;
    var data = sheet.getRange(row, 1, 1, 19).getValues()[0];
    var libraryKey = String(data[0]).trim();
    var itemId = String(data[5] || '').trim();
    var itemName = String(data[7]).trim();
    var status = String(data[15]).trim();
    var otherRows = [];
    for (var i = 0; i < allRsvpRows.length; i++) {
      if (reviseRowNums.indexOf(i + 2) !== -1) continue;
      otherRows.push(allRsvpRows[i]);
    }
    var availStatus = checkAvailability(itemId, itemName, newPickupDate, newReturnDate, qty, libraryKey, invRows, otherRows);
    if (availStatus === '✗ Unavailable') {
      return { success: false, message: 'Not enough availability for the new dates/quantity' + (entries.length > 1 ? ' (' + itemName + ')' : '') + '.' };
    }
    rowInfos.push({ row: row, qty: qty, data: data, libraryKey: libraryKey, itemName: itemName, status: status, availStatus: availStatus });
  }

  var libraryKey = rowInfos[0].libraryKey;
  var oldPickupDate = rowInfos[0].data[10];
  var oldReturnDate = rowInfos[0].data[12];
  var firstName = String(rowInfos[0].data[2]).trim().split(' ')[0];
  // If calendar invites were already sent (Confirmed/Lent Out/Added to existing request),
  // delete the old ones before writing new dates so stale invites don't linger.
  var hadInvites = rowInfos.some(function(r) { return r.status === 'Confirmed' || r.status === 'Lent Out' || r.status === 'Added to existing request'; });
  if (hadInvites) {
    try {
      // Check both calendars — the old invite lives on LIBRARY_CALENDAR_ID
      // if it was created after that calendar was introduced, or still on
      // the personal default calendar if this reservation predates it.
      var cals = [CalendarApp.getCalendarById(LIBRARY_CALENDAR_ID), CalendarApp.getDefaultCalendar()];
      var lib = getLibrary(libraryKey);
      var libNameClean = lib.name.replace(/'/g, '');
      if (oldPickupDate) {
        var pStart = new Date(oldPickupDate); pStart.setHours(0, 0, 0, 0);
        var pEnd = new Date(oldPickupDate); pEnd.setHours(23, 59, 59, 999);
        cals.forEach(function(cal) { cal.getEvents(pStart, pEnd, { search: firstName + ' <> ' + libNameClean + ' Pickup' }).forEach(function(ev) { ev.deleteEvent(); }); });
      }
      if (oldReturnDate) {
        var rStart = new Date(oldReturnDate); rStart.setHours(0, 0, 0, 0);
        var rEnd = new Date(oldReturnDate); rEnd.setHours(23, 59, 59, 999);
        cals.forEach(function(cal) { cal.getEvents(rStart, rEnd, { search: firstName + ' <> ' + libNameClean + ' Return' }).forEach(function(ev) { ev.deleteEvent(); }); });
      }
    } catch (e) { Logger.log('Calendar cleanup failed during revise: ' + e.message); }
  }

  // Write the new values for every row in this batch.
  rowInfos.forEach(function(r) {
    sheet.getRange(r.row, 9).setValue(r.qty);            // I: Qty Requested
    sheet.getRange(r.row, 11).setValue(newPickupDate);   // K: Pickup Date
    sheet.getRange(r.row, 12).setValue(newPickupTime);   // L: Pickup Time
    sheet.getRange(r.row, 13).setValue(newReturnDate);   // M: Return Date
    sheet.getRange(r.row, 14).setValue(newReturnTime);   // N: Return Time
    sheet.getRange(r.row, 15).setValue(r.availStatus);   // O: Availability Status
  });

  // Recreate exactly one combined calendar invite covering every item in
  // this batch, if invites existed before.
  if (hadInvites) {
    try {
      var items = rowInfos.map(function(r) {
        return { name: r.itemName, brand: String(r.data[6] || '').trim(), size: String(r.data[9] || '').trim(), qty: r.qty };
      });
      var newRowData = sheet.getRange(rowInfos[0].row, 1, 1, 17).getValues()[0];
      sendCalendarInvites(newRowData, items, libraryKey);
      // sendPendingInvites() (a periodic catch-all trigger) and
      // maybeSendCombinedConfirmation() dedup on a key that includes the
      // pickup/return dates themselves — changing those dates here means
      // that catch-all would otherwise see a brand new, never-marked key
      // on its next run and send a second, duplicate invite on top of the
      // one just sent above. Mark the new key as already sent so it skips.
      var email = String(rowInfos[0].data[3]).trim();
      var tsFmt = rowInfos[0].data[1] instanceof Date ? Utilities.formatDate(rowInfos[0].data[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(rowInfos[0].data[1]);
      var newPickupFmt = Utilities.formatDate(newPickupDate, tz, 'yyyy-MM-dd');
      var newReturnFmt = Utilities.formatDate(newReturnDate, tz, 'yyyy-MM-dd');
      var sentKey = 'sent_' + libraryKey + '_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + newPickupFmt + '_' + newReturnFmt + '_' + tsFmt.replace(/[^0-9]/g, '');
      PropertiesService.getScriptProperties().setProperty(sentKey, 'true');
    } catch (e) {
      return { success: true, warning: 'Reservation updated, but calendar invites failed to regenerate: ' + e.message };
    }
  }

  clearAvailabilityCache(libraryKey);
  return { success: true };
}
```
