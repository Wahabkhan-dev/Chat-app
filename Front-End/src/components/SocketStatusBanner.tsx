'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useSocketStatus } from '@/hooks/useSocketStatus';

const SocketStatusBanner: React.FC = () => {
  const { isConnected, isReconnecting } = useSocketStatus();

  // Only show the banner after the socket has connected at least once.
  // This prevents a false "Reconnecting" flash on initial page load.
  const everConnectedRef = useRef(false);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (isConnected) {
      if (everConnectedRef.current) {
        // Was connected → disconnected → now reconnected
        setShowReconnecting(false);
        setShowReconnected(true);
      }
      everConnectedRef.current = true;
    } else if (isReconnecting && everConnectedRef.current) {
      setShowReconnecting(true);
      setShowReconnected(false);
    }
  }, [isConnected, isReconnecting]);

  // Auto-hide the "Reconnected" flash after 3 s
  useEffect(() => {
    if (!showReconnected) return;
    const t = setTimeout(() => setShowReconnected(false), 3000);
    return () => clearTimeout(t);
  }, [showReconnected]);

  if (!showReconnecting && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 bg-green-600 text-white text-[11px] font-bold uppercase tracking-widest animate-in slide-in-from-top-2 fade-in duration-200">
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        Reconnected
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 px-4 bg-destructive text-white text-[11px] font-bold uppercase tracking-widest animate-in slide-in-from-top-2 fade-in duration-200">
      <WifiOff className="h-3.5 w-3.5 shrink-0 animate-pulse" />
      Reconnecting…
    </div>
  );
};

export default SocketStatusBanner;
