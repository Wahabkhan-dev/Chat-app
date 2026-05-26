'use client';

import { useEffect, useState } from 'react';
import { getSocketStatus, onSocketStatusChange, SocketStatus } from '@/services/socket';

export function useSocketStatus() {
  const [status, setStatus] = useState<SocketStatus>(getSocketStatus);

  useEffect(() => {
    // Sync immediately in case status changed between render and effect
    setStatus(getSocketStatus());
    return onSocketStatusChange(setStatus);
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
    isDisconnected: status === 'disconnected',
  };
}
