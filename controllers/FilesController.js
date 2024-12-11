import { v4 as uuidv4 } from 'uuid';
import fs, { promises as fsPromises } from 'fs';
import { ObjectID } from 'mongodb';
import path from 'path';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async getShow(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectID.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    });

    if (!fileDocument) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(fileDocument);
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || '0';
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = 20;

    const pipeline = [
      { $match: { userId: ObjectID(userId), parentId } },
      { $skip: page * pageSize },
      { $limit: pageSize },
    ];

    const files = await dbClient.db.collection('files').aggregate(pipeline).toArray();

    return res.status(200).json(files);
  }

  static async postUpload(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== 0) {
      const parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectID(parentId) });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId: ObjectID(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? '0' : ObjectID(parentId),
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(fileDocument);
      return res.status(201).json({ id: result.insertedId, ...fileDocument });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fsPromises.mkdir(folderPath, { recursive: true });

    const localPath = path.join(folderPath, uuidv4());
    await fsPromises.writeFile(localPath, Buffer.from(data, 'base64'));

    fileDocument.localPath = localPath;

    const result = await dbClient.db.collection('files').insertOne(fileDocument);
    return res.status(201).json({ id: result.insertedId, ...fileDocument });
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectID.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    });

    if (!fileDocument) {
      return res.status(404).json({ error: 'Not found' });
    }

    const updatedFile = await dbClient.db.collection('files').updateOne(
      { _id: ObjectID(fileId) },
      { $set: { isPublic: true } },
    );

    if (updatedFile.modifiedCount === 0) {
      return res.status(500).json({ error: 'Could not publish file' });
    }

    const updatedFileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(fileId),
    });

    return res.status(200).json(updatedFileDocument);
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectID.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(fileId),
      userId: ObjectID(userId),
    });

    if (!fileDocument) {
      return res.status(404).json({ error: 'Not found' });
    }

    const updatedFile = await dbClient.db.collection('files').updateOne(
      { _id: ObjectID(fileId) },
      { $set: { isPublic: false } },
    );

    if (updatedFile.modifiedCount === 0) {
      return res.status(500).json({ error: 'Could not unpublish file' });
    }

    const updatedFileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(fileId),
    });

    return res.status(200).json(updatedFileDocument);
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);

    if (!ObjectID.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(fileId) });

    if (!fileDocument) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!fileDocument.isPublic && (!userId || fileDocument.userId.toString() !== userId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (fileDocument.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    if (!fs.existsSync(fileDocument.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(fileDocument.name);
    if (!mimeType) {
      return res.status(500).json({ error: 'Failed to determine MIME type' });
    }

    const fileContent = fs.readFileSync(fileDocument.localPath);
    res.setHeader('Content-Type', mimeType);
    return res.status(200).send(fileContent);
  }
}

module.exports = FilesController;
