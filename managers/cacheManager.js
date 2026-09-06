const DB_NAME = 'VRM_Assets_Cache_v3'
const DB_VERSION = 1
const STORES = {
  models: 'models',
  animations: 'animations',
}

export class CacheManager {
  db = null

  async openDB() {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        console.error('CacheManager: OpenDB error', event)
        reject('Error opening database')
      }

      request.onsuccess = (event) => {
        this.db = event.target.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORES.models)) {
          db.createObjectStore(STORES.models)
        }
        if (!db.objectStoreNames.contains(STORES.animations)) {
          db.createObjectStore(STORES.animations)
        }
      }
    })
  }

  async getCached(storeName, key) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.get(key)

        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: getCached failed', error)
      return null
    }
  }

  async setCached(storeName, key, data) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)
        const request = store.put(data, key)

        request.onsuccess = () => {
          resolve()
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: setCached failed', error)
    }
  }

  async deleteCached(storeName, key) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)
        const request = store.delete(key)

        request.onsuccess = () => {
          resolve()
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: deleteCached failed', error)
    }
  }

  async listKeys(storeName) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.getAllKeys()

        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: listKeys failed', error)
      return []
    }
  }

  async getAll(storeName) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.getAll()

        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: getAll failed', error)
      return []
    }
  }

  async getMetadataAll(storeName) {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.openCursor()
        const results = []

        request.onsuccess = (event) => {
          const cursor = event.target.result
          if (cursor) {
            const value = cursor.value
            // If it's a new format object with meta, return that (minus buffer)
            if (value && value.meta) {
              results.push({ key: cursor.key, meta: value.meta })
            } else if (value && value.byteLength) {
              // Legacy/Plain buffer - just return key
              results.push({
                key: cursor.key,
                meta: { name: cursor.key, type: 'default', date: Date.now() },
              })
            }
            cursor.continue()
          } else {
            resolve(results)
          }
        }
        request.onerror = () => {
          reject(request.error)
        }
      })
    } catch (error) {
      console.warn('CacheManager: getMetadataAll failed', error)
      return []
    }
  }

  async clearCache() {
    try {
      const db = await this.openDB()
      const transaction = db.transaction([STORES.models, STORES.animations], 'readwrite')
      transaction.objectStore(STORES.models).clear()
      transaction.objectStore(STORES.animations).clear()
      console.log('CacheManager: Cache cleared')
    } catch (error) {
      console.error('CacheManager: Failed to clear cache', error)
    }
  }
}

export const cacheManager = new CacheManager()
