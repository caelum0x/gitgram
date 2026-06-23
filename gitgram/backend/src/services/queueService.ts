import logger from '../utils/logger';

interface Job {
  id: string;
  type: string;
  data: any;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
}

class JobQueue {
  private queue: Job[] = [];
  private processing = false;

  async add(type: string, data: any, maxAttempts = 3): Promise<string> {
    const job: Job = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      data,
      attempts: 0,
      maxAttempts,
      createdAt: Date.now(),
    };

    this.queue.push(job);
    this.process();
    
    return job.id;
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      
      try {
        await this.executeJob(job);
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        
        job.attempts++;
        if (job.attempts < job.maxAttempts) {
          this.queue.push(job); // Retry
        }
      }
    }

    this.processing = false;
  }

  private async executeJob(job: Job) {
    switch (job.type) {
      case 'send-email':
        await this.sendEmail(job.data);
        break;
      case 'process-image':
        await this.processImage(job.data);
        break;
      case 'generate-thumbnail':
        await this.generateThumbnail(job.data);
        break;
      case 'update-analytics':
        await this.updateAnalytics(job.data);
        break;
      default:
        logger.warn(`Unknown job type: ${job.type}`);
    }
  }

  private async sendEmail(data: any) {
    // Email sending logic
    logger.debug('Sending email:', data);
  }

  private async processImage(data: any) {
    // Image processing logic
    logger.debug('Processing image:', data);
  }

  private async generateThumbnail(data: any) {
    // Thumbnail generation logic
    logger.debug('Generating thumbnail:', data);
  }

  private async updateAnalytics(data: any) {
    // Analytics update logic
    logger.debug('Updating analytics:', data);
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}

export const jobQueue = new JobQueue();
