// Redirect old Apps Script-style links (?lib=kid-gear) to the real page.
var libParam = new URLSearchParams(location.search).get('lib');
if (libParam && /^[a-z-]+$/.test(libParam)) {
  location.replace(((window.SFLL && window.SFLL.home) || '/') + libParam + '/');
} else {
  apiGet({ action: 'faq' }, renderFaqs);
}
