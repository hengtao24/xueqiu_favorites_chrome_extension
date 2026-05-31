'use strict';

let _cache = [];
let _listeners = [];

function install() {
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._xqUrl = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    if (this._xqUrl && this._xqUrl.includes('statuses/favorites.json')) {
      this.addEventListener('load', () => {
        try {
          const data = JSON.parse(this.responseText);
          if (Array.isArray(data.statuses)) {
            const existingIds = new Set(_cache.map(s => s.id));
            const fresh = data.statuses.filter(s => !existingIds.has(s.id));
            _cache = [..._cache, ...fresh];
            _listeners.forEach(fn => fn([..._cache]));
          }
        } catch (_) {}
      });
    }
    return _send.apply(this, arguments);
  };
}

function onData(fn) { _listeners.push(fn); }
function getCache() { return [..._cache]; }
function clearCache() { _cache = []; _listeners = []; }
function addItems(items) {
  const existingIds = new Set(_cache.map(s => s.id));
  const fresh = items.filter(s => !existingIds.has(s.id));
  if (fresh.length > 0) {
    _cache = [..._cache, ...fresh];
    _listeners.forEach(fn => fn([..._cache]));
  }
}

module.exports = { install, onData, getCache, clearCache, addItems };
