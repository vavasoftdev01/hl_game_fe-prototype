import { io } from 'socket.io-client';

let socketInstance = null;

const initSocket = () => {
  if (!socketInstance) {
    console.log('Attempting to connect to WebSocket server...');
    socketInstance = io('http://localhost:8080', {
      transports: ['websocket', 'polling'], // Allow polling as fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected to WebSocket server');
      console.log('Socket ID:', socketInstance.id);
      console.log('Socket connection active:', socketInstance.connected);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      console.error('Error details:', error);
    });

    socketInstance.on('reconnect_attempt', (attempt) => {
      console.log('Reconnect attempt:', attempt);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('Reconnection failed after maximum attempts');
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected from WebSocket server. Reason:', reason);
    });

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socketInstance.on('chartUpdate', (data) => {
      console.log('Socket received chartUpdate:', data);
    });

    socketInstance.onAny((event, ...args) => {
      console.log('Socket received event:', event, args);
    });
  }
  return socketInstance;
};

export const getSocket = () => {
  return initSocket();
};