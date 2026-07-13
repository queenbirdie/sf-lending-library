var adminPasscode = sessionStorage.getItem('sfll_admin_passcode') || '';

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

function loadAdminData(cb) {
  document.getElementById('adminLoading').style.display = 'block';
  document.getElementById('adminContent').style.display = 'none';
  apiPost({ action: 'admin', passcode: adminPasscode }, function(data) {
    document.getElementById('adminLoading').style.display = 'none';
    var ok = data && Array.isArray(data.pending);
    if (!ok) { if (cb) cb(false); return; }
    document.getElementById('adminContent').style.display = 'block';
    renderPending(data.pending);
    renderList('pickupsList', 'pickupsCount', data.tomorrowPickups || [], 'pickup');
    renderList('returnsList', 'returnsCount', data.tomorrowReturns || [], 'return');
    renderOverdue(data.overdue || []);
    renderConflicts(data.conflicts || []);
    if (cb) cb(true);
  }, function() {
    document.getElementById('adminLoading').style.display = 'none';
    if (cb) cb(false);
  });
}

function itemLine(e) {
  var label = e.item;
  var details = [e.brand, e.size].filter(Boolean).join(', ');
  if (details) label += ' (' + details + ')';
  if (e.qty > 1) label += ' \xd7' + e.qty;
  return label;
}

function setCount(id, n) {
  var el = document.getElementById(id);
  el.textContent = n;
  el.className = 'admin-count-badge' + (n === 0 ? ' zero' : '');
}

function renderPending(items) {
  setCount('pendingCount', items.length);
  var el = document.getElementById('pendingList');
  if (!items.length) { el.innerHTML = '<div class="admin-empty">Nothing pending — you\'re caught up.</div>'; return; }
  el.innerHTML = items.map(function(e) {
    return '<div class="admin-card">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(e.name) + '</span><span class="admin-card-lib">' + esc(e.library) + '</span></div>' +
      '<div class="admin-card-detail">' + esc(itemLine(e)) + '<br>' +
      esc(e.pickupDate) + (e.pickupTime ? ' \xb7 ' + esc(e.pickupTime) : '') + ' &#8594; ' + esc(e.returnDate) + (e.returnTime ? ' \xb7 ' + esc(e.returnTime) : '') + '<br>' +
      '<a href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a> &middot; <a href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a></div>' +
      '<div class="admin-card-actions">' +
      '<button class="admin-btn admin-btn-confirm" onclick="updateStatus(' + e.row + ',\'Confirmed\',this)">Confirm</button>' +
      '<button class="admin-btn admin-btn-decline" onclick="updateStatus(' + e.row + ',\'Cancelled\',this)">Decline</button>' +
      '</div></div>';
  }).join('');
}

function renderList(listId, countId, items, kind) {
  setCount(countId, items.length);
  var el = document.getElementById(listId);
  if (!items.length) { el.innerHTML = '<div class="admin-empty">Nothing scheduled.</div>'; return; }
  var newStatus = kind === 'pickup' ? 'Lent Out' : 'Returned';
  var btnLabel = kind === 'pickup' ? 'Mark Lent Out' : 'Mark Returned';
  el.innerHTML = items.map(function(e) {
    var time = kind === 'pickup' ? e.pickupTime : e.returnTime;
    return '<div class="admin-card">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(e.name) + '</span><span class="admin-card-lib">' + esc(e.library) + '</span></div>' +
      '<div class="admin-card-detail">' + esc(itemLine(e)) + (time ? ' &middot; ' + esc(time) : '') + '<br>' +
      '<a href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a></div>' +
      '<div class="admin-card-actions">' +
      '<button class="admin-btn admin-btn-done" onclick="updateStatus(' + e.row + ',\'' + newStatus + '\',this)">' + btnLabel + '</button>' +
      '</div></div>';
  }).join('');
}

function renderOverdue(items) {
  setCount('overdueCount', items.length);
  var el = document.getElementById('overdueList');
  if (!items.length) { el.innerHTML = '<div class="admin-empty">No overdue items.</div>'; return; }
  el.innerHTML = items.map(function(e) {
    return '<div class="admin-card">' +
      '<div class="admin-card-top"><span class="admin-card-name">' + esc(e.name) + '</span><span class="admin-card-lib">' + esc(e.library) + '</span></div>' +
      '<div class="admin-card-detail">' + esc(itemLine(e)) + '<br>' +
      'Due back ' + esc(e.returnDate) + ' &mdash; <span class="admin-card-late">' + e.daysLate + ' day' + (e.daysLate === 1 ? '' : 's') + ' late</span><br>' +
      '<a href="tel:' + esc(e.phone) + '">' + esc(e.phone) + '</a> &middot; <a href="mailto:' + esc(e.email) + '">' + esc(e.email) + '</a></div>' +
      '<div class="admin-card-actions">' +
      '<button class="admin-btn admin-btn-done" onclick="updateStatus(' + e.row + ',\'Returned\',this)">Mark Returned</button>' +
      '</div></div>';
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
      loadAdminData();
    } else {
      btn.disabled = false;
      alert(result.message || 'Something went wrong.');
    }
  }, function() {
    btn.disabled = false;
    alert('Something went wrong — please try again.');
  });
}
