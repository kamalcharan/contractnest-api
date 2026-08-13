import express from 'express';
import multer from 'multer';
import * as integrationController from '../controllers/integrationController';
import { createIntegrationValidation, testConnectionValidation, toggleStatusValidation } from '../validators/integrationValidators';

const router = express.Router();

// QR code image upload (offline_upi and any future config-only provider)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get integrations (handles all types, by type, or specific one based on query params)
router.get('/integrations', integrationController.getIntegrations);

// Test integration connection
router.post('/integrations/test', testConnectionValidation, integrationController.testIntegration);

// Create or update integration
router.post('/integrations', createIntegrationValidation, integrationController.createUpdateIntegration);

// Toggle integration status
router.put('/integrations/status/:id', toggleStatusValidation, integrationController.toggleIntegrationStatus);

// Delete a tenant integration (remove the stored config)
router.delete('/integrations/:id', integrationController.deleteIntegration);

// Upload a QR code image for a config-only integration (e.g. offline_upi)
router.post('/integrations/upload-qr', upload.single('qr_image'), integrationController.uploadQrImage);

export default router;