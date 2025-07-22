import express from 'express';

// Debug: Check if file exists
import * as fs from 'fs';
import * as path from 'path';

console.log('🔍 Current directory:', __dirname);
console.log('🔍 Files in controllers directory:');
try {
  const controllersPath = path.join(__dirname, '..', 'controllers');
  const files = fs.readdirSync(controllersPath);
  console.log('📁 Controllers folder contents:', files);
} catch (error) {
  console.log('❌ Error reading controllers directory:', error);
}

// Now try the import
import {
  getCategories,
  getCategoryDetails,
  getNextSequenceNumber,
  addCategoryDetail,
  updateCategoryDetail,
  deleteCategoryDetail
} from '../controllers/masterDataController';

const router = express.Router();


router.get('/categories', getCategories);
router.get('/category-details', getCategoryDetails);
router.get('/next-sequence', getNextSequenceNumber);
router.post('/category-details', addCategoryDetail);
router.patch('/category-details/:id', updateCategoryDetail);
router.delete('/category-details/:id', deleteCategoryDetail);

export default router;