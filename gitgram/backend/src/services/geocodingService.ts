import { Client } from '@googlemaps/google-maps-services-js';
import logger from '../utils/logger';

const client = new Client({});

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  placeId?: string;
}

export const geocodingService = {
  async geocodeAddress(address: string): Promise<GeocodeResult | null> {
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        logger.warn('Google Maps API key not configured, returning null');
        return null;
      }

      const response = await client.geocode({
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        const location = result.geometry.location;

        return {
          latitude: location.lat,
          longitude: location.lng,
          formattedAddress: result.formatted_address,
          placeId: result.place_id,
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Geocode address error:', error);
      return null;
    }
  },

  async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    try {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        logger.warn('Google Maps API key not configured, returning null');
        return null;
      }

      const response = await client.reverseGeocode({
        params: {
          latlng: { lat: latitude, lng: longitude },
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }

      return null;
    } catch (error: any) {
      logger.error('Reverse geocode error:', error);
      return null;
    }
  },
};

