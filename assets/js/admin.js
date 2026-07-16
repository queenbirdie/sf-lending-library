var adminPasscode = sessionStorage.getItem('sfll_admin_passcode') || '';
var TIME_WINDOWS = ['8 - 9am', '9 - 10am', '10 - 11am', '11am - 12pm', '12 - 1pm', '1 - 2pm', '2 - 3pm', '3 - 4pm', '4 - 5pm', '5 - 6pm', '6 - 7pm', '7 - 8pm'];
var SECTION_KEYS = ['pending', 'todayReturns', 'upcoming', 'pickups', 'returns', 'checkedOut', 'overdue', 'conflicts'];
var sectionCollapseOverride = {};

if (adminPasscode) {
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadAdminData();
}

function unlockAdmin() {
  var val = document.getElementById('passcodeInput').value.trim();
  var errEl = document.getElementById('lockError');
  errEl.style.display = 'none';
  if (!val) return;
  adminPasscode = val;
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadAdminData(function(ok) {
    if (!ok) {
      document.getElementById('dashboard').style.display = 'none';
      document.getElementById('lockScreen').style.display = 'block';
      errEl.textContent = 'Incorrect passcode.';
      errEl.style.display = 'block';
      adminPasscode = '';
    } else {
      sessionStorage.setItem('sfll_admin_passcode', adminPasscode);
    }
  });
}

function loadAdminData(cb, opts) {
  var silent = opts && opts.silent;
  if (!silent) {
    document.getElementById('adminLoading').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
  }
  apiPost({ action: 'admin', passcode: adminPasscode }, function(data) {
    if (!silent) document.getElementById('adminLoading').style.display = 'none';
    var ok = data && Array.isArray(data.pending);
    if (!ok) { if (cb) cb(false); return; }
    document.getElementById('adminContent').style.display = 'block';
    renderGroupedSection('pendingList', 'pendingCount', data.pending, ['confirm', 'decline', 'revise'], { label: 'Confirm all', status: 'Confirmed', hoistMeta: true });
    renderGroupedSection('todayReturnsList', 'todayReturnsCount', sortByTime(data.todayReturns || []), ['markReturned', 'lostDamaged', 'revise'], { label: 'Mark all returned', status: 'Returned', hoistMeta: false });
    renderGroupedSection('upcomingList', 'upcomingCount', data.upcoming || [], ['markLentOut', 'revise', 'cancel'], { label: 'Mark all lent out', status: 'Lent Out', hoistMeta: false });
    renderGroupedSection('pickupsList', 'pickupsCount', data.tomorrowPickups || [], ['markLentOut', 'revise', 'cancel'], { label: 'Mark all lent out', status: 'Lent Out', hoistMeta: false });
    renderSection('returnsList', 'returnsCount', data.tomorrowReturns || [], ['markReturned', 'revise']);
    renderSection('checkedOutList', 'checkedOutCount', data.checkedOut || [], ['markReturned', 'lostDamaged', 'revise']);
    renderSection('overdueList', 'overdueCount', data.overdue || [], ['markReturned', 'revise'], true);
    renderConflicts(data.conflicts || []);
    SECTION_KEYS.forEach(applySectionState);
    filterAdminSearch(document.getElementById('adminSearch').value);
    if (cb) cb(true);
  }, function() {
    if (!silent) document.getElementById('adminLoading').style.display = 'none';
    if (cb) cb(false);
  });
}

function sortByTime(items) {
  return items.slice().sort(function(a, b) {
    var ia = TIME_WINDOWS.indexOf(a.returnTime), ib = TIME_WINDOWS.indexOf(b.returnTime);
    if (ia === -1) ia = TIME_WINDOWS.length;
    if (ib === -1) ib = TIME_WINDOWS.length;
    return ia - ib;
  });
}

function groupItems(items) {
  var order = [], map = {};
  items.forEach(function(e) {
    var k = e.groupKey || ('row-' + e.row);
    if (!map[k]) { map[k] = []; order.push(k); }
    map[k].push(e);
  });
  return order.map(function(k) { return map[k]; });
}

function searchTextFor(e) {
  return [e.name, e.email, e.phone, e.item, e.brand, e.library].filter(Boolean).join(' ').toLowerCase();
}

