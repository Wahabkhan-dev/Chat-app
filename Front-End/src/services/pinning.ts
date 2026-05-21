import { api } from '@/lib/api';
import { getSocket } from './socket';

export interface PinnedMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: string;
  isPinned: boolean;
}

export function pinMessage(messageId: string, conversationId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('pin_message', { messageId, conversationId }, (response: any) => {
    if (!response?.success) {
      console.error('[Pinning] Pin message failed:', response?.error);
    }
  });
}

export function unpinMessage(conversationId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('unpin_message', { conversationId }, (response: any) => {
    if (!response?.success) {
      console.error('[Pinning] Unpin message failed:', response?.error);
    }
  });
}

export async function getPinnedMessage(conversationId: string): Promise<PinnedMessage | null> {
  try {
    const data = await api.get<{ pinnedMessage: any }>(`/messages/${conversationId}/pinned`);
    return data.pinnedMessage;
  } catch (err) {
    console.error('[Pinning] Get pinned message failed:', err);
    return null;
  }
}
