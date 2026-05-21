// Local storage cache manager with TTL
class CacheManager {
  constructor(prefix = 'teams_cache_') {
    this.prefix = prefix;
  }

  set(key, value, ttlSeconds = 3600) {
    const cacheData = {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.prefix + key, JSON.stringify(cacheData));
  }

  get(key) {
    const data = localStorage.getItem(this.prefix + key);
    if (!data) return null;

    try {
      const cached = JSON.parse(data);
      if (Date.now() > cached.expiry) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }
      return cached.value;
    } catch {
      return null;
    }
  }

  remove(key) {
    localStorage.removeItem(this.prefix + key);
  }

  clear() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  getAll() {
    const result = {};
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        const cached = this.get(key.replace(this.prefix, ''));
        if (cached) {
          result[key.replace(this.prefix, '')] = cached;
        }
      }
    });
    return result;
  }
}

// State sync manager
class StateSyncManager {
  constructor(appDispatch) {
    this.dispatch = appDispatch;
    this.pendingUpdates = new Map();
    this.syncQueue = [];
  }

  // Queue an update to be synced
  queueUpdate(action, delay = 500) {
    const key = action.type;

    // Cancel previous timeout if exists
    if (this.pendingUpdates.has(key)) {
      clearTimeout(this.pendingUpdates.get(key));
    }

    const timeoutId = setTimeout(() => {
      this.dispatch(action);
      this.pendingUpdates.delete(key);
    }, delay);

    this.pendingUpdates.set(key, timeoutId);
  }

  // Sync multiple updates at once
  syncBatch(actions) {
    actions.forEach(action => this.dispatch(action));
  }

  // Clear pending updates
  clearPending() {
    this.pendingUpdates.forEach(timeoutId => clearTimeout(timeoutId));
    this.pendingUpdates.clear();
  }
}

// IndexedDB for large data storage (offline support)
class OfflineStorage {
  constructor(dbName = 'TeamsApp', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId');
          msgStore.createIndex('timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async put(storeName, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async get(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAll(storeName, indexName = null) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = indexName ? store.index(indexName).getAll() : store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(storeName, key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export { CacheManager, StateSyncManager, OfflineStorage };
