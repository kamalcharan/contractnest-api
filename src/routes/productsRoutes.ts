// src/routes/productsRoutes.ts
// Routes for products (m_products) - used for product dropdown in pricing plans
import express from 'express';
import { Request, Response } from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * GET /api/products
 * Returns list of active products for dropdown selection
 */
const getProducts = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    console.log('📦 Fetching products from edge function');

    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/products`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`📦 Found ${response.data?.data?.length || 0} products`);
    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('❌ Error in getProducts:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch products';
    return res.status(status).json({ error: message });
  }
};

/**
 * GET /api/products/:code
 * Returns a specific product by code
 */
const getProductByCode = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { code } = req.params;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Product code is required' });
    }

    console.log(`📦 Fetching product: ${code}`);

    const response = await axios.get(
      `${process.env.SUPABASE_URL}/functions/v1/products/${code}`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('❌ Error in getProductByCode:', error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'Failed to fetch product';
    return res.status(status).json({ error: message });
  }
};

// Routes
router.get('/', getProducts);
router.get('/:code', getProductByCode);

export default router;
