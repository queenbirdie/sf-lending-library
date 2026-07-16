# Restore Code.gs

If `Admin.gs`'s content got pasted into `Code.gs` by mistake, use this to
fix it. This is the **complete, correct contents of `Code.gs`** — select
everything currently in `Code.gs`, delete it, and paste this in instead.

This already includes the `onSheetEdit` trim (removing the `KG Avail`/
`KG Out` tab rebuilds) from the other doc, so you don't need to make that
edit separately — it's baked into the version below.

After pasting: **Deploy → Manage deployments → pencil icon → New
version → Deploy.**

```javascript
// ==========================================
// SF LENDING LIBRARY — Google Apps Script
// v2.0 Unified — April 2026
// ==========================================

// ── Tabs ─────────────────────────────────
const INV_TAB             = 'inventory';
const RSVP_TAB            = 'reservations';
const FAQ_TAB              = 'faq';
const BLACKOUT_TAB        = 'Blackout Dates';
const BOOKING_WINDOW_DAYS = 90;
const CALENDAR_DAYS       = 60;
const IMAGES_FOLDER_ID    = '1Zxh_fjMqklzbudaovuHsgPxZx5TK7sCE'; // root (fallback)

// ── Libraries ────────────────────────────
const LIBRARIES = [
  { key: 'kid-gear',  tabAbbr: 'KG', shortName: 'Kid & Travel Gear', name: 'Kid & Travel Gear Lending Library',    address: '2722 Folsom St, San Francisco, CA 94110, USA', phone: '917-312-2283', imageFolderId: '1ayKDRAZMJdD2cOJDnXVjZa9DGwz0GvOb' },
  { key: 'party',     tabAbbr: 'PS', shortName: 'Party Supplies',    name: 'Party Supplies Lending Library',       address: '2722 Folsom St, San Francisco, CA 94110, USA', phone: '917-312-2283', imageFolderId: '1E8NsGt5WkPcdO1uIovOVZI0LkB06im_4' },
  { key: 'costumes',  tabAbbr: 'KC', shortName: 'Kids\' Costumes',   name: 'Kids\' Costumes Lending Library',      address: '2722 Folsom St, San Francisco, CA 94110, USA', phone: '917-312-2283', imageFolderId: '1UyprtKkcowekEbnRUvVrGH9oYaMKjuOc' },
  { key: 'puzzles',   tabAbbr: 'PG', shortName: 'Puzzles & Games',   name: 'Puzzles & Games Lending Library',      address: '2722 Folsom St, San Francisco, CA 94110, USA', phone: '917-312-2283', imageFolderId: '1--vhQGQEc9WnuKNkPM9YSdrsgd0Pundy' },
  { key: 'yoto',      tabAbbr: 'YT', shortName: 'Yoto',              name: 'Yoto Lending Library',                 address: '2722 Folsom St, San Francisco, CA 94110, USA', phone: '917-312-2283', imageFolderId: '1YquLATJiVLGYCQtDWjpOylH79mC8nBnH' },
];

function getLibrary(key) {
  return LIBRARIES.find(function(l) { return l.key === key; }) || LIBRARIES[0];
}

// ── Inventory columns (0-based) ──────────
const COL_ITEM_ID        = 0;  // A
const COL_LIBRARY        = 1;  // B
const COL_CATEGORY       = 2;  // C
const COL_BRAND          = 3;  // D
const COL_ITEM           = 4;  // E
const COL_SIZE           = 5;  // F
// G = Product Image (formula column, not read by code)
const COL_IMAGE_URL      = 7;  // H
const COL_LINK           = 8;  // I
const COL_CURRENTLY_HAVE = 9;  // J (ACTIVE)
const COL_QTY            = 10; // K

// ── Reservations columns (1-based) ───────
// A=Library, B=Timestamp, C=Name, D=Email, E=Phone, F=Item ID, G=Brand, H=Item Name,
// I=Qty Requested, J=Size, K=Pickup Date, L=Pickup Time, M=Return Date, N=Return Time,
// O=Availability Status, P=Status, Q=Notes,
// R=Actual Return Date, S=# Days Returned Late
const RSVP_ITEM_ID_COL = 6;  // F
const RSVP_BRAND_COL   = 7;  // G
const RSVP_QTY_COL     = 9;  // I (right after Item Name)
const RSVP_SIZE_COL    = 10; // J
const RSVP_STATUS_COL  = 16; // P
const RSVP_LIBRARY_COL = 1;  // A

// ─────────────────────────────────────────

function parseDateString(str) {
  var parts = str.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Cross-listing: an inventory row's Library cell can hold more than one
// library key, comma-separated (e.g. "kid-gear, puzzles"), for a single
// physical item that should show up — and share one availability pool —
// in more than one catalog.
function itemLibraries(rawLibraryField) {
  return String(rawLibraryField || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function libraryMatches(rawLibraryField, libraryKey) {
  return itemLibraries(rawLibraryField).indexOf(libraryKey) !== -1;
}

// Full set of library keys a given item is listed under (its cross-listing
// group), looked up via any one of those keys. Falls back to just the
// key passed in if the item isn't found.
function getItemLibraries(itemName, libraryKey, invRows) {
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM]).trim() === itemName && libraryMatches(invRows[i][COL_LIBRARY], libraryKey)) {
      return itemLibraries(invRows[i][COL_LIBRARY]);
    }
  }
  return [libraryKey];
}

function getItemQty(itemName, libraryKey, invRows) {
  var rows = invRows || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INV_TAB).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][COL_ITEM]).trim() === itemName && libraryMatches(rows[i][COL_LIBRARY], libraryKey)) {
      var q = parseInt(rows[i][COL_QTY]);
      return isNaN(q) || q < 1 ? 1 : q;
    }
  }
  return 1;
}

function getItemId(itemName, libraryKey, invRows) {
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM]).trim() === itemName && libraryMatches(invRows[i][COL_LIBRARY], libraryKey)) {
      return String(invRows[i][COL_ITEM_ID]).trim();
    }
  }
  return '';
}

function getItemBrand(itemName, libraryKey, invRows) {
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM]).trim() === itemName && libraryMatches(invRows[i][COL_LIBRARY], libraryKey)) {
      return String(invRows[i][COL_BRAND] || '').trim();
    }
  }
  return '';
}

function getItemSize(itemName, libraryKey, invRows) {
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM]).trim() === itemName && libraryMatches(invRows[i][COL_LIBRARY], libraryKey)) {
      return String(invRows[i][COL_SIZE] || '').trim();
    }
  }
  return '';
}

function getItemImageUrl(itemName, libraryKey, invRows) {
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM]).trim() === itemName && libraryMatches(invRows[i][COL_LIBRARY], libraryKey)) {
      return normalizeDriveUrl(String(invRows[i][COL_IMAGE_URL] || '').trim());
    }
  }
  return '';
}

function submitReservation(formData) {
  try {
    var libraryKey    = String(formData.libraryKey || '').trim();
    var name          = String(formData.name        || '').trim();
    var email         = String(formData.email       || '').trim();
    var phone         = String(formData.phone       || '').trim();
    var pickupDateStr = String(formData.pickupDate  || '').trim();
    var pickupTime    = String(formData.pickupTime  || '').trim();
    var returnDateStr = String(formData.returnDate  || '').trim();
    var returnTime    = String(formData.returnTime  || '').trim();
    var items         = formData.items || [];
    if (!name)   return { success: false, message: 'Name is required.' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'A valid email address is required.' };
    if (!phone)  return { success: false, message: 'Phone number is required.' };
    if (!pickupDateStr || !returnDateStr) return { success: false, message: 'Pickup and return dates are required.' };
    if (!items.length) return { success: false, message: 'No items selected.' };
    if (!libraryKey || !getLibrary(libraryKey)) return { success: false, message: 'Invalid library.' };
    var pickupDate = parseDateString(pickupDateStr);
    var returnDate = parseDateString(returnDateStr);
    if (returnDate <= pickupDate) return { success: false, message: 'Return date must be after pickup date.' };
    var today = new Date(); today.setHours(0,0,0,0);
    if (pickupDate < today) return { success: false, message: 'Pickup date cannot be in the past.' };
    var maxPickup = new Date(today); maxPickup.setDate(maxPickup.getDate() + BOOKING_WINDOW_DAYS);
    if (pickupDate > maxPickup) return { success: false, message: 'Pickup date must be within ' + BOOKING_WINDOW_DAYS + ' days from today.' };
    var blackoutDates = getBlackoutDates();
    if (isBlackoutDate(pickupDate, blackoutDates)) return { success: false, message: 'Pickup date falls on a blackout date — please choose a different date.' };
    if (isBlackoutDate(returnDate, blackoutDates)) return { success: false, message: 'Return date falls on a blackout date — please choose a different date.' };
    var sheet = getOrCreateReservationsSheet();
    var timestamp = new Date();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var invRows  = ss.getSheetByName(INV_TAB).getDataRange().getValues();
    var rsvpRows = ss.getSheetByName(RSVP_TAB).getDataRange().getValues().slice(1);
    var newRows = [];
    var unavailable = [];
    items.forEach(function(item) {
      var itemName     = typeof item === 'object' ? String(item.name) : String(item);
      var requestedQty = (typeof item === 'object' && item.qty) ? parseInt(item.qty) : 1;
      if (isNaN(requestedQty) || requestedQty < 1) requestedQty = 1;
      var availStatus  = checkAvailability(itemName, pickupDate, returnDate, requestedQty, libraryKey, invRows, rsvpRows);
      if (availStatus === '✗ Unavailable') { unavailable.push(itemName); return; }
      var itemId       = getItemId(itemName, libraryKey, invRows);
      var brand        = getItemBrand(itemName, libraryKey, invRows);
      var size         = getItemSize(itemName, libraryKey, invRows);
      newRows.push([libraryKey, timestamp, name, email, phone, itemId, brand, itemName, requestedQty, size, pickupDate, pickupTime, returnDate, returnTime, availStatus, 'Pending', '']);
    });
    if (unavailable.length) return { success: false, message: 'The following item(s) are not available for your selected dates: ' + unavailable.join(', ') + '. Please choose different dates or remove these items from your cart.' };
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    clearAvailabilityCache(libraryKey);
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Something went wrong: ' + err.message };
  }
}

function colorizeReservations(sheet) {
  var s = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  if (!s) return;
  var lastRow = s.getLastRow();
  if (lastRow < 2) return;
  var numCols  = 19;
  var colorA   = '#ffffff';
  var colorB   = '#f0ebe7';
  var SKIP_STATUSES = ['Returned', 'Cancelled', 'Lost or Damaged'];
  // Read cols B–Q (16 cols): timestamp at [0], status at [14] (col P), qty at [7] (col I)
  var data = s.getRange(2, 2, lastRow - 1, 16).getValues();
  var groupColors = [], groupIdx = 0, prevTs = null;
  for (var i = 0; i < data.length; i++) {
    var ts     = String(data[i][0]);  // col B (timestamp)
    var status = String(data[i][14]).trim(); // col P (status)
    if (SKIP_STATUSES.indexOf(status) !== -1) { groupColors.push(null); continue; }
    if (ts !== prevTs) { groupIdx++; prevTs = ts; }
    groupColors.push(groupIdx % 2 === 1 ? colorA : colorB);
  }
  // Apply row background colors
  for (var i = 0; i < groupColors.length; i++) {
    if (groupColors[i] === null) continue;
    var start = i, color = groupColors[i];
    while (i + 1 < groupColors.length && groupColors[i + 1] === color) i++;
    s.getRange(start + 2, 1, i - start + 1, numCols).setBackground(color);
  }
  // Highlight Qty > 1: orange background + bold on the Qty Requested column (I)
  s.getRange(2, RSVP_QTY_COL, lastRow - 1, 1).setFontWeight('normal');
  for (var i = 0; i < data.length; i++) {
    var qty = parseInt(data[i][7]); // col I (Qty Requested)
    if (!isNaN(qty) && qty > 1 && groupColors[i] !== null) {
      s.getRange(i + 2, RSVP_QTY_COL).setBackground('#F4A98A').setFontWeight('bold');
    }
  }
}

function getOrCreateReservationsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RSVP_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(RSVP_TAB);
    var headers = ['Library','Timestamp','Name','Email','Phone','Item ID','Brand','Item Name','Qty Requested','Size','Pickup Date','Pickup Time','Return Date','Return Time','Availability Status','Status','Notes','Actual Return Date','# of Days Returned Late'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
    fixReservationDropdown(sheet);
  }
  return sheet;
}

function fixReservationDropdown(sheet) {
  var s = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  if (!s) return;
  var maxRows = s.getMaxRows() - 1;
  // Clear validation from any previously used status columns (N=14 and O=15)
  s.getRange(2, 14, maxRows, 2).clearDataValidations();
  // Apply dropdown only to the correct column (O = RSVP_STATUS_COL = 15)
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending','Confirmed','Lent Out','Returned','Cancelled','Lost or Damaged','Added to existing request'], true)
    .setAllowInvalid(false).build();
  s.getRange(2, RSVP_STATUS_COL, maxRows, 1).setDataValidation(rule);
  s.getBandings().forEach(function(b) { b.remove(); });
  colorizeReservations(s);
  Logger.log('Dropdown fixed on col O and coloring applied.');
}

function combineDateAndTime(date, timeStr) {
  var d = new Date(date);
  if (!timeStr) return d;
  if (timeStr instanceof Date) { d.setHours(timeStr.getHours(), timeStr.getMinutes(), 0, 0); return d; }
  var s = String(timeStr).trim();
  var match = s.match(/^(\d+)\s*(am|pm)?\s*-\s*\d+\s*(am|pm)/i);
  if (match) {
    var hours = parseInt(match[1]);
    var period = (match[2] || match[3]).toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    d.setHours(hours, 0, 0, 0); return d;
  }
  return d;
}

function getBlackoutDates() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(BLACKOUT_TAB);
  if (!sheet) return [];
  var today = new Date(); today.setHours(0,0,0,0);
  return sheet.getDataRange().getValues().slice(1)
    .filter(function(r) { return r[0] && r[1]; })
    .map(function(r) { var start = new Date(r[0]); start.setHours(0,0,0,0); var end = new Date(r[1]); end.setHours(0,0,0,0); return { start: start, end: end }; })
    .filter(function(b) { return b.end >= today; });
}

function isBlackoutDate(date, blackoutDates) {
  var d = new Date(date); d.setHours(0,0,0,0);
  return blackoutDates.some(function(b) { return d >= b.start && d <= b.end; });
}

function checkAvailability(item, newPickup, newReturn, requestedQty, libraryKey, invRows, rsvpRows) {
  requestedQty = parseInt(requestedQty) || 1;
  var totalQty = getItemQty(item, libraryKey, invRows);
  var itemLibs = getItemLibraries(item, libraryKey, invRows);
  var rows = rsvpRows || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB).getDataRange().getValues().slice(1);
  var np  = new Date(newPickup); np.setHours(0, 0, 0, 0);
  var nr  = new Date(newReturn); nr.setHours(0, 0, 0, 0);
  var DAY = 86400000;
  var bookedQty = 0;
  var hasTight  = false;
  rows.forEach(function(r) {
    var rowItem    = String(r[7]).trim();
    var rowLibrary = String(r[0]).trim();
    var status     = String(r[15]).trim();
    if (rowItem !== item || itemLibs.indexOf(rowLibrary) === -1 || status === 'Cancelled' || status === 'Returned' || status === 'Lost or Damaged') return;
    var ep  = new Date(r[10]);  ep.setHours(0, 0, 0, 0);
    var er  = new Date(r[12]); er.setHours(0, 0, 0, 0);
    var qty = (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1;
    if (np <= er && nr >= ep) bookedQty += qty;
    if (nr < ep && (ep - nr) / DAY === 1) hasTight = true;
    else if (np > er && (np - er) / DAY === 1) hasTight = true;
  });
  if (bookedQty + requestedQty > totalQty) return '✗ Unavailable';
  if (hasTight) return '⚠ Tight turnaround';
  return '✓ Available';
}

function colLetter(n) {
  var s = '';
  while (n > 0) { s = String.fromCharCode(64 + (n - 1) % 26 + 1) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function buildAvailabilityCalendar(libraryKey) {
  var lib   = getLibrary(libraryKey);
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var inv   = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var items = inv.filter(function(r) {
    return String(r[COL_LIBRARY]).trim() === libraryKey &&
           String(r[COL_CURRENTLY_HAVE]).toUpperCase() === 'Y' &&
           r[COL_ITEM];
  }).map(function(r) {
    return {
      id:    String(r[COL_ITEM_ID] || '').trim(),
      brand: String(r[COL_BRAND]   || '').trim(),
      name:  String(r[COL_ITEM]).trim(),
      size:  String(r[COL_SIZE]    || '').trim()
    };
  }).filter(function(i) { return i.name; });
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dates = [];
  for (var i = 0; i < CALENDAR_DAYS; i++) {
    var d = new Date(today); d.setDate(today.getDate() + i); dates.push(d);
  }
  var tabName = lib.tabAbbr + ' Avail';
  var cal = ss.getSheetByName(tabName);
  if (!cal) cal = ss.insertSheet(tabName);
  else { cal.clearContents(); cal.clearFormats(); }
  var headerRow = ['Item ID', 'Brand', 'Item Name', 'Size'];
  for (var j = 0; j < dates.length; j++) headerRow.push(dates[j]);
  cal.getRange(1, 1, 1, CALENDAR_DAYS + 4).setValues([headerRow]).setFontWeight('bold').setBackground('#e8e8e8');
  cal.getRange(1, 5, 1, CALENDAR_DAYS).setNumberFormat('M/d');
  cal.setFrozenRows(1); cal.setFrozenColumns(4);
  if (!items.length) return;
  cal.getRange(2, 1, items.length, 4).setValues(items.map(function(i) { return [i.id, i.brand, i.name, i.size]; }));
  var formulas = [];
  for (var r = 0; r < items.length; r++) {
    var rowNum = r + 2;
    var rowFormulas = [];
    for (var c = 0; c < dates.length; c++) {
      var col = colLetter(c + 5);
      rowFormulas.push('=IF(SUMPRODUCT((Reservations!$H$2:$H$1000=$C' + rowNum + ')*(Reservations!$A$2:$A$1000="' + libraryKey + '")*(Reservations!$P$2:$P$1000<>"Cancelled")*(Reservations!$P$2:$P$1000<>"Returned")*(Reservations!$K$2:$K$1000<=' + col + '$1)*(Reservations!$M$2:$M$1000>=' + col + '$1)*IF(ISNUMBER(Reservations!$I$2:$I$1000),Reservations!$I$2:$I$1000,1))>=IFERROR(SUMPRODUCT((inventory!$E$2:$E$1000=$C' + rowNum + ')*(inventory!$B$2:$B$1000="' + libraryKey + '")*IF(ISNUMBER(inventory!$K$2:$K$1000),inventory!$K$2:$K$1000,1)),1),"X",IF(AND(' + col + '$1=TODAY(),COUNTIFS(Reservations!$H:$H,$C' + rowNum + ',Reservations!$A:$A,"' + libraryKey + '",Reservations!$P:$P,"<>Cancelled",Reservations!$P:$P,"<>Returned",Reservations!$M:$M,"<"&TODAY())>0),"!",""))');
    }
    formulas.push(rowFormulas);
  }
  cal.getRange(2, 5, items.length, CALENDAR_DAYS).setFormulas(formulas);
  cal.getRange(2, 5, items.length, CALENDAR_DAYS).setHorizontalAlignment('center');
  var dataRange = cal.getRange(2, 5, items.length, CALENDAR_DAYS);
  cal.clearConditionalFormatRules();
  cal.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('X').setBackground('#ea4335').setFontColor('#ffffff').setRanges([dataRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('!').setBackground('#fbbc04').setFontColor('#000000').setRanges([dataRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('').setBackground('#34a853').setFontColor('#34a853').setRanges([dataRange]).build(),
  ]);
  cal.setColumnWidth(1, 80); cal.setColumnWidth(2, 120); cal.setColumnWidth(3, 250); cal.setColumnWidth(4, 100);
  for (var c2 = 5; c2 <= CALENDAR_DAYS + 4; c2++) cal.setColumnWidth(c2, 55);
  Logger.log('Calendar built for ' + lib.shortName + ': ' + items.length + ' items x ' + CALENDAR_DAYS + ' days.');
}

function buildCurrentlyOut(libraryKey) {
  var lib  = getLibrary(libraryKey);
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var rsvp = ss.getSheetByName(RSVP_TAB);
  var tabName = lib.tabAbbr + ' Out';
  var curr = ss.getSheetByName(tabName);
  if (!curr) curr = ss.insertSheet(tabName);
  else { curr.clearContents(); curr.clearFormats(); }
  var headers = ['Item ID','Brand','Item Name','Size','Name','Email','Phone','Pickup Date','Return Date','Status','Days Remaining','Qty'];
  curr.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f3f3f3');
  curr.setFrozenRows(1);
  var today = new Date(); today.setHours(0,0,0,0);
  var activeRows = rsvp.getDataRange().getValues().slice(1).filter(function(r) {
    var s = String(r[15]).trim();
    return (s === 'Lent Out' || s === 'Added to existing request') && String(r[0]).trim() === libraryKey;
  });
  if (!activeRows.length) return;
  var rows = activeRows.map(function(r) {
    var ret = r[12] instanceof Date ? r[12] : new Date(r[12]);  // M: Return Date
    var qty = (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1;   // I: Qty Requested
    return [r[5], r[6], r[7], r[9], r[2], r[3], r[4], r[10], r[12], r[15], Math.ceil((ret - today) / 86400000), qty];
    // Item ID, Brand, Item Name, Size, Name, Email, Phone, Pickup Date, Return Date, Status, Days Remaining, Qty
  }).sort(function(a, b) { return new Date(a[8]) - new Date(b[8]); });
  curr.getRange(2, 1, rows.length, headers.length).setValues(rows);
  curr.getRange(2, 8, rows.length, 2).setNumberFormat('M/d/yyyy');
  curr.setColumnWidth(1, 80); curr.setColumnWidth(2, 120); curr.setColumnWidth(3, 200); curr.setColumnWidth(4, 100); curr.setColumnWidth(5, 150); curr.setColumnWidth(6, 200);
  curr.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground('#ea4335').setFontColor('#ffffff').setRanges([curr.getRange(2, 11, rows.length, 1)]).build()]);
}

function sendReceiptEmail(data, items, libraryKey) {
  var lib       = getLibrary(libraryKey);
  var name      = data[2];
  var email     = data[3];
  var pickupDate = data[10] instanceof Date ? data[10] : new Date(data[10]);
  var pickupTime = data[11];
  var returnDate = data[12] instanceof Date ? data[12] : new Date(data[12]);
  var returnTime = data[13];
  var firstName = String(name).split(' ')[0];
  var fmt      = function(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMMM d, yyyy'); };
  var fmtShort = function(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM d'); };
  var fmtTime  = function(t) { return t || 'TBD'; };
  function itemLabel(i) {
    if (typeof i !== 'object') return String(i);
    var label = i.name;
    var details = [i.brand, i.size].filter(Boolean).join(', ');
    if (details) label += ' (' + details + ')';
    if (i.qty > 1) label += ' x' + i.qty;
    return label;
  }
  var itemList = items.map(function(i) { return '- ' + itemLabel(i); }).join('\n');
  var itemSection = items.length === 1
    ? 'Item: ' + itemLabel(items[0]) + '\n\n'
    : 'Items:\n' + itemList + '\n\n';
  var subject = 'Lending library request received | ' + fmtShort(pickupDate) + ' – ' + fmtShort(returnDate);
  var body =
    'Hi ' + firstName + ',\n\n' +
    'Thanks for your request at the ' + lib.name + '! We\'ve received it and will be in touch shortly.\n\n' +
    itemSection +
    'Requested pickup: ' + fmt(pickupDate) + ' at ' + fmtTime(pickupTime) + '\n' +
    'Requested return: ' + fmt(returnDate) + ' at ' + fmtTime(returnTime) + '\n\n' +
    'Once your reservation is confirmed on our end, you\'ll receive calendar invitations for pickup and return along with the address for the lending library.\n\n' +
    'If you\'re driving, you\'re welcome to park temporarily in front of the house. The tow away signs are ours — just be mindful of street sweeping.\n\n' +
    'In the meantime, check out our FAQs at sflendinglibrary.org for everything you need to know.\n\n' +
    'Questions? Just reply to this email.\n\n' +
    'Thanks,\nLauren';
  GmailApp.sendEmail(email, subject, body, { bcc: Session.getEffectiveUser().getEmail() });
}

function sendPendingReceipts() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var rows  = sheet.getDataRange().getValues().slice(1);
  var tz    = Session.getScriptTimeZone();
  var props = PropertiesService.getScriptProperties();
  var seen  = {};
  rows.forEach(function(r) {
    if (String(r[15]).trim() !== 'Pending') return;
    var email      = String(r[3]).trim();
    var libraryKey = String(r[0]).trim();
    if (!email || !libraryKey) return;
    var pickupDate = r[10] instanceof Date ? r[10] : new Date(r[10]);
    var returnDate = r[12] instanceof Date ? r[12] : new Date(r[12]);
    if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) return;
    var pickupFmt = Utilities.formatDate(pickupDate, tz, 'yyyy-MM-dd');
    var returnFmt = Utilities.formatDate(returnDate, tz, 'yyyy-MM-dd');
    var tsFmt     = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(r[1]);
    var key = 'receipt_' + libraryKey + '_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + pickupFmt + '_' + returnFmt + '_' + tsFmt.replace(/[^0-9]/g, '');
    if (seen[key] || props.getProperty(key)) return;
    seen[key] = true;
    // Gather all items for this submission (same email + library + dates + timestamp)
    var items = rows
      .filter(function(sr) {
        if (String(sr[0]).trim() !== libraryKey || String(sr[3]).trim() !== email) return false;
        var sp  = sr[10] instanceof Date ? Utilities.formatDate(sr[10], tz, 'yyyy-MM-dd') : String(sr[10]);
        var sr2 = sr[12] instanceof Date ? Utilities.formatDate(sr[12], tz, 'yyyy-MM-dd') : String(sr[12]);
        var sts = sr[1]  instanceof Date ? Utilities.formatDate(sr[1],  tz, 'yyyy-MM-dd HH:mm:ss') : String(sr[1]);
        return sp === pickupFmt && sr2 === returnFmt && sts === tsFmt;
      })
      .map(function(sr) {
        var qty = (sr[8] && !isNaN(parseInt(sr[8]))) ? parseInt(sr[8]) : 1;
        return { name: String(sr[7]).trim(), brand: String(sr[6] || '').trim(), size: String(sr[9] || '').trim(), qty: qty };
      });
    try {
      sendReceiptEmail(r, items, libraryKey);
      props.setProperty(key, 'true');
    } catch(e) { Logger.log('Receipt email error for ' + email + ': ' + e.message); }
  });
}

function maybeSendCombinedConfirmation(row) {
  var sheet      = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var data       = sheet.getRange(row, 1, 1, 17).getValues()[0];
  var status     = String(data[15]).trim();  // P
  var email      = String(data[3]).trim();   // D
  var libraryKey = String(data[0]).trim();   // A
  if (!email || !libraryKey) return;
  var tz        = Session.getScriptTimeZone();
  var pickupFmt = data[10] instanceof Date ? Utilities.formatDate(data[10], tz, 'yyyy-MM-dd') : String(data[10]);
  var returnFmt = data[12] instanceof Date ? Utilities.formatDate(data[12], tz, 'yyyy-MM-dd') : String(data[12]);
  var tsFmt     = data[1]  instanceof Date ? Utilities.formatDate(data[1],  tz, 'yyyy-MM-dd HH:mm:ss') : String(data[1]);
  if (!pickupFmt || !returnFmt) return;
  // Find all rows for this submission (same email + library + dates + timestamp)
  var allRows = sheet.getDataRange().getValues();
  var siblingRows = [];
  for (var i = 1; i < allRows.length; i++) {
    if (String(allRows[i][0]).trim() !== libraryKey) continue;
    if (String(allRows[i][3]).trim() !== email) continue;
    var rPickup = allRows[i][10] instanceof Date ? Utilities.formatDate(allRows[i][10], tz, 'yyyy-MM-dd') : String(allRows[i][10]);
    var rReturn = allRows[i][12] instanceof Date ? Utilities.formatDate(allRows[i][12], tz, 'yyyy-MM-dd') : String(allRows[i][12]);
    var rTs     = allRows[i][1]  instanceof Date ? Utilities.formatDate(allRows[i][1],  tz, 'yyyy-MM-dd HH:mm:ss') : String(allRows[i][1]);
    if (rPickup !== pickupFmt || rReturn !== returnFmt || rTs !== tsFmt) continue;
    siblingRows.push(allRows[i]);
  }
  // Wait until every sibling row has been actioned (anything other than Pending)
  var allActioned = siblingRows.every(function(r) { return String(r[15]).trim() !== 'Pending'; });
  if (!allActioned) return;
  // Only send for items that were confirmed
  var confirmedItems = siblingRows
    .filter(function(r) { return String(r[15]).trim() === 'Confirmed'; })
    .map(function(r) {
      var qty = (r[8] && !isNaN(parseInt(r[8]))) ? parseInt(r[8]) : 1;
      return { name: String(r[7]).trim(), brand: String(r[6] || '').trim(), size: String(r[9] || '').trim(), qty: qty };
    });
  if (!confirmedItems.length) return; // everything was cancelled, nothing to send
  // Per-submission dedup (includes timestamp to handle same-person same-dates repeat bookings)
  var sentKey = 'sent_' + libraryKey + '_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + pickupFmt + '_' + returnFmt + '_' + tsFmt.replace(/[^0-9]/g, '');
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty(sentKey)) return;
    props.setProperty(sentKey, 'true');
  } finally { lock.releaseLock(); }
  try {
    sendCalendarInvites(data, confirmedItems, libraryKey);
  } catch(e) {
    PropertiesService.getScriptProperties().deleteProperty(sentKey);
    Logger.log('Calendar invite failed for ' + sentKey + ': ' + e.message);
  }
}

function sendCalendarInvites(data, items, libraryKey) {
  var lib        = getLibrary(libraryKey);
  var name       = data[2];
  var email      = data[3];
  var phone      = data[4];
  var pickupDate = data[10] instanceof Date ? data[10] : new Date(data[10]);
  var pickupTime = data[11];
  var returnDate = data[12] instanceof Date ? data[12] : new Date(data[12]);
  var returnTime = data[13];
  var firstName  = String(name).split(' ')[0];
  function itemLabel(i) {
    if (typeof i !== 'object') return String(i);
    var label = i.name;
    var details = [i.brand, i.size].filter(Boolean).join(', ');
    if (details) label += ' (' + details + ')';
    if (i.qty > 1) label += ' x' + i.qty;
    return label;
  }
  var itemList = items.map(function(i) { return '- ' + itemLabel(i); }).join('\n');
  var pickupStart = combineDateAndTime(pickupDate, pickupTime);
  var pickupEnd   = new Date(pickupStart.getTime() + 60 * 60 * 1000);
  var returnStart = combineDateAndTime(returnDate, returnTime);
  var returnEnd   = new Date(returnStart.getTime() + 60 * 60 * 1000);
  var multiUnit = items.filter(function(i) { return typeof i === 'object' && i.qty > 1; });
  var multiUnitBanner = multiUnit.length
    ? '⚠️ MULTIPLE UNITS: ' + multiUnit.map(function(i) { return i.name + ' x' + i.qty; }).join(', ') + '\n\n'
    : '';
  var tz = Session.getScriptTimeZone();
  var pickupFmt = Utilities.formatDate(new Date(pickupDate), tz, 'EEE, MMM d');
  var returnFmt = Utilities.formatDate(new Date(returnDate), tz, 'EEE, MMM d');
  var pickupDesc =
    multiUnitBanner +
    firstName + ': ' + phone + '\nLauren: ' + lib.phone + '\n\n' +
    firstName + ' picking up:\n' + itemList + '\n\n' +
    'Return date: ' + returnFmt + '\n\n' +
    'PARKING & MISC\n' +
    'Feel free to park temporarily in front of the house — the tow away signs are ours. Check street sweeping times before you arrive (M/W/F 9 - 11am). Lastly, we have a very friendly but barky dog, she\'ll likely say hi!\n\n' +
    'CHECKLIST\n' +
    '☐ Text or WhatsApp Lauren the day before to confirm pickup details\n' +
    '☐ Pick up your items at ' + lib.address.split(',')[0] + '\n' +
    '☐ Text or WhatsApp Lauren once you\'ve picked up (if not in person)\n' +
    '☐ Questions? sflendinglibrary.org';
  var returnDesc =
    multiUnitBanner +
    firstName + ': ' + phone + '\nLauren: ' + lib.phone + '\n\n' +
    'Returning:\n' + itemList + '\n\n' +
    'Pickup date: ' + pickupFmt + '\n\n' +
    'CHECKLIST\n' +
    '☐ Text or WhatsApp Lauren the day before to confirm return details\n' +
    '☐ Return items in the same condition you borrowed them\n' +
    '☐ Text or WhatsApp Lauren once you\'ve returned (if not in person)\n' +
    '☐ Loved it? Consider a donation to keep the library going — Venmo @lrturon\n' +
    '☐ Questions? sflendinglibrary.org';
  Calendar.Events.insert({
    summary: firstName + ' <> ' + lib.name + ' Pickup',
    location: lib.address,
    description: pickupDesc,
    start: { dateTime: pickupStart.toISOString(), timeZone: tz },
    end:   { dateTime: pickupEnd.toISOString(),   timeZone: tz },
    attendees: [{ email: email }],
    transparency: 'transparent',
    colorId: '3'
  }, 'primary', { sendUpdates: 'all' });
  Calendar.Events.insert({
    summary: firstName + ' <> ' + lib.name + ' Return',
    location: lib.address,
    description: returnDesc,
    start: { dateTime: returnStart.toISOString(), timeZone: tz },
    end:   { dateTime: returnEnd.toISOString(),   timeZone: tz },
    attendees: [{ email: email }],
    transparency: 'transparent',
    colorId: '3'
  }, 'primary', { sendUpdates: 'all' });
}

function sendPendingInvites() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var rows  = sheet.getDataRange().getValues().slice(1);
  var tz    = Session.getScriptTimeZone();
  var props = PropertiesService.getScriptProperties();
  var seen  = {};
  rows.forEach(function(r) {
    var status     = String(r[15]).trim();
    var email      = String(r[3]).trim();
    var libraryKey = String(r[0]).trim();
    if (!email || !libraryKey) return;
    if (status === 'Pending' || status === 'Cancelled' || status === 'Returned' || status === 'Lost or Damaged' || status === 'Added to existing request') return;
    var pickupDate = r[10] instanceof Date ? r[10] : new Date(r[10]);
    var returnDate = r[12] instanceof Date ? r[12] : new Date(r[12]);
    if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) return;
    var pickupFmt = Utilities.formatDate(pickupDate, tz, 'yyyy-MM-dd');
    var returnFmt = Utilities.formatDate(returnDate, tz, 'yyyy-MM-dd');
    var tsFmt     = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(r[1]);
    var sentKey   = 'sent_' + libraryKey + '_' + email.replace(/[^a-z0-9]/gi, '_') + '_' + pickupFmt + '_' + returnFmt + '_' + tsFmt.replace(/[^0-9]/g, '');
    if (seen[sentKey] || props.getProperty(sentKey)) return;
    seen[sentKey] = true;
    // Find all sibling rows for this submission
    var siblingRows = rows.filter(function(sr) {
      if (String(sr[0]).trim() !== libraryKey || String(sr[3]).trim() !== email) return false;
      var sp  = sr[10] instanceof Date ? Utilities.formatDate(sr[10], tz, 'yyyy-MM-dd') : String(sr[10]);
      var sr2 = sr[12] instanceof Date ? Utilities.formatDate(sr[12], tz, 'yyyy-MM-dd') : String(sr[12]);
      var sts = sr[1]  instanceof Date ? Utilities.formatDate(sr[1],  tz, 'yyyy-MM-dd HH:mm:ss') : String(sr[1]);
      return sp === pickupFmt && sr2 === returnFmt && sts === tsFmt;
    });
    // Wait until all siblings are actioned
    if (!siblingRows.every(function(sr) { return String(sr[15]).trim() !== 'Pending'; })) return;
    var confirmedItems = siblingRows
      .filter(function(sr) { return String(sr[15]).trim() === 'Confirmed'; })
      .map(function(sr) {
        var qty = (sr[8] && !isNaN(parseInt(sr[8]))) ? parseInt(sr[8]) : 1;
        return { name: String(sr[7]).trim(), brand: String(sr[6] || '').trim(), size: String(sr[9] || '').trim(), qty: qty };
      });
    if (!confirmedItems.length) return;
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      if (props.getProperty(sentKey)) return;
      props.setProperty(sentKey, 'true');
    } finally { lock.releaseLock(); }
    try {
      sendCalendarInvites(r, confirmedItems, libraryKey);
      Logger.log('sendPendingInvites: sent invites for ' + r[2] + ' (' + libraryKey + ' ' + pickupFmt + ')');
    } catch(e) {
      props.deleteProperty(sentKey);
      Logger.log('sendPendingInvites error for ' + email + ': ' + e.message);
    }
  });
}

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

function auditCalendarInvites() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var rows  = sheet.getDataRange().getValues().slice(1);
  var cal   = CalendarApp.getDefaultCalendar();
  var tz    = Session.getScriptTimeZone();
  var missing = [];
  var seen  = {};
  rows.forEach(function(r) {
    var status = String(r[15]).trim(); // P: Status
    if (status !== 'Confirmed' && status !== 'Lent Out' && status !== 'Added to existing request') return;
    var email      = String(r[3]).trim();
    var libraryKey = String(r[0]).trim();
    var pickupDate = r[10] instanceof Date ? r[10] : new Date(r[10]);
    var returnDate = r[12] instanceof Date ? r[12] : new Date(r[12]);
    if (!email || isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) return;
    var pickupFmt = Utilities.formatDate(pickupDate, tz, 'yyyy-MM-dd');
    var returnFmt = Utilities.formatDate(returnDate, tz, 'yyyy-MM-dd');
    var key = email + '_' + libraryKey + '_' + pickupFmt + '_' + returnFmt;
    if (seen[key]) return;
    seen[key] = true;
    var name      = String(r[2]).trim();
    var firstName = name.split(' ')[0];
    var pDayStart = new Date(pickupDate); pDayStart.setHours(0,0,0,0);
    var pDayEnd   = new Date(pickupDate); pDayEnd.setHours(23,59,59,999);
    var rDayStart = new Date(returnDate); rDayStart.setHours(0,0,0,0);
    var rDayEnd   = new Date(returnDate); rDayEnd.setHours(23,59,59,999);
    var lib2 = getLibrary(libraryKey);
    var libNameClean = lib2.name.replace(/'/g, '');
    var pickupEvents = cal.getEvents(pDayStart, pDayEnd, { search: firstName + ' <> ' + libNameClean + ' Pickup' });
    var returnEvents = cal.getEvents(rDayStart, rDayEnd, { search: firstName + ' <> ' + libNameClean + ' Return' });
    if (!pickupEvents.length || !returnEvents.length) {
      var issues = [];
      if (!pickupEvents.length) issues.push('missing pickup invite (' + Utilities.formatDate(pickupDate, tz, 'MMM d') + ')');
      if (!returnEvents.length) issues.push('missing return invite (' + Utilities.formatDate(returnDate, tz, 'MMM d') + ')');
      missing.push(name + ' <' + email + '> — ' + libraryKey + ' — ' + issues.join(', '));
    }
  });
  var me = Session.getEffectiveUser().getEmail();
  if (missing.length) {
    GmailApp.sendEmail(me, 'Lending Library: ' + missing.length + ' reservation(s) missing calendar invites',
      'The following confirmed reservations appear to be missing calendar invites:\n\n' +
      missing.join('\n') + '\n\n' +
      'The sendPendingInvites trigger will retry automatically within 5 minutes. If invites are still missing after 10 minutes, run clearScriptProperties() then run sendPendingInvites() manually.');
  } else {
    GmailApp.sendEmail(me, 'Lending Library: calendar audit complete — all clear',
      'All confirmed and lent-out reservations have calendar invites. No action needed.');
  }
}

function nightlyAudit() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var invRows = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var rows    = ss.getSheetByName(RSVP_TAB).getDataRange().getValues().slice(1);
  var tz      = Session.getScriptTimeZone();

  // --- Double bookings ---
  var ACTIVE  = ['Pending', 'Confirmed', 'Lent Out', 'Added to existing request'];
  var active  = rows.map(function(r, i) { return { r: r, rowNum: i + 2 }; })
                    .filter(function(x) { return ACTIVE.indexOf(String(x.r[15]).trim()) !== -1; });
  var conflicts = [];
  var seenItems = {};
  active.forEach(function(x) {
    var itemName   = String(x.r[7]).trim();
    var libraryKey = String(x.r[0]).trim();
    var itemKey    = libraryKey + '|' + itemName;
    if (seenItems[itemKey]) return;
    seenItems[itemKey] = true;
    var totalQty = getItemQty(itemName, libraryKey, invRows);
    var itemRows = active.filter(function(y) {
      return String(y.r[7]).trim() === itemName && String(y.r[0]).trim() === libraryKey;
    });
    // Collect all boundary dates and check concurrent demand at each
    var dates = [];
    itemRows.forEach(function(y) {
      var ep = new Date(y.r[10] instanceof Date ? y.r[10] : new Date(y.r[10])); ep.setHours(0,0,0,0);
      var er = new Date(y.r[12] instanceof Date ? y.r[12] : new Date(y.r[12])); er.setHours(0,0,0,0);
      dates.push(ep.getTime()); dates.push(er.getTime());
    });
    dates = dates.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort(function(a, b) { return a - b; });
    var maxQty = 0, worstDate = null, worstRows = [];
    dates.forEach(function(ts) {
      var d = new Date(ts);
      var dayRows = itemRows.filter(function(y) {
        var ep = new Date(y.r[10] instanceof Date ? y.r[10] : new Date(y.r[10])); ep.setHours(0,0,0,0);
        var er = new Date(y.r[12] instanceof Date ? y.r[12] : new Date(y.r[12])); er.setHours(0,0,0,0);
        return d >= ep && d <= er;
      });
      var dayQty = dayRows.reduce(function(sum, y) { return sum + ((y.r[8] && !isNaN(parseInt(y.r[8]))) ? parseInt(y.r[8]) : 1); }, 0);
      if (dayQty > maxQty) { maxQty = dayQty; worstDate = d; worstRows = dayRows; }
    });
    if (maxQty > totalQty) {
      conflicts.push({ item: itemName, library: libraryKey, totalQty: totalQty, bookedQty: maxQty, worstDate: worstDate, rows: worstRows });
    }
  });

  // --- Missing calendar invites ---
  var cal     = CalendarApp.getDefaultCalendar();
  var missing = [];
  var seen2   = {};
  rows.forEach(function(r) {
    var status = String(r[15]).trim();
    if (status !== 'Confirmed' && status !== 'Lent Out' && status !== 'Added to existing request') return;
    var email      = String(r[3]).trim();
    var libraryKey = String(r[0]).trim();
    var pickupDate = r[10] instanceof Date ? r[10] : new Date(r[10]);
    var returnDate = r[12] instanceof Date ? r[12] : new Date(r[12]);
    if (!email || isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) return;
    var key = email + '_' + libraryKey + '_' + Utilities.formatDate(pickupDate, tz, 'yyyy-MM-dd') + '_' + Utilities.formatDate(returnDate, tz, 'yyyy-MM-dd');
    if (seen2[key]) return;
    seen2[key] = true;
    var firstName = String(r[2]).trim().split(' ')[0];
    var lib = getLibrary(libraryKey);
    var pDayStart = new Date(pickupDate); pDayStart.setHours(0,0,0,0);
    var pDayEnd   = new Date(pickupDate); pDayEnd.setHours(23,59,59,999);
    var rDayStart = new Date(returnDate); rDayStart.setHours(0,0,0,0);
    var rDayEnd   = new Date(returnDate); rDayEnd.setHours(23,59,59,999);
    var libNameClean = lib.name.replace(/'/g, '');
    var pickupEvents = cal.getEvents(pDayStart, pDayEnd, { search: firstName + ' <> ' + libNameClean + ' Pickup' });
    var returnEvents = cal.getEvents(rDayStart, rDayEnd, { search: firstName + ' <> ' + libNameClean + ' Return' });
    if (!pickupEvents.length || !returnEvents.length) {
      var issues = [];
      if (!pickupEvents.length) issues.push('missing pickup invite (' + Utilities.formatDate(pickupDate, tz, 'MMM d') + ')');
      if (!returnEvents.length) issues.push('missing return invite (' + Utilities.formatDate(returnDate, tz, 'MMM d') + ')');
      missing.push(String(r[2]).trim() + ' <' + email + '> — ' + libraryKey + ' — ' + issues.join(', '));
    }
  });

  // --- Send combined email ---
  var me = Session.getEffectiveUser().getEmail();
  if (!conflicts.length && !missing.length) {
    GmailApp.sendEmail(me, 'Lending Library: nightly audit — all clear',
      'No double bookings. All confirmed reservations have calendar invites. Nothing to action.');
    return;
  }
  var parts = [];
  if (conflicts.length) parts.push(conflicts.length + ' double-booking conflict(s)');
  if (missing.length)   parts.push(missing.length + ' missing calendar invite(s)');
  var body = '';
  if (conflicts.length) {
    body += '=== DOUBLE BOOKINGS ===\n\n';
    conflicts.forEach(function(c) {
      var worstFmt = c.worstDate ? Utilities.formatDate(c.worstDate, tz, 'MMM d') : '?';
      body += c.item + ' [' + c.library + '] — ' + c.totalQty + ' available, ' + c.bookedQty + ' needed on ' + worstFmt + ':\n';
      c.rows.forEach(function(x) {
        var pd = Utilities.formatDate(x.r[10] instanceof Date ? x.r[10] : new Date(x.r[10]), tz, 'MMM d');
        var rd = Utilities.formatDate(x.r[12] instanceof Date ? x.r[12] : new Date(x.r[12]), tz, 'MMM d');
        body += '  • ' + x.r[2] + ' <' + x.r[3] + '> | ' + pd + ' – ' + rd + ' | ' + x.r[15] + ' | Row ' + x.rowNum + '\n';
      });
      body += '\n';
    });
  }
  if (missing.length) {
    if (body) body += '\n';
    body += '=== MISSING CALENDAR INVITES ===\n\n';
    body += missing.join('\n') + '\n\n';
    body += 'The sendPendingInvites trigger retries every 5 min. If still missing after 10 min, run clearScriptProperties() then sendPendingInvites() manually.';
  }
  GmailApp.sendEmail(me, 'Lending Library: nightly audit — ' + parts.join(', '), body);
  Logger.log(body);
}

function dailyScheduleEmail() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var rows = ss.getSheetByName(RSVP_TAB).getDataRange().getValues().slice(1);
  var tz   = Session.getScriptTimeZone();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  var fmtDate = Utilities.formatDate(tomorrow, tz, 'EEEE, MMMM d');
  function isTomorrow(d) {
    var dt = d instanceof Date ? d : new Date(d); dt.setHours(0, 0, 0, 0);
    return dt.getTime() === tomorrow.getTime();
  }
  function itemLine(r) {
    var label = String(r[7]).trim();
    var details = [String(r[6] || '').trim(), String(r[9] || '').trim()].filter(Boolean).join(', ');
    if (details) label += ' (' + details + ')';
    label += ' [' + String(r[0]).trim() + ']';
    return label;
  }
  // Group rows by borrower (email + library + time), expanding qty into individual lines
  function groupByBorrower(entries) {
    var order = [], groups = {};
    entries.forEach(function(e) {
      var key = e.email + '|' + e.library + '|' + e.time;
      if (!groups[key]) { order.push(key); groups[key] = { name: e.name, phone: e.phone, time: e.time, items: [] }; }
      for (var i = 0; i < e.qty; i++) groups[key].items.push(e.line);
    });
    return order.map(function(k) { return groups[k]; });
  }
  var pickupRows = [], returnRows = [];
  rows.forEach(function(r) {
    var status = String(r[15]).trim();
    var qty = parseInt(r[8]); if (isNaN(qty) || qty < 1) qty = 1;
    if (isTomorrow(r[10]) && (status === 'Confirmed' || status === 'Added to existing request')) {
      pickupRows.push({ name: String(r[2]).trim(), email: String(r[3]).trim(), phone: String(r[4]).trim(), time: String(r[11] || '').trim(), library: String(r[0]).trim(), line: itemLine(r), qty: qty });
    }
    if (isTomorrow(r[12]) && (status === 'Lent Out' || status === 'Added to existing request')) {
      returnRows.push({ name: String(r[2]).trim(), email: String(r[3]).trim(), phone: String(r[4]).trim(), time: String(r[13] || '').trim(), library: String(r[0]).trim(), line: itemLine(r), qty: qty });
    }
  });
  function timeToMins(t) {
    var m = String(t || '').match(/^(\d+)\s*(am|pm)?\s*-\s*\d+\s*(am|pm)/i);
    if (!m) return 9999;
    var h = parseInt(m[1]), period = (m[2] || m[3]).toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60;
  }
  var pickups = groupByBorrower(pickupRows).sort(function(a, b) { return timeToMins(a.time) - timeToMins(b.time); });
  var returns = groupByBorrower(returnRows).sort(function(a, b) { return timeToMins(a.time) - timeToMins(b.time); });
  var body = pickups.length || returns.length
    ? 'Here\'s what\'s on for tomorrow (' + fmtDate + '):\n\n'
    : 'Nothing scheduled for tomorrow (' + fmtDate + '). Enjoy the day off!\n';
  if (pickups.length) {
    body += 'PICKUPS — put these out:\n\n';
    pickups.forEach(function(p) {
      if (p.time) body += p.time + '\n';
      body += p.name + ' · ' + p.phone + '\n';
      p.items.forEach(function(line) { body += '  • ' + line + '\n'; });
      body += '\n';
    });
  }
  if (returns.length) {
    body += 'RETURNS:\n\n';
    returns.forEach(function(r) {
      if (r.time) body += r.time + '\n';
      body += r.name + ' · ' + r.phone + '\n';
      r.items.forEach(function(line) { body += '  • ' + line + '\n'; });
      body += '\n';
    });
  }
  var parts = [];
  if (pickups.length) parts.push(pickups.length + ' pickup' + (pickups.length > 1 ? 's' : ''));
  if (returns.length) parts.push(returns.length + ' return' + (returns.length > 1 ? 's' : ''));
  var subject = pickups.length || returns.length
    ? 'Lending Library: tomorrow (' + fmtDate + ') — ' + parts.join(', ')
    : 'Lending Library: tomorrow (' + fmtDate + ') — all clear';
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, body);
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('sendPendingReceipts').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('sendPendingInvites').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('nightlyAudit').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('dailyScheduleEmail').timeBased().everyDays(1).atHour(19).create();
  ScriptApp.newTrigger('setupTriggers').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Triggers installed.');
}

function initializeAll() {
  getOrCreateReservationsSheet();
  LIBRARIES.forEach(function(lib) { buildAvailabilityCalendar(lib.key); buildCurrentlyOut(lib.key); });
  setupTriggers();
  Logger.log('Done - unified library system initialized.');
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Pre-populate all library caches so the first real request is fast
  if (action === 'warmup') {
    try { LIBRARIES.forEach(function(lib) { getAvailabilityData(lib.key); }); getFAQData(); } catch(err) {}
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'availability') {
    var libKey = e.parameter.lib;
    if (!libKey || !getLibrary(libKey)) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid library key.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify(getAvailabilityData(libKey)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'faq') {
    return ContentService.createTextOutput(JSON.stringify(getFAQData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Legacy fallback: serve the HTML page directly from Apps Script
  return HtmlService.createHtmlOutputFromFile('availability')
    .setTitle('SF Lending Library')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

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
    } else if (action === 'adminBatchUpdateStatus') {
      result = adminBatchUpdateStatus(body);
    } else if (action === 'adminReviseReservation') {
      result = adminReviseReservation(body);
    } else {
      result = { success: false, message: 'Unknown action.' };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function normalizeDriveUrl(url) {
  if (!url) return '';
  var s = String(url).trim();
  if (s.indexOf('lh3.googleusercontent.com') !== -1) return s;
  var fileId = null;
  var dIdx = s.indexOf('/d/');
  if (dIdx !== -1) {
    fileId = s.substring(dIdx + 3).split('/')[0].split('?')[0];
  }
  if (!fileId) {
    var idMatch = s.match(/[?&]id=([^&]+)/);
    if (idMatch) fileId = idMatch[1];
  }
  if (fileId) return 'https://lh3.googleusercontent.com/d/' + fileId;
  return s;
}

function clearAvailabilityCache(libraryKey) {
  try {
    var cache = CacheService.getScriptCache();
    if (libraryKey) {
      cache.remove('avail_v2_' + libraryKey);
    } else {
      LIBRARIES.forEach(function(lib) { cache.remove('avail_v2_' + lib.key); });
    }
  } catch(e) {}
}

function getAvailabilityData(libraryKey) {
  var cacheKey = 'avail_v2_' + libraryKey;
  var cache    = CacheService.getScriptCache();
  var cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var invSheet  = ss.getSheetByName(INV_TAB);
  var rsvpSheet = ss.getSheetByName(RSVP_TAB);
  var invData   = invSheet.getDataRange().getValues();
  var rsvpData  = rsvpSheet.getDataRange().getValues();
  var lib       = getLibrary(libraryKey);
  var today     = new Date(); today.setHours(0, 0, 0, 0);
  // Item names relevant to this library (directly listed or cross-listed
  // via a comma-separated Library cell), mapped to their full library set
  // so a booking made through any of those libraries pools correctly.
  var itemLibMap = {};
  for (var j0 = 1; j0 < invData.length; j0++) {
    var iname0 = String(invData[j0][COL_ITEM]).trim();
    if (!iname0) continue;
    var libs0 = itemLibraries(invData[j0][COL_LIBRARY]);
    if (libs0.indexOf(libraryKey) !== -1) itemLibMap[iname0] = libs0;
  }

  var reservations = [], activeRsvps = {}, lentOut = {};
  for (var i = 1; i < rsvpData.length; i++) {
    var row        = rsvpData[i];
    var itemName   = String(row[7]).trim();   // H: Item Name
    var pickupDate = row[10];                  // K: Pickup Date
    var returnDate = row[12];                  // M: Return Date
    var status     = String(row[15]).trim();   // P: Status
    var rowLib     = String(row[0]).trim();    // A: Library
    var qty        = (row[8] && !isNaN(parseInt(row[8]))) ? parseInt(row[8]) : 1;    // I: Qty
    var itemLibs   = itemLibMap[itemName];
    if (!itemLibs || itemLibs.indexOf(rowLib) === -1) continue;
    if (['Confirmed', 'Lent Out', 'Pending', 'Added to existing request'].indexOf(status) === -1) continue;
    if (!itemName || !pickupDate || !returnDate) continue;
    var pd = new Date(pickupDate); pd.setHours(0, 0, 0, 0);
    var rd = new Date(returnDate); rd.setHours(0, 0, 0, 0);
    reservations.push({ item: itemName, pickup: pd.getTime(), ret: rd.getTime(), qty: qty });
    if (!activeRsvps[itemName]) activeRsvps[itemName] = [];
    activeRsvps[itemName].push({ pickup: pd, ret: rd, qty: qty });
    if ((status === 'Lent Out' || status === 'Added to existing request') && pd <= today && rd >= today) lentOut[itemName] = true;
  }
  var items = [];
  for (var j = 1; j < invData.length; j++) {
    var irow    = invData[j];
    if (itemLibraries(irow[COL_LIBRARY]).indexOf(libraryKey) === -1) continue;
    var iname      = String(irow[COL_ITEM]).trim();
    var availFlag  = String(irow[COL_CURRENTLY_HAVE]).trim().toUpperCase();
    var category   = String(irow[COL_CATEGORY]).trim();
    var brand      = String(irow[COL_BRAND]    || '').trim();
    var size       = String(irow[COL_SIZE]     || '').trim();
    if (!iname || availFlag !== 'Y') continue;
    var imageUrl = normalizeDriveUrl(String(irow[COL_IMAGE_URL] || '').trim());
    var link     = String(irow[COL_LINK] || '').trim();
    var iqty     = (irow[COL_QTY] && !isNaN(parseInt(irow[COL_QTY]))) ? parseInt(irow[COL_QTY]) : 1;
    var rsvps    = activeRsvps[iname] || [];
    var bookedToday = rsvps.reduce(function(sum, b) {
      return sum + (b.pickup <= today && b.ret >= today ? b.qty : 0);
    }, 0);
    var isAvailable = bookedToday < iqty;
    var nextAvailStr = null;
    if (!isAvailable) {
      // Find earliest date when bookedQty drops below iqty
      var futureDates = rsvps.map(function(b) { return b.ret; }).filter(function(d) { return d >= today; }).sort(function(a, b) { return a - b; });
      if (futureDates.length) {
        var nextDay = new Date(futureDates[0]); nextDay.setDate(nextDay.getDate() + 1);
        nextAvailStr = nextDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    var itemObj = { name: iname, category: category || 'Other', available: isAvailable, currentlyOut: !!lentOut[iname], nextAvailable: nextAvailStr, imageUrl: imageUrl, link: link, qty: iqty };
    if (brand) itemObj.brand = brand;
    if (size)  itemObj.size  = size;
    items.push(itemObj);
  }
  items.sort(function(a, b) { return a.available !== b.available ? (a.available ? -1 : 1) : a.name.localeCompare(b.name); });
  var blackouts = [];
  try {
    blackouts = getBlackoutDates().map(function(b) { return { start: b.start.getTime(), end: b.end.getTime() }; });
  } catch(e) { Logger.log('getBlackoutDates failed: ' + e); }
  var result = { items: items, reservations: reservations, blackouts: blackouts, bookingWindowDays: BOOKING_WINDOW_DAYS, library: { key: lib.key, name: lib.name, shortName: lib.shortName } };
  try { cache.put(cacheKey, JSON.stringify(result), 900); } catch(e) {}
  return result;
}



function sendContactMessage(formData) {
  try {
    var name    = String(formData.name    || '').trim();
    var email   = String(formData.email   || '').trim();
    var phone   = String(formData.phone   || '').trim();
    var message = String(formData.message || '').trim();
    if (!name || !email || !message) return { success: false, message: 'All fields are required.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'A valid email address is required.' };
    var owner   = Session.getEffectiveUser().getEmail();
    var subject = 'Lending Library — message from ' + name;
    var body    = 'Name: ' + name + '\nEmail: ' + email + (phone ? '\nPhone/WhatsApp: ' + phone : '') + '\n\nMessage:\n' + message;
    GmailApp.sendEmail(owner, subject, body, { replyTo: email });
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Something went wrong: ' + err.message };
  }
}

function getFAQData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('faq_data');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FAQ_TAB);
  if (!sheet) return [];
  var rows  = sheet.getDataRange().getValues().slice(1);
  var groups = [], groupMap = {};
  rows.forEach(function(r) {
    var group    = String(r[0] || '').trim();
    var question = String(r[1] || '').trim();
    var answer   = String(r[2] || '').trim();
    var active   = String(r[3] || 'Y').trim().toUpperCase();
    if (!question || !answer || active !== 'Y') return;
    if (!groupMap[group]) {
      var g = { name: group, items: [] };
      groups.push(g);
      groupMap[group] = g;
    }
    groupMap[group].items.push({ q: question, a: answer });
  });
  try { cache.put('faq_data', JSON.stringify(groups), 3600); } catch(e) {}
  return groups;
}


function auditForDoubleBookings() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var invRows  = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var rows     = ss.getSheetByName(RSVP_TAB).getDataRange().getValues().slice(1);
  var tz       = Session.getScriptTimeZone();
  var ACTIVE   = ['Pending', 'Confirmed', 'Lent Out', 'Added to existing request'];
  var active   = rows.map(function(r, i) { return { r: r, rowNum: i + 2 }; })
                     .filter(function(x) { return ACTIVE.indexOf(String(x.r[15]).trim()) !== -1; });
  var conflicts = [];
  var seen      = {};
  active.forEach(function(x) {
    var itemName   = String(x.r[7]).trim();
    var libraryKey = String(x.r[0]).trim();
    var totalQty   = getItemQty(itemName, libraryKey, invRows);
    var np = x.r[10] instanceof Date ? x.r[10] : new Date(x.r[10]);
    var nr = x.r[12] instanceof Date ? x.r[12] : new Date(x.r[12]);
    np = new Date(np); np.setHours(0,0,0,0);
    nr = new Date(nr); nr.setHours(0,0,0,0);
    var overlapping = active.filter(function(y) {
      if (String(y.r[7]).trim() !== itemName || String(y.r[0]).trim() !== libraryKey) return false;
      var ep = y.r[10] instanceof Date ? y.r[10] : new Date(y.r[10]);
      var er = y.r[12] instanceof Date ? y.r[12] : new Date(y.r[12]);
      ep = new Date(ep); ep.setHours(0,0,0,0);
      er = new Date(er); er.setHours(0,0,0,0);
      return np <= er && nr >= ep;
    });
    var bookedQty = overlapping.reduce(function(sum, y) {
      return sum + ((y.r[8] && !isNaN(parseInt(y.r[8]))) ? parseInt(y.r[8]) : 1);
    }, 0);
    if (bookedQty > totalQty) {
      var conflictKey = libraryKey + '|' + itemName + '|' + overlapping.map(function(y) { return y.rowNum; }).sort().join(',');
      if (!seen[conflictKey]) {
        seen[conflictKey] = true;
        conflicts.push({ item: itemName, library: libraryKey, totalQty: totalQty, bookedQty: bookedQty, rows: overlapping });
      }
    }
  });
  if (!conflicts.length) {
    Logger.log('No double-booking conflicts found — all reservations look clean.');
    return;
  }
  var lines = [conflicts.length + ' double-booking conflict(s) found:\n'];
  conflicts.forEach(function(c) {
    lines.push(c.item + ' [' + c.library + '] — ' + c.totalQty + ' available, ' + c.bookedQty + ' booked:');
    c.rows.forEach(function(x) {
      var pd = Utilities.formatDate(x.r[10] instanceof Date ? x.r[10] : new Date(x.r[10]), tz, 'MMM d');
      var rd = Utilities.formatDate(x.r[12] instanceof Date ? x.r[12] : new Date(x.r[12]), tz, 'MMM d');
      lines.push('  • ' + x.r[2] + ' <' + x.r[3] + '> | ' + pd + ' – ' + rd + ' | ' + x.r[15] + ' | Row ' + x.rowNum);
    });
    lines.push('');
  });
  var report = lines.join('\n');
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Lending Library: ' + conflicts.length + ' double-booking conflict(s)', report);
  Logger.log(report);
}

function debugItem(itemId) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var invRows = ss.getSheetByName(INV_TAB).getDataRange().getValues();
  var rsvpRows = ss.getSheetByName(RSVP_TAB).getDataRange().getValues();
  var tz = Session.getScriptTimeZone();

  // Find the item in inventory by item ID
  var invMatch = null;
  for (var i = 1; i < invRows.length; i++) {
    if (String(invRows[i][COL_ITEM_ID]).trim() === itemId) { invMatch = invRows[i]; break; }
  }
  if (!invMatch) { Logger.log('Item ID ' + itemId + ' not found in inventory.'); return; }
  var invName = String(invMatch[COL_ITEM]).trim();
  var invLib  = String(invMatch[COL_LIBRARY]).trim();
  var invQty  = invMatch[COL_QTY];
  Logger.log('=== INVENTORY ===');
  Logger.log('ID: ' + itemId + ' | Name: [' + invName + '] | Library: [' + invLib + '] | Qty col raw: [' + invQty + '] | Qty parsed: ' + parseInt(invQty));

  // Find all reservations rows that mention this item
  var ACTIVE = ['Pending', 'Confirmed', 'Lent Out', 'Added to existing request'];
  Logger.log('\n=== RESERVATIONS (active rows matching this item) ===');
  var found = 0;
  for (var j = 1; j < rsvpRows.length; j++) {
    var r = rsvpRows[j];
    var rName = String(r[7]).trim();
    var rLib  = String(r[0]).trim();
    var rStatus = String(r[15]).trim();
    var rQty  = r[8];
    var nameMatch = rName === invName;
    var libMatch  = rLib  === invLib;
    if (ACTIVE.indexOf(rStatus) !== -1 && (nameMatch || rName.toLowerCase().indexOf('lotus') !== -1)) {
      var pu = r[10] instanceof Date ? Utilities.formatDate(r[10], tz, 'MMM d yyyy') : String(r[10]);
      var ret = r[12] instanceof Date ? Utilities.formatDate(r[12], tz, 'MMM d yyyy') : String(r[12]);
      Logger.log('Row ' + (j+1) + ': name=[' + rName + '] lib=[' + rLib + '] status=[' + rStatus + '] qty=[' + rQty + '] pickup=' + pu + ' return=' + ret);
      Logger.log('  nameMatch=' + nameMatch + ' libMatch=' + libMatch);
      found++;
    }
  }
  if (!found) Logger.log('No active reservations found containing "lotus".');
}

function clearScriptProperties() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('Script properties cleared.');
}

function resetSentKeysForEmail(email) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var emailSlug = email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  var deleted = [];
  Object.keys(props).forEach(function(key) {
    if (key.indexOf('sent_') === 0 && key.toLowerCase().indexOf(emailSlug) !== -1) {
      PropertiesService.getScriptProperties().deleteProperty(key);
      deleted.push(key);
    }
  });
  Logger.log(deleted.length ? 'Deleted sentKeys: ' + deleted.join(', ') : 'No sentKeys found for ' + email);
}

function countReservations() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var rows  = sheet.getDataRange().getValues().slice(1);
  var tz    = Session.getScriptTimeZone();
  var seen  = {};
  var byLibrary = {}, byStatus = {};
  rows.forEach(function(r) {
    var libraryKey = String(r[0]).trim();
    var status     = String(r[15]).trim();
    var email      = String(r[3]).trim();
    var tsFmt      = r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd HH:mm:ss') : String(r[1]);
    if (!email || !libraryKey || !tsFmt) return;
    var key = libraryKey + '_' + email + '_' + tsFmt;
    if (seen[key]) return;
    seen[key] = true;
    byLibrary[libraryKey] = (byLibrary[libraryKey] || 0) + 1;
    byStatus[status]      = (byStatus[status]      || 0) + 1;
  });
  var total = Object.keys(seen).length;
  var lines = ['Total unique reservations: ' + total, ''];
  lines.push('By library:');
  LIBRARIES.forEach(function(lib) { lines.push('  ' + lib.shortName + ': ' + (byLibrary[lib.key] || 0)); });
  lines.push('');
  lines.push('By status:');
  Object.keys(byStatus).sort().forEach(function(s) { lines.push('  ' + s + ': ' + byStatus[s]); });
  Logger.log(lines.join('\n'));
}

function findOldTitleInvites() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RSVP_TAB);
  var rows  = sheet.getDataRange().getValues().slice(1);
  var cal   = CalendarApp.getDefaultCalendar();
  var tz    = Session.getScriptTimeZone();
  var seen  = {};
  var found = [];
  rows.forEach(function(r) {
    var status = String(r[15]).trim();
    if (status !== 'Confirmed' && status !== 'Lent Out' && status !== 'Added to existing request') return;
    var email      = String(r[3]).trim();
    var libraryKey = String(r[0]).trim();
    var pickupDate = r[10] instanceof Date ? r[10] : new Date(r[10]);
    var returnDate = r[12] instanceof Date ? r[12] : new Date(r[12]);
    if (!email || isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime())) return;
    var key = email + '_' + libraryKey + '_' + Utilities.formatDate(pickupDate, tz, 'yyyy-MM-dd') + '_' + Utilities.formatDate(returnDate, tz, 'yyyy-MM-dd');
    if (seen[key]) return;
    seen[key] = true;
    var name      = String(r[2]).trim();
    var firstName = name.split(' ')[0];
    var lib       = getLibrary(libraryKey);
    var pStart = new Date(pickupDate); pStart.setHours(0,0,0,0);
    var pEnd   = new Date(pickupDate); pEnd.setHours(23,59,59,999);
    var rStart = new Date(returnDate); rStart.setHours(0,0,0,0);
    var rEnd   = new Date(returnDate); rEnd.setHours(23,59,59,999);
    var oldPickup = cal.getEvents(pStart, pEnd, { search: firstName + ' <> Lending Library Pickup' });
    var oldReturn = cal.getEvents(rStart, rEnd, { search: firstName + ' <> Lending Library Return' });
    oldPickup.forEach(function(ev) { found.push('RENAME: "' + ev.getTitle() + '" → "' + firstName + ' <> ' + lib.name + ' Pickup"  (' + Utilities.formatDate(pickupDate, tz, 'MMM d') + ')'); });
    oldReturn.forEach(function(ev) { found.push('RENAME: "' + ev.getTitle() + '" → "' + firstName + ' <> ' + lib.name + ' Return"  (' + Utilities.formatDate(returnDate, tz, 'MMM d') + ')'); });
  });
  if (found.length) {
    Logger.log(found.length + ' event(s) still need renaming:\n\n' + found.join('\n'));
  } else {
    Logger.log('All done — no events with old title format found.');
  }
}
```
