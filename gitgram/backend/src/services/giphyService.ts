import axios from 'axios';
import logger from '../utils/logger';

const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

export class GiphyService {
    /**
     * Search for GIFs
     */
    async searchGifs(query: string, limit: number = 25, offset: number = 0) {
        if (!GIPHY_API_KEY) {
            throw new Error('GIPHY_API_KEY not configured');
        }

        try {
            const response = await axios.get(`${GIPHY_BASE_URL}/search`, {
                params: {
                    api_key: GIPHY_API_KEY,
                    q: query,
                    limit,
                    offset,
                    rating: 'g', // Family-friendly content
                    lang: 'en',
                },
            });

            return response.data.data.map((gif: any) => ({
                id: gif.id,
                title: gif.title,
                url: gif.images.fixed_height.url,
                webp: gif.images.fixed_height.webp,
                mp4: gif.images.fixed_height.mp4,
                width: gif.images.fixed_height.width,
                height: gif.images.fixed_height.height,
                preview: gif.images.fixed_height_small.url,
            }));
        } catch (error: any) {
            logger.error('Failed to search GIFs:', error);
            throw new Error('Failed to search GIFs');
        }
    }

    /**
     * Get trending GIFs
     */
    async getTrendingGifs(limit: number = 25, offset: number = 0) {
        if (!GIPHY_API_KEY) {
            throw new Error('GIPHY_API_KEY not configured');
        }

        try {
            const response = await axios.get(`${GIPHY_BASE_URL}/trending`, {
                params: {
                    api_key: GIPHY_API_KEY,
                    limit,
                    offset,
                    rating: 'g',
                },
            });

            return response.data.data.map((gif: any) => ({
                id: gif.id,
                title: gif.title,
                url: gif.images.fixed_height.url,
                webp: gif.images.fixed_height.webp,
                mp4: gif.images.fixed_height.mp4,
                width: gif.images.fixed_height.width,
                height: gif.images.fixed_height.height,
                preview: gif.images.fixed_height_small.url,
            }));
        } catch (error: any) {
            logger.error('Failed to get trending GIFs:', error);
            throw new Error('Failed to get trending GIFs');
        }
    }

    /**
     * Get GIF by ID
     */
    async getGifById(id: string) {
        if (!GIPHY_API_KEY) {
            throw new Error('GIPHY_API_KEY not configured');
        }

        try {
            const response = await axios.get(`${GIPHY_BASE_URL}/${id}`, {
                params: {
                    api_key: GIPHY_API_KEY,
                },
            });

            const gif = response.data.data;
            return {
                id: gif.id,
                title: gif.title,
                url: gif.images.fixed_height.url,
                webp: gif.images.fixed_height.webp,
                mp4: gif.images.fixed_height.mp4,
                width: gif.images.fixed_height.width,
                height: gif.images.fixed_height.height,
                preview: gif.images.fixed_height_small.url,
            };
        } catch (error: any) {
            logger.error(`Failed to get GIF ${id}:`, error);
            throw new Error('Failed to get GIF');
        }
    }
}

export const giphyService = new GiphyService();
