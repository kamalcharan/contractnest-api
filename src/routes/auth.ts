// src/routes/auth.ts
import express from 'express';
import { 
  login,
  register,
  registerWithInvitation,
  refreshToken,
  signout,
  resetPassword,
  changePassword,
  completeRegistration,
  getUserProfile,
  updateUserPreferences,
  verifyPassword,
  initiateGoogleAuth,
  handleGoogleCallback,
  linkGoogleAccount,
  unlinkGoogleAccount
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input data
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/register-with-invitation:
 *   post:
 *     summary: Register a new user with an invitation
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - userCode
 *               - secretCode
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               userCode:
 *                 type: string
 *               secretCode:
 *                 type: string
 *               countryCode:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created and invitation accepted successfully
 *       400:
 *         description: Invalid input data or invitation
 */
router.post('/register-with-invitation', registerWithInvitation);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh an expired access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', refreshToken);

/**
 * @swagger
 * /api/auth/signout:
 *   post:
 *     summary: Sign out a user and invalidate tokens
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signed out successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/signout', authenticate, signout);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Send a password reset email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 */
router.post('/reset-password', resetPassword);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *                 format: password
 *               new_password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Not authenticated or incorrect current password
 */
router.post('/change-password', authenticate, changePassword);

/**
 * @swagger
 * /api/auth/verify-password:
 *   post:
 *     summary: Verify user password (for lock screen)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *       401:
 *         description: Not authenticated
 */
router.post('/verify-password', authenticate, verifyPassword);

/**
 * @swagger
 * /api/auth/complete-registration:
 *   post:
 *     summary: Complete user registration after initial signup
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: object
 *               tenant:
 *                 type: object
 *                 required:
 *                   - name
 *     responses:
 *       200:
 *         description: Registration completed successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/complete-registration', authenticate, completeRegistration);

/**
 * @swagger
 * /api/auth/user:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get('/user', authenticate, getUserProfile);

/**
 * @swagger
 * /api/auth/preferences:
 *   patch:
 *     summary: Update user preferences (theme, language, etc.)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferred_theme:
 *                 type: string
 *                 description: The theme name (e.g., ClassicElegantTheme)
 *               is_dark_mode:
 *                 type: boolean
 *                 description: Whether dark mode is enabled
 *               preferred_language:
 *                 type: string
 *                 description: Language code (e.g., en, es, fr)
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Updated user profile
 *       400:
 *         description: No preferences to update
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Failed to update preferences
 */
router.patch('/preferences', authenticate, updateUserPreferences);
console.log('✅ Auth preferences route registered at /preferences');

// Google account linking routes

/**
 * @swagger
 * /api/auth/google-link:
 *   post:
 *     summary: Link Google account to existing user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - googleEmail
 *               - googleId
 *             properties:
 *               googleEmail:
 *                 type: string
 *                 format: email
 *                 description: Google account email
 *               googleId:
 *                 type: string
 *                 description: Google user ID
 *     responses:
 *       200:
 *         description: Google account linked successfully
 *       400:
 *         description: Invalid data or account already linked
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Failed to link account
 */
router.post('/google-link', authenticate, linkGoogleAccount);

/**
 * @swagger
 * /api/auth/google-unlink:
 *   post:
 *     summary: Unlink Google account from user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Google account unlinked successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Failed to unlink account
 */
router.post('/google-unlink', authenticate, unlinkGoogleAccount);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Initiate Google OAuth flow
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: OAuth URL returned
 */
router.post('/google', initiateGoogleAuth);

/**
 * @swagger
 * /api/auth/google-callback:
 *   post:
 *     summary: Handle Google OAuth callback
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Authentication successful
 */
router.post('/google-callback', handleGoogleCallback);

// Debug: Log all registered routes
console.log('🔍 All auth routes:', router.stack.map(r => r.route?.path).filter(Boolean));

export default router;