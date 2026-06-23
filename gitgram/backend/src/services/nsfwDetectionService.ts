import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';
import logger from '../utils/logger';

let model: any = null;

export const loadModel = async () => {
  if (!model) {
    model = await nsfwjs.load();
  }
  return model;
};

export const detectNSFW = async (imageBuffer: Buffer): Promise<{ isNSFW: boolean; predictions: any[] }> => {
  try {
    const nsfwModel = await loadModel();
    const image = tf.node.decodeImage(imageBuffer, 3);
    const predictions = await nsfwModel.classify(image);
    image.dispose();

    const nsfwScore = predictions.find((p: any) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))?.probability || 0;
    const isNSFW = nsfwScore > 0.6;

    return { isNSFW, predictions };
  } catch (error) {
    logger.error('NSFW detection error:', error);
    return { isNSFW: false, predictions: [] };
  }
};
