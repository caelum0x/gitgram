import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as draftsController from '../controllers/draftsController';
import { validate } from '../middleware/validation';
import {
  draftIdValidator,
  createDraftValidator,
  updateDraftValidator,
  syncDraftsValidator,
} from '../validators/draftValidator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all drafts
router.get('/', draftsController.getDrafts);

// Get a specific draft
router.get('/:id', validate(draftIdValidator), draftsController.getDraft);

// Create a new draft
router.post('/', validate(createDraftValidator), draftsController.createDraft);

// Update a draft
router.patch('/:id', validate(updateDraftValidator), draftsController.updateDraft);

// Delete a draft
router.delete('/:id', validate(draftIdValidator), draftsController.deleteDraft);

// Publish a draft as a post
router.post('/:id/publish', validate(draftIdValidator), draftsController.publishDraft);

// Sync drafts from local storage
router.post('/sync', validate(syncDraftsValidator), draftsController.syncDrafts);

export default router;
