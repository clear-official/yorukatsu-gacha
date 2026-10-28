import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
function fixture(instant) {
  let now = Date.parse(instant), timer;
  const events = {}, root = new Map();
  const images = ['logo', 'machine', 'win', 'lose'].map(name => {
    const attrs = new Map([
      ['src', `normal-${name}`], ['data-normal-src', `normal-${name}`],
      ['data-halloween-src', `halloween-${name}`],
      ['data-normal-alt', name], ['data-halloween-alt', `Halloween ${name}`],
    ]);
    return { getAttribute: key => attrs.has(key) ? attrs.get(key) : null,
      setAttribute: (key, value) => attrs.set(key, value) };
  });
  const document = {
    documentElement: { getAttribute: key => root.get(key), setAttribute: (key, value) => root.set(key, value) },
    querySelectorAll: () => images, querySelector: () => null, hidden: false,
    addEventListener: (event, fn) => { events[event] = fn; },
  };
  const window = {
    clearTimeout: () => { timer = undefined; },
    setTimeout: (fn, ms) => { timer = { fn, ms }; return 1; },
    addEventListener: (event, fn) => { events[event] = fn; },
    dispatchEvent: () => {},
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { Date: Clock, document, window, Event: class {} });
  return { document, images, theme: () => root.get('data-theme'),
    advance(ms) { now += ms; const fn = timer.fn; fn(); },
    resume(instant) { now = Date.parse(instant); events.pageshow(); },
  };
}

test('last millisecond of October is Halloween; exact November JST boundary restores every asset', () => {
  const f = fixture('2026-10-31T23:59:59.999+09:00');
  assert.equal(f.theme(), 'halloween');
  assert(f.images.every(i => i.getAttribute('src').startsWith('halloween-')));
  f.advance(1);
  assert.equal(f.theme(), 'normal');
  assert(f.images.every(i => i.getAttribute('src').startsWith('normal-')));
  assert.equal(f.document.title, '水曜日限定 夜活ガチャ');
});

test('a suspended page resumes with regular assets after the end, without needing a reload', () => {
  const f = fixture('2026-10-28T12:00:00+09:00');
  f.resume('2026-11-01T00:00:00+09:00');
  assert.equal(f.theme(), 'normal');
  assert(f.images.every(i => i.getAttribute('src').startsWith('normal-')));
});

test('the skin is normal before this one-time season and never recurs the following year', () => {
  assert.equal(fixture('2026-10-27T23:59:59+09:00').theme(), 'normal');
  assert.equal(fixture('2027-10-28T12:00:00+09:00').theme(), 'normal');
});
