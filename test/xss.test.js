// Regression test for CodeQL js/xss-through-dom (tooltip HTML built from DOM text).
// Run: node test/xss.test.js   (no dependencies; jQuery is stubbed)
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var tooltipHtml = [];
var clickHandler = null;
var currentWord = '';
var ajaxResponse = null; // null => request error
var storage = {
  repropedia_all_terms_expiration: String(Math.floor(Date.now() / 1000) + 1000),
  repropedia_all_terms_data: JSON.stringify({ acrosome: 1 })
};

function $() {
  var o = {
    each: function() { return o; },
    html: function(h) { if (h !== undefined) tooltipHtml.push(h); return ''; },
    text: function() { return currentWord; },
    attr: function() { return '1'; },
    tooltip: function() { return o; },
    dynamic: function() { return o; },
    live: function(ev, fn) { if (ev === 'click') clickHandler = fn; return o; }
  };
  return o;
}
$.inArray = function(v, a) { return a.indexOf(v); };
$.ajax = function(opts) {
  if (ajaxResponse === null) opts.error({}, 'error', 'err');
  else opts.success(ajaxResponse);
};

var ctx = {
  jQuery: $, console: console, document: { documentElement: {} },
  localStorage: {
    getItem: function(k) { return storage[k] == null ? null : storage[k]; },
    setItem: function(k, v) { storage[k] = String(v); },
    clear: function() {}
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/repropedia.js'), 'utf8') + '\nthis.Repropedia = Repropedia;', ctx);
ctx.Repropedia.init({ CONSUMER_KEY: 'k', regions: ['.x'] });
assert(clickHandler, 'click handler registered');

var evil = "<img src=x onerror=alert(1)>'\"";
function click(word, nid) { currentWord = word; tooltipHtml.length = 0; clickHandler.call({}); return tooltipHtml.join('\n'); }
function noInjectedTags(html, label) {
  assert(html.indexOf('<img') === -1, label + ': raw <img> leaked: ' + html);
  assert(html.indexOf('onerror=alert(1)>') === -1, label + ': unescaped payload: ' + html);
}

// 1. loader + error path escape the DOM-derived term
ajaxResponse = null;
var out = click(evil);
noInjectedTags(out, 'loader/error');
assert(out.indexOf('&lt;img') !== -1, 'term is escaped, not dropped');

// 2. success path escapes service title/url, and blocks javascript: URLs
ajaxResponse = { title: evil, nid: 99, path: "javascript:alert(1)", synonym: {}, definition: 'ok <b>def</b>' };
out = click('acrosome');
noInjectedTags(out, 'success');
assert(out.indexOf("javascript:") === -1, 'javascript: url blocked');
assert(out.indexOf('ok <b>def</b>') !== -1, 'definition HTML still rendered');

// 3. benign term and https URL are unaffected
ajaxResponse = { title: 'Acrosome', nid: 100, path: 'https://www.repropedia.org/x', synonym: {}, definition: 'd' };
out = click('acrosome');
assert(out.indexOf("<a href='https://www.repropedia.org/x'>Acrosome</a>") !== -1, 'benign output unchanged: ' + out);

console.log('PASS: xss.test.js');
