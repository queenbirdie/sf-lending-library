// Library browse page. Ported from the Apps Script SPA — same logic, but data
// comes from fetch() against the Apps Script JSON API instead of google.script.run.
var libraryKey = document.body.getAttribute('data-lib-key');
var cart = {}, allItems = [], allReservations = [], blackoutRanges = [], DAY = 86400000, bookingWindowDays = 90;
var isSubmitting = false;
var activeCategory = null, currentItems = [], currentDatesKnown = false;
var CAT_ORDER = [
  'Kids Puzzles: < 25 pcs',
  'Kids Puzzles: 25 - 50 pcs',
  'Kids Puzzles: > 50 pcs',
  'Adult Puzzles: < 500 pcs',
  'Adult Puzzles: 500 pcs',
  'Adult Puzzles: 501 - 999 pcs',
  'Adult Puzzles: 1000 pcs',
  'Adult Puzzles: > 1000 pcs',
  'Games',
  'Baby & Infant (0–18 mo)',
  'Toddler (2T–4T)',
  'Little Kids (4–6 / Size S)',
  'Big Kids (7–12 / Size M–L)'
];

apiGet({ action: 'availability', lib: libraryKey }, init, function() {
  document.getElementById('loading').textContent = "Couldn't load availability — please try again shortly.";
});

function fmtDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function init(data) {
  if (data.error) {
    document.getElementById('loading').textContent = "Couldn't load availability — please try again shortly.";
    return;
  }
  allItems = data.items; allReservations = data.reservations; blackoutRanges = data.blackouts || [];
  bookingWindowDays = data.bookingWindowDays || 90;
  if (data.library && data.library.name) {
    document.getElementById('libraryName').textContent = 'The SF Lending Library: ' + data.library.shortName;
    document.title = data.library.name;
  }
  var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  var minDate = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth()+1).padStart(2,'0') + '-' + String(tomorrow.getDate()).padStart(2,'0');
  var maxPickup = new Date(); maxPickup.setDate(maxPickup.getDate() + bookingWindowDays);
  var maxDate = maxPickup.getFullYear() + '-' + String(maxPickup.getMonth()+1).padStart(2,'0') + '-' + String(maxPickup.getDate()).padStart(2,'0');
  ['pickupDate','returnDate'].forEach(function(id) {
    document.getElementById(id).min = minDate;
  });
  document.getElementById('pickupDate').max = maxDate;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  currentItems = allItems; currentDatesKnown = false;
  buildFilters(allItems);
  applyFilters();
  updateBlackoutNote();
}

