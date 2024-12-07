import { MongoClient } from 'mongodb';

class DbClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'file_manager';
    const url = `mongodb://${host}:${port}`;

    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.client.connect()
      .then(() => {
        this.db = this.client.db(`${database}`);
        console.log(`Connected to Mongodb at ${url}`);
      })
      .catch((err) => {
        console.log(`failed to connect to Mongodb: ${err}`);
      });
  }

  isAlive() {
    return this.client.topology && this.client.topology.s.state === 'connected';
  }

  async nbUsers() {
    try {
      const collection = this.db.collection('users');
      return await collection.countDocuments();
    } catch (err) {
      console.log(`Error getting number of users ${err}`);
      return 0;
    }
  }

  async nbFiles() {
    try {
      const collection = this.db.collection('files');
      return await collection.countDocuments();
    } catch (err) {
      console.log(`Error getting number of users ${err}`);
      return 0;
    }
  }
}

const dbClient = new DbClient();
module.exports = dbClient;
