import cron from 'node-cron';
import { publishScheduledPosts } from '../controllers/scheduledPostsController';
import logger from '../utils/logger';

export const startScheduledPostsJob = () => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await publishScheduledPosts();
    } catch (error) {
      logger.error('Scheduled posts job error:', error);
    }
  });
};
