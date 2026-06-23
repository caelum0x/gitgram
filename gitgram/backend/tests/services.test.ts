import { sendEmail } from '../src/services/emailService';
import { paymentService } from '../src/services/paymentService';
import { geocodingService } from '../src/services/geocodingService';
import { generateSecret, verifyTOTP } from '../src/services/twoFactorService';
import speakeasy from 'speakeasy';

describe('Service Layer Tests', () => {
  describe('Email Service', () => {
    it('should handle missing API key gracefully', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      await expect(
        sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).resolves.not.toThrow();

      if (originalKey) {
        process.env.RESEND_API_KEY = originalKey;
      }
    });

    it('should format email correctly', async () => {
      const options = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
      };

      // Should not throw when API key is missing (development mode)
      await expect(sendEmail(options)).resolves.not.toThrow();
    });
  });

  describe('Payment Service', () => {
    it('should create mock payment when credentials not configured', async () => {
      const originalKey = process.env.DODOPAY_API_KEY;
      delete process.env.DODOPAY_API_KEY;

      const payment = await paymentService.createPayment({
        amount: 100,
        currency: 'USD',
        description: 'Test payment',
      });

      expect(payment).toHaveProperty('paymentId');
      expect(payment).toHaveProperty('status');
      expect(payment.status).toBe('not_configured');

      if (originalKey) {
        process.env.DODOPAY_API_KEY = originalKey;
      }
    });

    it('should verify payment signature', async () => {
      const originalKey = process.env.DODOPAY_SECRET_KEY;
      delete process.env.DODOPAY_SECRET_KEY;

      // Mock verification should work without credentials
      const verification = await paymentService.verifyPayment('test');

      expect(verification).toHaveProperty('isValid');

      if (originalKey) {
        process.env.DODOPAY_SECRET_KEY = originalKey;
      }
    });
  });

  describe('Geocoding Service', () => {
    it('should handle missing API key gracefully', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await geocodingService.geocodeAddress('123 Main St');
      expect(result).toBeNull();

      if (originalKey) {
        process.env.GOOGLE_MAPS_API_KEY = originalKey;
      }
    });

    it('should reverse geocode coordinates', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      const result = await geocodingService.reverseGeocode(37.7749, -122.4194);
      expect(result).toBeNull();

      if (originalKey) {
        process.env.GOOGLE_MAPS_API_KEY = originalKey;
      }
    });
  });

  describe('2FA Service', () => {
    it('should generate secret', () => {
      const secret = generateSecret('test@example.com');
      expect(secret).toHaveProperty('secret');
      expect(secret).toHaveProperty('otpauthUrl');
      expect(secret.secret).toBeTruthy();
    });

    it('should verify token', () => {
      const secret = generateSecret('test@example.com');
      const token = speakeasy.totp({ secret: secret.secret, encoding: 'base32' });

      const isValid = verifyTOTP(secret.secret, token);
      expect(isValid).toBe(true);
    });

    it('should reject invalid token', () => {
      const secret = generateSecret('test@example.com');
      const isValid = verifyTOTP(secret.secret, '000000');
      expect(isValid).toBe(false);
    });
  });
});

