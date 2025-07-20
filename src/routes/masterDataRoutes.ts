// src/routes/masterDataRoutes.ts
import express from 'express';
import * as masterDataController from '../controllers/masterDataController';

const router = express.Router();

// Category routes
router.get('/categories', masterDataController.getCategories);

// Category Details routes
router.get('/category-details', masterDataController.getCategoryDetails);
router.get('/next-sequence', masterDataController.getNextSequenceNumber);
router.post('/category-details', masterDataController.addCategoryDetail);
router.patch('/category-details/:id', masterDataController.updateCategoryDetail);
router.delete('/category-details/:id', masterDataController.deleteCategoryDetail);

export default router;