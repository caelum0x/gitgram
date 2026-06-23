// Type verification file to force TypeScript to reload Prisma types
import { PrismaClient } from '@prisma/client';
import logger from './logger';

const prisma = new PrismaClient();

// Verify that all Reel-related models exist
const testTypes = async () => {
    // These should all be valid
    await prisma.reel.findMany();
    await prisma.reelLike.findMany();
    await prisma.reelComment.findMany();
    await prisma.reelView.findMany();

    logger.info('All Reel models are accessible');
};

export { testTypes };
