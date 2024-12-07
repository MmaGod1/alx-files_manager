import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();

    this.client.on('error', (err) => {
      console.log('Redis Client is not connected to the server:', err);
    });
  }

  isAlive() {
    if (this.client.connected) {
      return true;
    }
    return false;
  }

  async get(key) {
    const asyncGet = promisify(this.client.get).bind(this.client);
    try {
      return await asyncGet(key);
    } catch (err) {
      console.log(`Error getting ${key}`);
      return null;
    }
  }

  async set(key, value, duration) {
    const asyncSet = promisify(this.client.set).bind(this.client);
    try {
      await asyncSet(key, value, 'Ex', duration);
    } catch (err) {
      console.log(`Error detting ${key}`);
    }
  }

  async del(key) {
    const asyncDel = promisify(this.client.del).bind(this.client);
    try {
      await asyncDel(key);
    } catch (err) {
      console.log(`Error deleting ${key}`);
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