function itemLineHtml(e) {
  var details = [e.brand, e.size].filter(Boolean).join(', ');
  var label = esc(e.item) + (details ? ' (' + esc(details) + ')' : '');
  var qtyBadge = e.qty > 1 ? ' <span class="admin-qty-badge">\xd7' + e.qty + '</span>' : '';
  var thumb = e.imageUrl ? '<img class="admin-card-thumb" src="' + esc(e.imageUrl) + '" alt="" loading="lazy" onerror="this.remove()">' : '<div class="admin-card-thumb admin-card-thumb-empty"></div>';
  var avail = availabilityBadgeHtml(e.availabilityStatus);
  return '<div class="admin-item-row">' + thumb + '<div class="admin-item-text">' + label + qtyBadge + (avail ? '<br>' + avail : '') + '</div></div>';
}

function availabilityBadgeHtml(status) {
  if (!status) return '';
  var cls = status.indexOf('Unavailable') !== -1 ? 'badge-out' : status.indexOf('Tight') !== -1 ? 'badge-tight' : status.indexOf('Available') !== -1 ? 'badge-available' : 'badge-neutral';
  return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
}

function durationDays(e) {
  if (!e.pickupDateISO || !e.returnDateISO) return null;
  var p = new Date(e.pickupDateISO + 'T00:00:00');
  var r = new Date(e.returnDateISO + 'T00:00:00');
  var days = Math.round((r - p) / 86400000);
  return isNaN(days) || days < 0 ? null : days;
}

function metaHtml(e, showLate) {
  var lateLine = (showLate && e.daysLate) ? '<br><span class="admin-card-late">' + e.daysLate + ' day' + (e.daysLate === 1 ? '' : 's') + ' late</span>' : '';
  var days = durationDays(e);
  var durationLabel = days === null ? '' : ' (' + days + ' day' + (days === 1 ? '' : 's') + ')';
  return '<div class="admin-card-detail">' +
    esc(e.pickupDate) + (e.pickupTime ? ' \xb7 ' + esc(e.pickupTime) : '') + ' &#8594; ' + esc(e.returnDate) + (e.returnTime ? ' \xb7 ' + esc(e.returnTime) : '') + durationLabel + lateLine + '<br>' +
    '<a href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a> &middot; <a href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a></div>';
}

var sectionCounts = {};

function setCount(id, n) {
  var key = id.replace(/Count$/, '');
  sectionCounts[key] = n;
  ['', 'nav'].forEach(function(prefix) {
    var elId = prefix ? prefix + id.charAt(0).toUpperCase() + id.slice(1) : id;
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = n;
    el.className = 'admin-count-badge' + (n === 0 ? ' zero' : '');
  });
}

function setSectionCollapsed(key, collapsed) {
  var listEl = document.getElementById(key + 'List');
  var chevron = document.getElementById('chevron-' + key);
  var sectionEl = document.getElementById('section-' + key);
  if (listEl) listEl.style.display = collapsed ? 'none' : '';
  if (chevron) chevron.innerHTML = collapsed ? '&#9656;' : '&#9662;';
  if (sectionEl) sectionEl.classList.toggle('collapsed', collapsed);
}

function applySectionState(key) {
  var collapsed = sectionCollapseOverride.hasOwnProperty(key) ? sectionCollapseOverride[key] : (sectionCounts[key] || 0) === 0;
  setSectionCollapsed(key, collapsed);
}

function toggleSection(key) {
  var listEl = document.getElementById(key + 'List');
  var collapsing = listEl.style.display !== 'none';
  sectionCollapseOverride[key] = collapsing;
  setSectionCollapsed(key, collapsing);
}

function jumpToSection(key, e) {
  if (e) e.preventDefault();
  sectionCollapseOverride[key] = false;
  setSectionCollapsed(key, false);
  var el = document.getElementById('section-' + key);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return false;
}

function filterAdminSearch(query) {
  var q = query.trim().toLowerCase();
  SECTION_KEYS.forEach(function(key) {
    var listEl = document.getElementById(key + 'List');
    if (!listEl) return;
    var cards = listEl.querySelectorAll('[data-search]');
    if (!cards.length) { if (!q) applySectionState(key); return; }
    if (!q) {
      cards.forEach(function(card) { card.classList.remove('search-hidden'); });
      applySectionState(key);
      return;
    }
    var anyMatch = false;
    cards.forEach(function(card) {
      var match = (card.getAttribute('data-search') || '').indexOf(q) !== -1;
      card.classList.toggle('search-hidden', !match);
      if (match) anyMatch = true;
    });
    setSectionCollapsed(key, !anyMatch);
  });
}

