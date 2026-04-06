import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useGameStore } from '../store/gameStore.js';
import { useToastStore } from '../store/toastStore.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', { withCredentials: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function useGameSocket() {
  const store = useGameStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const currentRoomId = useGameStore(s => s.currentRoomId);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => s.emit('room:join', { roomId: currentRoomId });
    if (s.connected) {
      s.emit('room:join', { roomId: currentRoomId });
    } else {
      s.once('connect', onConnect);
    }
    return () => s.off('connect', onConnect);
  }, [currentRoomId]);

  useEffect(() => {
    const s = getSocket();
    const showToast = useToastStore.getState().show;

    const on = (event, handler) => s.on(event, (...args) => handler(...args));

    on('game:status', data => storeRef.current.handleStatus(data));
    on('game:start', data => storeRef.current.handleGameStart(data));
    on('game:betting_window', data => storeRef.current.handleBettingWindow(data));
    on('game:betting_closed', data => storeRef.current.handleBettingClosed(data));
    on('game:hand_start', data => storeRef.current.handleHandStart(data));
    on('game:thinking', data => storeRef.current.handleThinking(data));
    on('game:action', data => storeRef.current.handleAction(data));
    on('game:showdown', data => storeRef.current.handleShowdown(data));
    on('game:hand_end', data => storeRef.current.handleHandEnd(data));
    on('game:end', data => storeRef.current.handleGameEnd(data));
    on('game:payouts', data => storeRef.current.handlePayouts(data));
    on('chat:message', data => storeRef.current.addChatMessage(data));
    on('room:lobby', data => storeRef.current.handleLobbyUpdate(data));
    on('room:lobby_error', data => storeRef.current.handleLobbyError(data));
    on('server:online', data => storeRef.current.setOnlineCount(data.count));
    on('room:error', data => showToast(data.error, 'error'));
    on('seat:error', data => showToast(data.error, 'error'));

    return () => {
      [
        'game:status', 'game:start', 'game:betting_window', 'game:betting_closed',
        'game:hand_start', 'game:thinking', 'game:action', 'game:showdown',
        'game:hand_end', 'game:end', 'game:payouts', 'chat:message', 'room:lobby',
        'room:lobby_error', 'server:online', 'room:error', 'seat:error',
      ].forEach(e => s.off(e));
    };
  }, []);
}
