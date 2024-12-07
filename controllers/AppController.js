import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static getStatus(req, res) {
    const redisAlive = redisClient.isAlive();
    const dbisAlive = dbClient.isAlive();

    res.status(200).json({ redis: redisAlive, db: dbisAlive });
  }

  static async getStats(req, res) {
    const countUsers = await dbClient.nbUsers();
    const countFiles = await dbClient.nbFiles();

    res.status(200).json({ users: countUsers, files: countFiles });
  }
}

module.exports = AppController;
