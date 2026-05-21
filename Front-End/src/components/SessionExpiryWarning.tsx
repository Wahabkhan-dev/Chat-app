/**
 * SessionExpiryWarning Component
 * Shows warning when session is about to expire
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { logoutUser } from '@/services/auth';
import { AlertCircle } from 'lucide-react';

export const SessionExpiryWarning: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { sessionWarning } = state;
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!sessionWarning.show) return null;

  const handleExtendSession = async () => {
    setIsRefreshing(true);
    try {
      const response = await api.post('/auth/refresh', {});
      if (response) {
        dispatch({ type: 'HIDE_SESSION_WARNING' });
        dispatch({
          type: 'ADD_TOAST',
          payload: {
            message: '✓ Session extended. You have another 7 days.',
            type: 'success',
          },
        });
      }
    } catch (error) {
      console.error('Failed to extend session:', error);
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          message: 'Failed to extend session. Please log in again.',
          type: 'error',
        },
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    dispatch({ type: 'LOGOUT' });
    dispatch({ type: 'HIDE_SESSION_WARNING' });
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
    }
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="h-6 w-6 text-yellow-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Session Expiring Soon
          </h2>
        </div>

        {/* Message */}
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Your session will expire in{' '}
          <span className="font-semibold text-red-600 dark:text-red-400">
            {formatTime(sessionWarning.secondsRemaining)}
          </span>
          .
        </p>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Would you like to extend your session or log out?
        </p>

        {/* Countdown indicator */}
        <div className="mb-6 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
            style={{
              width: `${Math.max(0, (sessionWarning.secondsRemaining / 300) * 100)}%`,
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleLogout}
            variant="outline"
            disabled={isRefreshing}
            className="flex-1"
          >
            Logout
          </Button>
          <Button
            onClick={handleExtendSession}
            disabled={isRefreshing}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {isRefreshing ? 'Extending...' : 'Extend Session'}
          </Button>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
          Last activity: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};