function updateBlackoutNote() {
  var el = document.getElementById('blackoutNote');
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var upcoming = blackoutRanges.filter(function(b) { return b.end >= today.getTime(); });
  if (!upcoming.length) { el.style.display = 'none'; return; }
  var parts = upcoming.map(function(b) {
    var s = new Date(b.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    var e = new Date(b.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return s === e ? s : s + '–' + e;
  });
  el.textContent = 'No pickups or returns: ' + parts.join(', ') + ' (borrows may still span these dates)';
  el.style.display = 'block';
}

function onDatesChange() {
  var pickup = document.getElementById('pickupDate').value;
  var ret    = document.getElementById('returnDate').value;
  var errEl  = document.getElementById('dateError');
  var sumEl  = document.getElementById('filterSummary');
  errEl.style.display = 'none'; sumEl.style.display = 'none';
  var today = new Date(); today.setHours(0,0,0,0);
  if (pickup && new Date(pickup + 'T00:00:00') < today) {
    errEl.textContent = 'Pickup date cannot be in the past — please choose a future date.';
    errEl.style.display = 'block';
    document.getElementById('pickupDate').value = '';
    currentItems = allItems; currentDatesKnown = false; applyFilters(); return;
  }
  if (ret && new Date(ret + 'T00:00:00') < today) {
    errEl.textContent = 'Return date cannot be in the past — please choose a future date.';
    errEl.style.display = 'block';
    document.getElementById('returnDate').value = '';
    currentItems = allItems; currentDatesKnown = false; applyFilters(); return;
  }
  if (pickup) {
    var minReturn = new Date(pickup + 'T00:00:00'); minReturn.setDate(minReturn.getDate() + 1);
    var minRetStr = minReturn.getFullYear() + '-' + String(minReturn.getMonth()+1).padStart(2,'0') + '-' + String(minReturn.getDate()).padStart(2,'0');
    document.getElementById('returnDate').min = minRetStr;
    if (ret && ret <= pickup) { document.getElementById('returnDate').value = ''; ret = ''; }
  }
  if (pickup && isBlackout(new Date(pickup + 'T00:00:00').getTime())) {
    errEl.textContent = 'That pickup date is unavailable — please choose a different date.';
    errEl.style.display = 'block';
    document.getElementById('pickupDate').value = '';
    currentItems = allItems; currentDatesKnown = false; applyFilters(); return;
  }
  if (ret && isBlackout(new Date(ret + 'T00:00:00').getTime())) {
    errEl.textContent = 'That return date is unavailable — please choose a different date.';
    errEl.style.display = 'block';
    document.getElementById('returnDate').value = '';
    currentItems = allItems; currentDatesKnown = false; applyFilters(); return;
  }
  if (!pickup || !ret) { currentItems = allItems; currentDatesKnown = false; applyFilters(); return; }
  var pickupMs = new Date(pickup + 'T00:00:00').getTime();
  var retMs    = new Date(ret    + 'T00:00:00').getTime();
  if (retMs <= pickupMs) { errEl.textContent = 'Return date must be after pickup date.'; errEl.style.display = 'block'; return; }
  var filtered = allItems.map(function(item) {
    var avail = checkDateAvailability(item.name, pickupMs, retMs, item.qty || 1);
    return Object.assign({}, item, { available: avail.available, tight: avail.tight, nextAvailable: avail.nextAvailable, availableQty: avail.availableQty, totalQty: avail.totalQty });
  });
  filtered.sort(function(a, b) { if (a.available !== b.available) return a.available ? -1 : 1; return a.name.localeCompare(b.name); });
  var count = filtered.filter(function(i) { return i.available; }).length;
  var unavailableNames = filtered.filter(function(i) { return !i.available; }).map(function(i) { return i.name; });
  var removedItems = Object.keys(cart).filter(function(n) { return unavailableNames.indexOf(n) !== -1; });
  if (removedItems.length) {
    removedItems.forEach(function(n) { delete cart[n]; });
    updateCart();
    showRemovalAlert(removedItems);
  }
  sumEl.innerHTML = '<strong>' + count + ' item' + (count !== 1 ? 's' : '') + '</strong> available ' + fmtDate(pickup) + '&#8211;' + fmtDate(ret);
  sumEl.style.display = 'block';
  currentItems = filtered; currentDatesKnown = true; applyFilters();
}

function checkDateAvailability(itemName, pickupMs, retMs, totalQty) {
  totalQty = totalQty || 1;
  var bookedQty = 0;
  var latestEnd = null;
  for (var i = 0; i < allReservations.length; i++) {
    var r = allReservations[i];
    if (r.item !== itemName) continue;
    if (r.pickup <= retMs && r.ret >= pickupMs) {
      bookedQty += (r.qty || 1);
      if (latestEnd === null || r.ret > latestEnd) latestEnd = r.ret;
    }
  }
  var availableQty = totalQty - bookedQty;
  if (availableQty <= 0) {
    var nd = new Date(latestEnd + DAY);
    return { available: false, availableQty: 0, totalQty: totalQty, tight: false, nextAvailable: nd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  }
  var tight = false;
  for (var i = 0; i < allReservations.length; i++) {
    var r = allReservations[i];
    if (r.item !== itemName) continue;
    if (r.pickup - retMs === DAY || pickupMs - r.ret === DAY) { tight = true; break; }
  }
  return { available: true, availableQty: availableQty, totalQty: totalQty, tight: tight, nextAvailable: null };
}

function isBlackout(ms) {
  for (var i = 0; i < blackoutRanges.length; i++) {
    if (ms >= blackoutRanges[i].start && ms <= blackoutRanges[i].end) return true;
  }
  return false;
}

function clearDates() {
  document.getElementById('pickupDate').value = '';
  document.getElementById('returnDate').value = '';
  document.getElementById('dateError').style.display = 'none';
  document.getElementById('filterSummary').style.display = 'none';
  currentItems = allItems; currentDatesKnown = false; applyFilters();
}

function buildFilters(items) {
  var cats = [];
  items.forEach(function(item) { if (cats.indexOf(item.category) === -1) cats.push(item.category); });
  cats.sort(function(a, b) {
    var ai = CAT_ORDER.indexOf(a); if (ai === -1) ai = 999;
    var bi = CAT_ORDER.indexOf(b); if (bi === -1) bi = 999;
    return ai - bi;
  });
  var chips = '<button class="cat-chip active" onclick="setCat(null, this)">All</button>';
  cats.forEach(function(cat) {
    chips += '<button class="cat-chip" onclick="setCat(\'' + cat.replace(/'/g, "\\'") + '\', this)">' + esc(cat) + '</button>';
  });
  document.getElementById('catChips').innerHTML = chips;
  document.getElementById('filterBar').style.display = 'block';
}

function setCat(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
  btn.classList.add('active');
  applyFilters();
}

function updateSearchClear() {
  var btn = document.getElementById('searchClear');
  btn.style.display = document.getElementById('searchInput').value ? 'block' : 'none';
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  updateSearchClear();
  applyFilters();
}

function applyFilters() {
  var query = document.getElementById('searchInput').value.toLowerCase().trim();
  var availOnly = document.getElementById('availToggle').checked;
  var filtered = currentItems.filter(function(item) {
    if (activeCategory && item.category !== activeCategory) return false;
    if (availOnly && (currentDatesKnown ? !item.available : item.currentlyOut)) return false;
    if (query) {
      var haystack = ((item.name || '') + ' ' + (item.brand || '')).toLowerCase();
      if (haystack.indexOf(query) === -1) return false;
    }
    return true;
  });
  renderItems(filtered, currentDatesKnown);
}

function renderItems(items, datesKnown) {
  var content = document.getElementById('content');
  var groups = {}, catOrder = [];
  items.forEach(function(item) {
    if (!groups[item.category]) { groups[item.category] = []; catOrder.push(item.category); }
    groups[item.category].push(item);
  });
  catOrder.sort(function(a, b) {
    var ai = CAT_ORDER.indexOf(a); if (ai === -1) ai = 999;
    var bi = CAT_ORDER.indexOf(b); if (bi === -1) bi = 999;
    return ai - bi;
  });
  var html = '';
  catOrder.forEach(function(cat) {
    html += '<div class="category-group"><div class="category-title">' + esc(cat) + '</div><div class="items-grid">';
    groups[cat].forEach(function(item) {
      var avail    = item.available;
      var totalQty = item.totalQty || item.qty || 1;
      var availQty = item.availableQty !== undefined ? item.availableQty : totalQty;
      var cartQty  = cart[item.name] || 0;
      var isSel    = cartQty > 0;
      html += '<div class="item-card' + ((datesKnown ? !avail : item.currentlyOut) ? ' unavailable' : '') + (isSel ? ' selected' : '') + '" onclick="toggle(this)" data-name="' + esc(item.name) + '">';
      html += '<div class="check-mark">&#10003;</div>';
      if (item.imageUrl) html += '<img class="item-img" src="' + esc(item.imageUrl) + '" alt="" loading="lazy">';
      if (item.link) html += '<div class="item-name">' + esc(item.name) + '<a class="item-link" href="' + esc(item.link) + '" target="_blank" onclick="event.stopPropagation()">View</a></div>';
      else           html += '<div class="item-name">' + esc(item.name) + '</div>';
      if (item.brand || item.size) {
        var meta = [item.brand, item.size].filter(Boolean).map(esc).join(' &middot; ');
        html += '<div class="item-meta">' + meta + '</div>';
      }
      if (!datesKnown) {
        if (item.currentlyOut) html += '<span class="badge badge-out">Checked out</span>';
        else html += '<span class="badge badge-neutral">Enter dates to check availability</span>';
      } else if (avail && item.tight) {
        html += '<span class="badge badge-tight">Tight turnaround</span>';
        if (totalQty > 1) html += '<div class="next-date">' + availQty + ' of ' + totalQty + ' available</div>';
      } else if (avail) {
        if (totalQty > 1) html += '<span class="badge badge-available">' + availQty + ' of ' + totalQty + ' available</span>';
        else              html += '<span class="badge badge-available">Available</span>';
      } else {
        html += '<span class="badge badge-out">Checked out</span>';
      }
      if (datesKnown && !avail && item.nextAvailable) html += '<div class="next-date">Back ' + esc(item.nextAvailable) + '</div>';
      if (datesKnown && avail && totalQty > 1) {
        var opts = '';
        for (var q = 1; q <= availQty; q++) {
          opts += '<option value="' + q + '"' + (q === cartQty ? ' selected' : '') + '>' + q + '</option>';
        }
        html += '<div class="qty-row" onclick="event.stopPropagation()">' +
          '<label>Qty:</label>' +
          '<select data-name="' + esc(item.name) + '" onchange="setCartQty(this.getAttribute(\'data-name\'), parseInt(this.value))">' + opts + '</select>' +
          '</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  });
  content.querySelectorAll('.category-group').forEach(function(el) { el.remove(); });
  content.insertAdjacentHTML('beforeend', html);
}

function toggle(card) {
  var name = card.getAttribute('data-name');
  var pickup = document.getElementById('pickupDate').value;
  var ret    = document.getElementById('returnDate').value;
  if (!pickup || !ret) {
    var errEl = document.getElementById('dateError');
    errEl.textContent = 'Please select pickup and return dates first.';
    errEl.style.display = 'block';
    document.getElementById('pickupDate').focus();
    return;
  }
  if (card.classList.contains('unavailable')) return;
  if (cart[name]) {
    delete cart[name];
    card.classList.remove('selected');
  } else {
    cart[name] = 1;
    card.classList.add('selected');
    var sel = card.querySelector('.qty-row select');
    if (sel) sel.value = '1';
  }
  updateCart();
}

function setCartQty(name, qty) {
  qty = parseInt(qty);
  if (isNaN(qty) || qty < 1) delete cart[name];
  else cart[name] = qty;
  updateCart();
}

function updateCart() {
  var keys = Object.keys(cart);
  var totalUnits = keys.reduce(function(sum, k) { return sum + cart[k]; }, 0);
  document.getElementById('cartCount').textContent = totalUnits;
  document.getElementById('cartCountLabel').textContent = totalUnits === 1 ? 'item' : 'items';
  document.getElementById('cartBar').classList.toggle('show', keys.length > 0);
  document.getElementById('cartBtn').textContent = totalUnits === 1 ? 'Request this item →' : 'Request these items →';
  document.getElementById('cartItemsList').innerHTML = keys.map(function(n) { var label = cart[n] > 1 ? n + ' \xd7' + cart[n] : n; return '<span class="cart-item-chip">' + esc(label) + '<button class="chip-remove" data-name="' + esc(n) + '" onclick="removeFromCart(this.getAttribute(\'data-name\'))" title="Remove">\xd7</button></span>'; }).join('');
}

function removeFromCart(name) {
  delete cart[name];
  var card = document.querySelector('.item-card[data-name="' + esc(name) + '"]');
  if (card) card.classList.remove('selected');
  updateCart();
}

function clearCart() {
  cart = {};
  document.querySelectorAll('.item-card.selected').forEach(function(c) { c.classList.remove('selected'); });
  updateCart();
}

function openModal() {
  if (!Object.keys(cart).length) return;
  document.getElementById('modalItemsList').innerHTML = Object.keys(cart).map(function(n) {
    var q = cart[n];
    var label = q > 1 ? esc(n) + ' <span style="color:#C0392B;font-weight:800">\xd7' + q + '</span>' : esc(n);
    return '<span class="modal-item-chip">' + label + '</span>';
  }).join('');
  var pickup = document.getElementById('pickupDate').value;
  var ret    = document.getElementById('returnDate').value;
  document.getElementById('modalPickupDate').value = pickup || '';
  document.getElementById('modalReturnDate').value = ret || '';
  document.getElementById('modalDatesText').textContent = pickup && ret ? fmtDate(pickup) + ' → ' + fmtDate(ret) : '—';
  document.getElementById('viewForm').style.display    = 'block';
  document.getElementById('viewLoading').style.display = 'none';
  document.getElementById('viewSuccess').style.display = 'none';
  document.getElementById('modalError').style.display  = 'none';
  document.getElementById('submitBtn').disabled = false;
  var today = new Date(); var mm = String(today.getMonth()+1).padStart(2,'0'), dd = String(today.getDate()).padStart(2,'0');
  document.getElementById('modalAgreementDate').value = today.getFullYear() + '-' + mm + '-' + dd;
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function closeModalIfBackground(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function submitForm() {
  if (isSubmitting) return;
  var name       = document.getElementById('modalName').value.trim();
  var email      = document.getElementById('modalEmail').value.trim();
  var phone      = document.getElementById('modalPhone').value.trim();
  var pickupDate = document.getElementById('modalPickupDate').value;
  var pickupTime = document.getElementById('modalPickupTime').value;
  var returnDate = document.getElementById('modalReturnDate').value;
  var returnTime = document.getElementById('modalReturnTime').value;
  if (!name)  { showModalError('Name is required.'); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showModalError('A valid email address is required.'); return; }
  if (!phone) { showModalError('Phone number is required.'); return; }
  if (!pickupTime) { showModalError('Please select a pickup time window.'); return; }
  if (!returnTime) { showModalError('Please select a return time window.'); return; }
  var signature = document.getElementById('modalSignature').value.trim();
  var agreementDate = document.getElementById('modalAgreementDate').value;
  if (!signature) { showModalError("Please type your name to confirm you've read the item quality disclaimer."); return; }
  if (!agreementDate) { showModalError("Please confirm today's date to acknowledge the item quality disclaimer."); return; }
  if (!pickupDate || !returnDate) { showModalError('Pickup and return dates are required.'); return; }
  var pickupMs = new Date(pickupDate + 'T00:00:00').getTime();
  var returnMs = new Date(returnDate + 'T00:00:00').getTime();
  var todayMs  = new Date(new Date().toDateString()).getTime();
  if (pickupMs <= todayMs) { showModalError('Pickup date must be tomorrow or later.'); return; }
  if (pickupMs > todayMs + bookingWindowDays * DAY) { showModalError('Pickup date must be within ' + bookingWindowDays + ' days from today.'); return; }
  if (returnMs <= pickupMs) { showModalError('Return date must be after pickup date.'); return; }
  if (isBlackout(pickupMs)) { showModalError('Pickup date falls on a blackout date — please choose a different date.'); return; }
  if (isBlackout(returnMs)) { showModalError('Return date falls on a blackout date — please choose a different date.'); return; }
  var itemsPayload = Object.keys(cart).map(function(n) { return { name: n, qty: cart[n] }; });
  isSubmitting = true;
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('viewForm').style.display    = 'none';
  document.getElementById('viewLoading').style.display = 'block';
  apiPost(
    { action: 'submitReservation', name: name, email: email, phone: phone,
      pickupDate: pickupDate, pickupTime: pickupTime,
      returnDate: returnDate, returnTime: returnTime,
      items: itemsPayload, libraryKey: libraryKey },
    function(result) {
      isSubmitting = false;
      document.getElementById('viewLoading').style.display = 'none';
      if (result.success) {
        document.getElementById('viewSuccess').style.display = 'block';
        cart = {}; updateCart();
        document.querySelectorAll('.item-card.selected').forEach(function(c) { c.classList.remove('selected'); });
      } else {
        document.getElementById('viewForm').style.display = 'block';
        document.getElementById('submitBtn').disabled = false;
        showModalError(result.message || 'Something went wrong. Please try again.');
      }
    },
    function() {
      isSubmitting = false;
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('viewLoading').style.display = 'none';
      document.getElementById('viewForm').style.display    = 'block';
      showModalError('Something went wrong — please try again.');
    }
  );
}

function showRemovalAlert(names) {
  document.getElementById('removalAlertTitle').textContent = names.length === 1 ? 'Item removed from your selection' : names.length + ' items removed from your selection';
  document.getElementById('removalAlertBody').innerHTML = names.map(function(n) { return '<div class="removal-alert-item">' + esc(n) + '</div>'; }).join('');
  document.getElementById('removalOverlay').classList.add('open');
}

function closeRemovalAlert() {
  document.getElementById('removalOverlay').classList.remove('open');
}

function showModalError(msg) {
  var el = document.getElementById('modalError');
  el.textContent = msg; el.style.display = 'block';
}
