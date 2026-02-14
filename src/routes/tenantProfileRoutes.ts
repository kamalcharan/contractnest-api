// src/routes/tenantProfileRoutes.ts
import express from 'express';
import multer from 'multer';
import * as tenantProfileController from '../controllers/tenantProfileController';
import { createTenantProfileValidation, updateTenantProfileValidation } from '../validators/tenantProfile';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
    files: 1
  },
  fileFilter: (req: any, file: any, cb: any) => {
    // Accept image files only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get tenant profile for current tenant
router.get('/tenant-profile', tenantProfileController.getTenantProfile);

// Create new tenant profile with validation
router.post('/tenant-profile', createTenantProfileValidation, tenantProfileController.createTenantProfile);

// Update existing tenant profile with validation
router.put('/tenant-profile', updateTenantProfileValidation, tenantProfileController.updateTenantProfile);

// Upload logo for tenant profile
router.post('/tenant-profile/logo', upload.single('logo'), tenantProfileController.uploadLogo);

// =========================================================================
// Served Industries Routes
// =========================================================================

// Get all industries this tenant serves
router.get('/tenant-profile/served-industries', tenantProfileController.getServedIndustries);

// Add one or more served industries
router.post('/tenant-profile/served-industries', tenantProfileController.addServedIndustries);

// Remove a served industry
router.delete('/tenant-profile/served-industries/:industryId', tenantProfileController.removeServedIndustry);

// Get unlock preview - template counts by served industries
router.get('/tenant-profile/served-industries/unlock-preview', tenantProfileController.getUnlockPreview);

export default router;