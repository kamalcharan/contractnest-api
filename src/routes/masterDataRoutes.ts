import express from 'express';
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