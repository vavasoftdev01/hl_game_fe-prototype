import { create } from 'zustand';
import { getSocket } from '../utils/socket';

export const useStore = create((set, get) => ({
  chartData: null,
  chartInterval: '1s',
  init: () => {
    const socket = getSocket();
    socket.on('chartUpdate', (data) => {
      console.log('Store received chartUpdate:', data);
      set({ chartData: data });
      console.log('Updated chartData state:', get().chartData);
    });
  },
}));