var ACTION_DEFS = {
  confirm:      { label: 'Confirm',        cls: 'admin-btn-confirm', onclick: function(e) { return 'updateStatus(' + e.row + ",'Confirmed',this)"; } },
  decline:      { label: 'Decline',        cls: 'admin-btn-decline', onclick: function(e) { return 'updateStatus(' + e.row + ",'Cancelled',this)"; } },
  cancel:       { label: 'Cancel',         cls: 'admin-btn-decline', onclick: function(e) { return 'updateStatus(' + e.row + ",'Cancelled',this)"; } },
  markLentOut:  { label: 'Mark Lent Out',  cls: 'admin-btn-done',    onclick: function(e) { return 'updateStatus(' + e.row + ",'Lent Out',this)"; } },
  markReturned: { label: 'Mark Returned',  cls: 'admin-btn-done',    onclick: function(e) { return 'updateStatus(' + e.row + ",'Returned',this)"; } },
  lostDamaged:  { label: 'Lost/Damaged',   cls: 'admin-btn-decline', onclick: function(e) { return 'updateStatus(' + e.row + ",'Lost or Damaged',this)"; } },
  revise:       { label: 'Revise',         cls: 'admin-btn-neutral', onclick: function(e) { return 'toggleRevise(' + e.row + ')'; } }
};

function actionButtonsHtml(e, actions) {
  return actions.map(function(key) {
    var a = ACTION_DEFS[key];
    return '<button class="admin-btn ' + a.cls + '" onclick="' + a.onclick(e) + '">' + a.label + '</button>';
  }).join('');
}

function timeSelectHtml(id, current) {
  var opts = '<option value="">Select window</option>';
  TIME_WINDOWS.forEach(function(t) {
    opts += '<option' + (t === current ? ' selected' : '') + '>' + esc(t) + '</option>';
  });
  return '<select id="' + id + '">' + opts + '</select>';
}

function reviseFormHtml(e) {
  return '<div class="admin-revise-form" id="revise-' + e.row + '" style="display:none">' +
    '<div class="admin-revise-row">' +
      '<div class="admin-revise-field"><label>Pickup date</label><input type="date" id="revisePickup-' + e.row + '" value="' + esc(e.pickupDateISO) + '"></div>' +
      '<div class="admin-revise-field"><label>Pickup time</label>' + timeSelectHtml('revisePickupTime-' + e.row, e.pickupTime) + '</div>' +
    '</div>' +
    '<div class="admin-revise-row">' +
      '<div class="admin-revise-field"><label>Return date</label><input type="date" id="reviseReturn-' + e.row + '" value="' + esc(e.returnDateISO) + '"></div>' +
      '<div class="admin-revise-field"><label>Return time</label>' + timeSelectHtml('reviseReturnTime-' + e.row, e.returnTime) + '</div>' +
    '</div>' +
    '<div class="admin-revise-row admin-revise-row-single">' +
      '<div class="admin-revise-field"><label>Qty</label><input type="number" id="reviseQty-' + e.row + '" value="' + e.qty + '" min="1"></div>' +
    '</div>' +
    '<div class="admin-revise-error" id="reviseError-' + e.row + '" style="display:none"></div>' +
    '<div class="admin-card-actions">' +
      '<button class="admin-btn admin-btn-confirm" onclick="saveRevise(' + e.row + ')">Save changes</button>' +
      '<button class="admin-btn admin-btn-neutral" onclick="toggleRevise(' + e.row + ')">Cancel edit</button>' +
    '</div></div>';
}

