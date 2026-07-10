// Shared across all pages: API transport (Apps Script web app), contact modal, FAQ rendering.
var API_URL = (window.SFLL && window.SFLL.apiUrl) || '';

function apiGet(params, onSuccess, onFailure) {
  var qs = Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  fetch(API_URL + '?' + qs)
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(onSuccess)
    .catch(onFailure || function() {});
}

// text/plain avoids a CORS preflight, which Apps Script web apps can't answer.
// doPost reads the raw body regardless of content type.
function apiPost(payload, onSuccess, onFailure) {
  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(onSuccess)
    .catch(onFailure || function() {});
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openContactModal() {
  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactMessage').value = '';
  document.getElementById('contactError').style.display = 'none';
  document.getElementById('contactForm').style.display = 'flex';
  document.getElementById('contactSuccess').style.display = 'none';
  document.getElementById('contactOverlay').classList.add('open');
}

function closeContactModal() {
  document.getElementById('contactOverlay').classList.remove('open');
}

function submitContact() {
  var name    = document.getElementById('contactName').value.trim();
  var email   = document.getElementById('contactEmail').value.trim();
  var message = document.getElementById('contactMessage').value.trim();
  var errEl   = document.getElementById('contactError');
  errEl.style.display = 'none';
  if (!name || !email || !message) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; return; }
  var btn = document.querySelector('#contactForm .modal-submit-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  apiPost(
    { action: 'sendContactMessage', name: name, email: email, phone: document.getElementById('contactPhone').value.trim(), message: message },
    function(result) {
      btn.disabled = false; btn.textContent = 'Send message';
      if (result.success) {
        document.getElementById('contactForm').style.display = 'none';
        document.getElementById('contactSuccess').style.display = 'flex';
      } else {
        errEl.textContent = result.message || 'Something went wrong — please try again.';
        errEl.style.display = 'block';
      }
    },
    function() {
      btn.disabled = false; btn.textContent = 'Send message';
      errEl.textContent = 'Something went wrong — please try again.';
      errEl.style.display = 'block';
    }
  );
}

function toggleFaq(btn) {
  var answer = btn.nextElementSibling;
  var isOpen = answer.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  answer.classList.toggle('open', !isOpen);
}

function renderFaqs(groups) {
  var container = document.getElementById('faqContent');
  if (!container) return;
  if (!groups || !groups.length) { container.innerHTML = ''; return; }
  var html = '';
  groups.forEach(function(group) {
    html += '<div class="faq-group">';
    if (group.name) html += '<div class="faq-group-title">' + esc(group.name) + '</div>';
    group.items.forEach(function(item) {
      html += '<div class="faq-item"><button class="faq-question" onclick="toggleFaq(this)">' + esc(item.q) + ' <span class="faq-arrow">&#9660;</span></button>';
      html += '<div class="faq-answer">' + formatFaqAnswer(item.a) + '</div></div>';
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

function formatFaqAnswer(text) {
  var lines = String(text).split('\n');
  var html = '', inList = false;
  lines.forEach(function(line) {
    var trimmed = line.trim();
    var isBullet = trimmed.indexOf('- ') === 0 || trimmed.indexOf('• ') === 0;
    if (isBullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inlineFormat(trimmed.slice(2)) + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (trimmed) html += '<p>' + inlineFormat(trimmed) + '</p>';
    }
  });
  if (inList) html += '</ul>';
  return html;
}

function inlineFormat(s) {
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  return s;
}
