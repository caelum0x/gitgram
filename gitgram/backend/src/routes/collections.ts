import { Router } from 'express';
import * as collectionsController from '../controllers/collectionsController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  collectionIdValidator,
  createCollectionValidator,
  updateCollectionValidator,
  collectionPostsValidator,
  addToCollectionValidator,
  removeFromCollectionValidator,
  addToMultipleValidator,
  checkPostSavedValidator,
  moveSavedPostValidator,
  savedPostsPaginationValidator,
} from '../validators/collectionValidator';

const router = Router();

/**
 * @swagger
 * /api/v1/collections:
 *   get:
 *     summary: Get all user collections
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's collections
 */
router.get('/', authenticate, collectionsController.getCollections);

/**
 * @swagger
 * /api/v1/collections:
 *   post:
 *     summary: Create a new collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               isPrivate:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Collection created
 */
router.post('/', authenticate, validate(createCollectionValidator), collectionsController.createCollection);

/**
 * @swagger
 * /api/v1/collections/saved:
 *   get:
 *     summary: Get all saved posts (All Saved view)
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of all saved posts
 */
router.get('/saved', authenticate, validate(savedPostsPaginationValidator), collectionsController.getAllSavedPosts);

/**
 * @swagger
 * /api/v1/collections/add-multiple:
 *   post:
 *     summary: Add a post to multiple collections at once
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *               - collectionIds
 *             properties:
 *               postId:
 *                 type: string
 *               collectionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Post added to collections
 */
router.post('/add-multiple', authenticate, validate(addToMultipleValidator), collectionsController.addToMultipleCollections);

/**
 * @swagger
 * /api/v1/collections/check/{postId}:
 *   get:
 *     summary: Check if a post is saved and get its collections
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Saved status and collections
 */
router.get('/check/:postId', authenticate, validate(checkPostSavedValidator), collectionsController.checkPostSaved);

/**
 * @swagger
 * /api/v1/saved/{id}/move:
 *   put:
 *     summary: Move a saved post to a different collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The saved post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - toCollectionId
 *             properties:
 *               fromCollectionId:
 *                 type: string
 *                 description: Optional - collection to remove from
 *               toCollectionId:
 *                 type: string
 *                 description: Collection to move to
 *     responses:
 *       200:
 *         description: Post moved to collection
 */
router.put('/saved/:id/move', authenticate, validate(moveSavedPostValidator), collectionsController.moveSavedPost);

/**
 * @swagger
 * /api/v1/collections/{id}:
 *   get:
 *     summary: Get a single collection by ID
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Collection details
 */
router.get('/:id', authenticate, validate(collectionIdValidator), collectionsController.getCollection);

/**
 * @swagger
 * /api/v1/collections/{id}:
 *   put:
 *     summary: Update a collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               coverImage:
 *                 type: string
 *               isPrivate:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Collection updated
 */
router.put('/:id', authenticate, validate(updateCollectionValidator), collectionsController.updateCollection);

/**
 * @swagger
 * /api/v1/collections/{id}:
 *   delete:
 *     summary: Delete a collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Collection deleted
 */
router.delete('/:id', authenticate, validate(collectionIdValidator), collectionsController.deleteCollection);

/**
 * @swagger
 * /api/v1/collections/{id}/posts:
 *   get:
 *     summary: Get posts in a collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Posts in the collection
 */
router.get('/:id/posts', authenticate, validate(collectionPostsValidator), collectionsController.getCollectionPosts);

/**
 * @swagger
 * /api/v1/collections/{id}/posts:
 *   post:
 *     summary: Add a post to a collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - postId
 *             properties:
 *               postId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Post added to collection
 */
router.post('/:id/posts', authenticate, validate(addToCollectionValidator), collectionsController.addToCollection);

/**
 * @swagger
 * /api/v1/collections/{id}/posts/{postId}:
 *   delete:
 *     summary: Remove a post from a collection
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post removed from collection
 */
router.delete('/:id/posts/:postId', authenticate, validate(removeFromCollectionValidator), collectionsController.removeFromCollection);

export default router;
