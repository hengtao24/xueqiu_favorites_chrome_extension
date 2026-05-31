global.chrome = {
  storage: {
    local: {
      _store: {},
      get(key, cb) {
        cb({ [key]: this._store[key] });
      },
      set(obj, cb) {
        Object.assign(this._store, obj);
        cb && cb();
      },
    },
  },
};
