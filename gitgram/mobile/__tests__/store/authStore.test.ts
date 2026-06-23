import { renderHook, act } from '@testing-library/react-native';
import { useAuthStore } from '../../store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.logout();
    });
  });

  it('should initialize with null user', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should login and store tokens', async () => {
    const { result } = renderHook(() => useAuthStore());
    const user = { id: '1', username: 'test', email: 'test@example.com' };

    await act(async () => {
      await result.current.login(user, 'accessToken', 'refreshToken');
    });

    expect(result.current.user).toEqual(user);
    expect(result.current.accessToken).toBe('accessToken');
    expect(result.current.refreshToken).toBe('refreshToken');
    expect(result.current.isAuthenticated).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('accessToken', 'accessToken');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('refreshToken', 'refreshToken');
  });

  it('should logout and clear tokens', async () => {
    const { result } = renderHook(() => useAuthStore());
    const user = { id: '1', username: 'test', email: 'test@example.com' };

    await act(async () => {
      await result.current.login(user, 'accessToken', 'refreshToken');
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('accessToken');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('refreshToken');
  });
});

