import { authService } from '../../services/authService';
import api from '../../services/api';

jest.mock('../../services/api');

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should call API with correct credentials', async () => {
      const mockResponse = {
        data: {
          user: { id: '1', username: 'test' },
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      };

      (api.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('register', () => {
    it('should call API with registration data', async () => {
      const mockResponse = {
        data: {
          user: { id: '1', username: 'newuser' },
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      };

      (api.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await authService.register({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });

      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse.data);
    });
  });
});
