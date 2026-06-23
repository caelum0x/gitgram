import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../constants/Config';
import { useAuthStore } from '../store/authStore';
import { logger } from '../utils/logger';

let socket: Socket | null = null;

export const initializeSocket = (): Socket | null => {
  const { accessToken } = useAuthStore.getState();
  
  if (!accessToken) {
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: {
      token: accessToken,
    },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    logger.log('Socket connected');
  });

  socket.on('disconnect', () => {
    logger.log('Socket disconnected');
  });

  socket.on('error', (error) => {
    logger.error('Socket error:', error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => {
  return socket;
};

