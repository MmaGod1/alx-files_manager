import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    try {
      const usersCollection = dbClient.db.collection('users');

      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.status(400).json({ error: 'Already exists' });
      }

      const hashpwd = sha1(password);

      const insertUser = await usersCollection.insertOne({
        email,
        password: hashpwd,
      });

      const newUser = {
        id: insertUser.insertedId,
        email,
      };

      return res.status(201).json(newUser);
    } catch (err) {
      console.log(`Error creating user: ${err}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = UsersController;
