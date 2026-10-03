// Records where a visitor came from (ad campaign, search, referral link, ...)
// so signup can save it on the new client's record. Runs on the homepage,
// signup and login pages; the value survives navigation via localStorage.
// First-party only -- nothing is sent anywhere until the client signs up.
(function () {
  var KEY = 'val_attribution';
  var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  function clamp(v) {
    if (v === null || v === undefined) return null;
    v = String(v).trim();
    return v ? v.slice(0, 200) : null;
  }

  function readStored() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v && v.first_seen && Date.now() - v.first_seen < MAX_AGE_MS) return v;
    } catch (e) {}
    return null;
  }

  function writeStored(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }

  function referrerHost() {
    try {
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h && h !== location.hostname.replace(/^www\./, '') ? h : null;
    } catch (e) { return null; }
  }

  function normalizeUtmSource(s) {
    s = (s || '').toLowerCase();
    if (/^(fb|facebook|ig|instagram|meta|msg|an|audience_network)/.test(s)) return 'meta';
    return s;
  }

  function sourceFromReferrer(host) {
    if (!host) return null;
    if (/(^|\.)google\./.test(host)) return 'google (organic)';
    if (/(^|\.)(facebook|instagram|fb)\.com$/.test(host)) return 'meta (organic)';
    if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return 'twitter';
    if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
    return host;
  }

  function fromCurrentVisit() {
    var p = new URLSearchParams(location.search);
    var utmSource = clamp(p.get('utm_source'));
    var fbclid = clamp(p.get('fbclid'));
    var gclid = clamp(p.get('gclid'));
    var ttclid = clamp(p.get('ttclid'));
    var ref = clamp(p.get('ref'));
    var ib = clamp(p.get('ib'));
    var host = referrerHost();

    var source;
    if (utmSource) source = normalizeUtmSource(utmSource);
    else if (fbclid) source = 'meta';
    else if (gclid) source = 'google';
    else if (ttclid) source = 'tiktok';
    else if (ref) source = 'referral';
    else if (ib) source = 'ib link';
    else source = sourceFromReferrer(host) || 'direct';

    return {
      source: source,
      medium: clamp(p.get('utm_medium')),
      campaign: clamp(p.get('utm_campaign')),
      content: clamp(p.get('utm_content')),
      term: clamp(p.get('utm_term')),
      fbclid: fbclid,
      gclid: gclid,
      ttclid: ttclid,
      referrer: host,
      landing_page: clamp(location.pathname),
      first_seen: Date.now()
    };
  }

  function hasExplicitCampaign() {
    var p = new URLSearchParams(location.search);
    return !!(p.get('utm_source') || p.get('fbclid') || p.get('gclid') || p.get('ttclid') || p.get('ref') || p.get('ib'));
  }

  var current = fromCurrentVisit();
  var stored = readStored();
  var result;
  if (!stored) result = current;
  else if (hasExplicitCampaign()) result = current;                 // a newer campaign click wins
  else if (stored.source === 'direct' && current.source !== 'direct') result = current; // upgrade a bare "direct"
  else result = stored;                                             // internal navigation / return visit keeps the original source

  if (result === current) writeStored(current);
  window.__valAttribution = result;

  window.getAttribution = function () { return window.__valAttribution || null; };
})();
