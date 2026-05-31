'use strict';
const interceptor = require('../src/contentScript/interceptor');

class MockXHR {
  constructor() { this._listeners = {}; }
  open(method, url) { this._url = url; }
  send() {
    if (this._url.includes('statuses/favorites.json')) {
      setTimeout(() => this._listeners['load']?.(), 0);
    }
  }
  addEventListener(event, fn) { this._listeners[event] = fn; }
  get responseText() {
    return JSON.stringify({ statuses: [{ id: 1, title: 'Test' }] });
  }
}

beforeEach(() => {
  interceptor.clearCache();
  global.XMLHttpRequest = MockXHR;
  interceptor.install();
});

test('拦截 favorites.json 并填充缓存', done => {
  interceptor.onData(items => {
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(1);
    done();
  });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/statuses/favorites.json');
  xhr.send();
});

test('分页合并时去重', done => {
  let callCount = 0;
  interceptor.onData(items => {
    callCount++;
    if (callCount === 2) {
      expect(items).toHaveLength(1);
      done();
    }
  });
  const xhr1 = new XMLHttpRequest();
  xhr1.open('GET', '/statuses/favorites.json');
  xhr1.send();
  setTimeout(() => {
    const xhr2 = new XMLHttpRequest();
    xhr2.open('GET', '/statuses/favorites.json');
    xhr2.send();
  }, 10);
});

test('非 favorites URL 不触发缓存', done => {
  let called = false;
  interceptor.onData(() => { called = true; });
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/other/api.json');
  xhr.send();
  setTimeout(() => {
    expect(called).toBe(false);
    done();
  }, 20);
});
