import { v4 as uuidv4 } from 'uuid';
import { promises as fsPromises } from 'fs';
import { ObjectID } from 'mongodb';
import path from 'path';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async getUser(request) {
    const token = request.header('X-Token');
    if (!token) return null;

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return null;

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(userId) });
    return user || null;
  }

  static sendErrorResponse(res, status, message) {
    return res.status(status).json({ error: message });
  }

  static async getShow(req, res) {
    const user = await FilesController.getUser(req);
    if (!user) return FilesController.sendErrorResponse(res, 401, 'Unauthorized');

    const fileId = req.params.id;
    if (!ObjectID.isValid(fileId)) return FilesController.sendErrorResponse(res, 404, 'Not found');

    try {
      const file = await dbClient.db.collection('files').findOne({
        _id: ObjectID(fileId),
        userId: ObjectID(user._id),
      });
      if (!file) return FilesController.sendErrorResponse(res, 404, 'Not found');

      return res.status(200).json(file);
    } catch (error) {
      console.error(error);
      return FilesController.sendErrorResponse(res, 500, 'Server error');
    }
  }

  // Get all files with pagination
  static async getIndex(req, res) {
    const user = await FilesController.getUser(req);
    if (!user) return FilesController.sendErrorResponse(res, 401, 'Unauthorized');

    const { parentId, page = 0 } = req.query;
    const query = { userId: user._id, ...(parentId && { parentId: ObjectID(parentId) }) };

    try {
      const result = await dbClient.db.collection('files').aggregate([
        { $match: query },
        { $sort: { _id: -1 } },
        {
          $facet: {
            metadata: [{ $count: 'total' }, { $addFields: { page: parseInt(page, 10) } }],
            data: [{ $skip: 20 * parseInt(page, 10) }, { $limit: 20 }],
          },
        },
      ]).toArray();

      if (!result || result.length === 0) return FilesController.sendErrorResponse(res, 404, 'Not found');

      const files = result[0].data.map((file) => ({
        ...file,
        id: file._id,
        parentId: file.parentId === '0' ? 0 : file.parentId,
      }));

      return res.status(200).json(files);
    } catch (error) {
      console.error(error);
      return FilesController.sendErrorResponse(res, 500, 'Server error');
    }
  }

  static async postUpload(req, res) {
    const user = await FilesController.getUser(req);
    if (!user) return FilesController.sendErrorResponse(res, 401, 'Unauthorized');

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;
    if (!name || !type) return FilesController.sendErrorResponse(res, 400, 'Missing name or type');
    if (type !== 'folder' && !data) return FilesController.sendErrorResponse(res, 400, 'Missing data');

    try {
      const files = dbClient.db.collection('files');

      if (parentId !== 0) {
        const parentFile = await files.findOne({ _id: ObjectID(parentId), userId: user._id });
        if (!parentFile) return FilesController.sendErrorResponse(res, 400, 'Parent not found');
        if (parentFile.type !== 'folder') return FilesController.sendErrorResponse(res, 400, 'Parent is not a folder');
      }

      const fileDocument = {
        userId: ObjectID(user._id),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? '0' : ObjectID(parentId),
      };

      if (type === 'folder') {
        const result = await files.insertOne(fileDocument);
        return res.status(201).json({
          id: result.insertedId,
          ...fileDocument,
        });
      }

      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      await fsPromises.mkdir(folderPath, { recursive: true });

      const localPath = path.join(folderPath, uuidv4());
      await fsPromises.writeFile(localPath, Buffer.from(data, 'base64'));

      fileDocument.localPath = localPath;
      const result = await files.insertOne(fileDocument);

      return res.status(201).json({ id: result.insertedId, ...fileDocument });
    } catch (error) {
      console.error(error);
      return FilesController.sendErrorResponse(res, 500, 'Server error');
    }
  }

  // Publish a file (set isPublic to true)
  static async putPublish(req, res) {
    const user = await FilesController.getUser(req);
    if (!user) return FilesController.sendErrorResponse(res, 401, 'Unauthorized');

    const { id } = req.params;
    try {
      const files = dbClient.db.collection('files');
      const updatedFile = await files.findOneAndUpdate(
        { _id: ObjectID(id), userId: user._id },
        { $set: { isPublic: true } },
        { returnOriginal: false },
      );

      if (!updatedFile.value) return FilesController.sendErrorResponse(res, 404, 'Not found');
      return res.status(200).json(updatedFile.value);
    } catch (error) {
      console.error(error);
      return FilesController.sendErrorResponse(res, 500, 'Server error');
    }
  }

  // Unpublish a file (set isPublic to false)
  static async putUnpublish(req, res) {
    const user = await FilesController.getUser(req);
    if (!user) return FilesController.sendErrorResponse(res, 401, 'Unauthorized');

    const { id } = req.params;
    try {
      const files = dbClient.db.collection('files');
      const updatedFile = await files.findOneAndUpdate(
        { _id: ObjectID(id), userId: user._id },
        { $set: { isPublic: false } },
        { returnOriginal: false },
      );

      if (!updatedFile.value) return FilesController.sendErrorResponse(res, 404, 'Not found');
      return res.status(200).json(updatedFile.value);
    } catch (error) {
      console.error(error);
      return FilesController.sendErrorResponse(res, 500, 'Server error');
    }
  }
}

module.exports = FilesController;