function toggleRevise(row) {
  var el = document.getElementById('revise-' + row);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function saveRevise(row) {
  var pickupDate = document.getElementById('revisePickup-' + row).value;
  var pickupTime = document.getElementById('revisePickupTime-' + row).value;
  var returnDate = document.getElementById('reviseReturn-' + row).value;
  var returnTime = document.getElementById('reviseReturnTime-' + row).value;
  var qty = document.getElementById('reviseQty-' + row).value;
  var errEl = document.getElementById('reviseError-' + row);
  errEl.style.display = 'none';
  if (!pickupDate || !returnDate) { errEl.textContent = 'Pickup and return dates are required.'; errEl.style.display = 'block'; return; }
  apiPost({ action: 'adminReviseReservation', passcode: adminPasscode, row: row, pickupDate: pickupDate, pickupTime: pickupTime, returnDate: returnDate, returnTime: returnTime, qty: qty }, function(result) {
    if (result.success) {
      loadAdminData(null, { silent: true });
    } else {
      errEl.textContent = result.message || 'Something went wrong.';
      errEl.style.display = 'block';
    }
  }, function() {
    errEl.textContent = 'Something went wrong — please try again.';
    errEl.style.display = 'block';
  });
}

function renderSection(listId, countId, items, actions, showLate) {
  setCount(countId, items.length);
  var el = document.getElementById(listId);
  if (!items.length) { el.innerHTML = '<div class="admin-empty">Nothing here.</div>'; return; }
  el.innerHTML = items.map(function(e) {
    return '<div class="admin-card" data-search="' + esc(searchTextFor(e)) + '">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(e.name) + '</span><span class="admin-card-lib">' + esc(e.library) + '</span></div>' +
      itemLineHtml(e) +
      metaHtml(e, showLate) +
      '<div class="admin-card-actions">' + actionButtonsHtml(e, actions) + '</div>' +
      reviseFormHtml(e) +
      '</div>';
  }).join('');
}

function renderGroupedSection(listId, countId, items, actions, bulkDef) {
  setCount(countId, items.length);
  var el = document.getElementById(listId);
  if (!items.length) { el.innerHTML = '<div class="admin-empty">Nothing here.</div>'; return; }
  var groups = groupItems(items);
  el.innerHTML = groups.map(function(group) {
    var first = group[0];
    var searchText = group.map(searchTextFor).join(' ');
    var bulkBtn = (group.length > 1) ? '<button class="admin-btn admin-btn-bulk" onclick="bulkUpdateStatus(' + JSON.stringify(group.map(function(g) { return g.row; })) + ",'" + bulkDef.status + "',this,'" + esc(bulkDef.label) + "')\">" + esc(bulkDef.label) + ' (' + group.length + ')</button>' : '';
    var itemsHtml = group.map(function(e) {
      return '<div class="admin-group-item">' +
        itemLineHtml(e) +
        (bulkDef.hoistMeta ? '' : metaHtml(e, false)) +
        '<div class="admin-card-actions">' + actionButtonsHtml(e, actions) + '</div>' +
        reviseFormHtml(e) +
        '</div>';
    }).join('');
    return '<div class="admin-card admin-group-card" data-search="' + esc(searchText) + '">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(first.name) + '</span><span class="admin-card-lib">' + esc(first.library) + '</span></div>' +
      (bulkDef.hoistMeta ? metaHtml(first, false) : '') +
      (bulkBtn ? '<div class="admin-card-actions">' + bulkBtn + '</div>' : '') +
      '<div class="admin-group-items">' + itemsHtml + '</div>' +
      '</div>';
  }).join('');
}

function renderConflicts(items) {
  setCount('conflictsCount', items.length);
  var el = document.getElementById('conflictsList');
  if (!items.length) { el.innerHTML = '<div class="admin-empty">No conflicts detected.</div>'; return; }
  el.innerHTML = items.map(function(c) {
    var names = c.rows.map(function(r) { return esc(r.name) + ' (row ' + r.row + ', ' + esc(r.status) + ')'; }).join(', ');
    return '<div class="admin-card conflict">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(c.item) + '</span><span class="admin-card-lib">' + esc(c.library) + '</span></div>' +
      '<div class="admin-card-detail">' + c.bookedQty + ' booked, only ' + c.totalQty + ' available' + (c.worstDate ? ' around ' + esc(c.worstDate) : '') + '<br>' +
      names + '</div></div>';
  }).join('');
}

function updateStatus(row, status, btn) {
  btn.disabled = true;
  btn.textContent = 'Saving...';
  apiPost({ action: 'adminUpdateStatus', passcode: adminPasscode, row: row, status: status }, function(result) {
    if (result.success) {
      loadAdminData(null, { silent: true });
    } else {
      btn.disabled = false;
      alert(result.message || 'Something went wrong.');
    }
  }, function() {
    btn.disabled = false;
    alert('Something went wrong — please try again.');
  });
}

function bulkUpdateStatus(rows, status, btn, label) {
  btn.disabled = true;
  btn.textContent = 'Saving...';
  apiPost({ action: 'adminBatchUpdateStatus', passcode: adminPasscode, rows: rows, status: status }, function(result) {
    if (result.success) {
      loadAdminData(null, { silent: true });
    } else {
      btn.disabled = false;
      btn.textContent = label + ' (' + rows.length + ')';
      alert(result.message || 'Something went wrong.');
    }
  }, function() {
    btn.disabled = false;
    btn.textContent = label + ' (' + rows.length + ')';
    alert('Something went wrong — please try again.');
  });
}
