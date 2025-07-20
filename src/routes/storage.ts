// src/routes/storage.ts
import express from 'express';
import multer from 'multer';
import * as storageController from '../controllers/storageController';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     StorageStats:
 *       type: object
 *       properties:
 *         storageSetupComplete:
 *           type: boolean
 *         quota:
 *           type: number
 *           description: Storage quota in bytes
 *         used:
 *           type: number
 *           description: Used storage in bytes
 *         available:
 *           type: number
 *           description: Available storage in bytes
 *         usagePercentage:
 *           type: number
 *           description: Usage percentage (0-100)
 *         totalFiles:
 *           type: number
 *         categories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               count:
 *                 type: number
 *     
 *     StorageFile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         tenant_id:
 *           type: string
 *         file_name:
 *           type: string
 *         file_path:
 *           type: string
 *         file_size:
 *           type: number
 *         file_type:
 *           type: string
 *         file_category:
 *           type: string
 *         mime_type:
 *           type: string
 *         download_url:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     
 *     StorageCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         icon:
 *           type: string
 *         allowedTypes:
 *           type: array
 *           items:
 *             type: string
 *         path:
 *           type: string
 */

// Configure multer for file uploads
const storage = multer.memoryStorage();

// Single file upload configuration
const uploadSingle = multer({ 
  storage, 
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('=== Multer File Filter ===');
    console.log('File:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

// Multiple file upload configuration
const uploadMultiple = multer({ 
  storage, 
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Max 10 files
  } 
});

// Logging middleware
const logRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log('=== Incoming Storage Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'authorization': req.headers.authorization ? 'Bearer ...' : 'None',
    'x-tenant-id': req.headers['x-tenant-id']
  });
  next();
};

router.use(logRequest);

/**
 * @swagger
 * /api/storage/stats:
 *   get:
 *     summary: Get storage statistics
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Storage statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StorageStats'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/storage/stats', storageController.getStorageStats);

/**
 * @swagger
 * /api/storage/setup:
 *   post:
 *     summary: Initialize storage for tenant
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Storage setup completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StorageStats'
 *       400:
 *         description: Storage already set up
 *       401:
 *         description: Unauthorized
 */
router.post('/storage/setup', 
  express.json(),
  storageController.setupStorage
);

/**
 * @swagger
 * /api/storage/categories:
 *   get:
 *     summary: Get available storage categories
 *     tags: [Storage]
 *     responses:
 *       200:
 *         description: List of storage categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StorageCategory'
 */
router.get('/storage/categories', storageController.getStorageCategories);

/**
 * @swagger
 * /api/storage/files:
 *   get:
 *     summary: List files
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of files
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StorageFile'
 */
router.get('/storage/files', storageController.listFiles);

/**
 * @swagger
 * /api/storage/files:
 *   post:
 *     summary: Upload a file
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - category
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (max 5MB)
 *               category:
 *                 type: string
 *                 enum: [contact_photos, contract_media, service_images, documents]
 *                 description: File category
 *               metadata:
 *                 type: object
 *                 description: Optional metadata
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StorageFile'
 *       400:
 *         description: Invalid file or validation error
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: File too large
 */
router.post('/storage/files',
  (req, res, next) => {
    console.log('=== File Upload Route Hit ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Boundary:', req.headers['content-type']?.split('boundary=')?.[1]);
    next();
  },
  uploadSingle.single('file'),
  (req, res, next) => {
    console.log('=== After Multer ===');
    console.log('File:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');
    console.log('Body:', req.body);
    next();
  },
  storageController.uploadFile
);

/**
 * @swagger
 * /api/storage/files/multiple:
 *   post:
 *     summary: Upload multiple files
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *               - category
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Files to upload (max 10 files, 5MB each)
 *               category:
 *                 type: string
 *                 enum: [contact_photos, contract_media, service_images, documents]
 *     responses:
 *       207:
 *         description: Multi-status response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileName:
 *                         type: string
 *                       file:
 *                         $ref: '#/components/schemas/StorageFile'
 *                       error:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     succeeded:
 *                       type: integer
 *                     failed:
 *                       type: integer
 */
router.post('/storage/files/multiple',
  (req, res, next) => {
    console.log('=== Multiple File Upload Route Hit ===');
    console.log('Content-Type:', req.headers['content-type']);
    next();
  },
  uploadMultiple.array('files', 10),
  (req, res, next) => {
    console.log('=== After Multer (Multiple) ===');
    console.log('Files count:', req.files?.length || 0);
    console.log('Body:', req.body);
    next();
  },
  storageController.uploadMultipleFiles
);

/**
 * @swagger
 * /api/storage/files/{fileId}:
 *   delete:
 *     summary: Delete a file
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       404:
 *         description: File not found
 */
router.delete('/storage/files/:fileId', storageController.deleteFile);

/**
 * @swagger
 * /api/storage/files/delete-batch:
 *   post:
 *     summary: Delete multiple files
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileIds
 *             properties:
 *               fileIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       207:
 *         description: Multi-status response
 */
router.post('/storage/files/delete-batch',
  express.json(),
  storageController.deleteMultipleFiles
);

// Admin routes...
/**
 * @swagger
 * /api/storage/firebase/status:
 *   get:
 *     summary: Check Firebase connection status
 *     tags: [Storage - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-is-admin
 *         schema:
 *           type: string
 *           enum: ['true']
 *     responses:
 *       200:
 *         description: Firebase status
 */
router.get('/storage/firebase/status', storageController.getFirebaseStatus);

// Error handling for multer
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('=== Storage Route Error ===');
  console.error('Error:', error);
  
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error.code);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size too large. Maximum size is 5MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files. Maximum is 10 files at once.'
      });
    }
    return res.status(400).json({
      error: `Upload error: ${error.message}`
    });
  }
  
  next(error);
});

export default router;