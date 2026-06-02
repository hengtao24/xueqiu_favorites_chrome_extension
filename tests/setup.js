function makeArea() {
  return {
    _store: {},
    get(key, cb) {
      cb({ [key]: this._store[key] });
    },
    set(obj, cb) {
      Object.assign(this._store, obj);
      cb && cb();
    },
    remove(key, cb) {
      delete this._store[key];
      cb && cb();
    },
  };
}

const onChangedListeners = [];

global.chrome = {
  runtime: { id: 'test-extension-id', lastError: null },
  storage: {
    local: makeArea(),
    sync: makeArea(),
    onChanged: {
      addListener(fn) {
        onChangedListeners.push(fn);
      },
      _emit(changes, area) {
        onChangedListeners.forEach(fn => fn(changes, area));
      },
    },
  },
};
