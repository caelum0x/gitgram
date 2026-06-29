import logger from '../utils/logger';

// @tensorflow/tfjs-node ships prebuilt NATIVE (glibc) binaries that are not
// available on every runtime (e.g. Alpine/musl images or some arm64 containers).
// Importing it at module load therefore crashes the whole server on those hosts.
// Load tf + nsfwjs LAZILY so an unavailable native lib degrades NSFW detection to
// a safe no-op (treat as not-NSFW) instead of taking the process down.
type TfModule = typeof import('@tensorflow/tfjs-node');
type NsfwModel = Awaited<ReturnType<typeof import('nsfwjs')['load']>>;

let tf: TfModule | null = null;
let model: NsfwModel | null = null;
let unavailable = false;

const ensureEngine = async (): Promise<{ tf: TfModule; model: NsfwModel } | null> => {
  if (unavailable) return null;
  if (tf && model) return { tf, model };
  try {
    tf = await import('@tensorflow/tfjs-node');
    const nsfwjs = await import('nsfwjs');
    model = await nsfwjs.load();
    return { tf, model };
  } catch (error) {
    unavailable = true;
    logger.warn('NSFW detection disabled — @tensorflow/tfjs-node unavailable on this runtime', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const loadModel = async (): Promise<NsfwModel | null> => {
  const engine = await ensureEngine();
  return engine?.model ?? null;
};

export const detectNSFW = async (
  imageBuffer: Buffer,
): Promise<{ isNSFW: boolean; predictions: Array<{ className: string; probability: number }> }> => {
  try {
    const engine = await ensureEngine();
    if (!engine) {
      return { isNSFW: false, predictions: [] };
    }
    const image = engine.tf.node.decodeImage(imageBuffer, 3);
    const predictions = await engine.model.classify(image);
    image.dispose();

    const nsfwScore =
      predictions.find((p) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))?.probability || 0;
    const isNSFW = nsfwScore > 0.6;

    return { isNSFW, predictions };
  } catch (error) {
    logger.error('NSFW detection error:', error);
    return { isNSFW: false, predictions: [] };
  }
};
