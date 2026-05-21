import { api } from '@/lib/api';
import { getSocket } from './socket';

export interface ConversationUnreadData {
  conversationId: string;
  unreadCount: number;
  lastMessageId?: string;
  lastSeenAt?: string;
}

export async function fetchUnreadCounts(): Promise<Record<string, any>> {
  try {
    const data = await api.get<{ counts: Record<string, any> }>('/messages/unread/counts');
    return data.counts;
  } catch (err) {
    console.error('[LastSeen] Fetch unread counts failed:', err);
    return {};
  }
}

export function updateLastSeen(conversationId: string, lastMessageId?: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('update_last_seen', { conversationId, lastMessageId }, (response: any) => {
    if (!response?.success) {
      console.error('[LastSeen] Update failed:', response?.error);
    }
  });
}

export function markConversationRead(conversationId: string, lastMessageId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('mark_conversation_read', { conversationId, lastMessageId }, (response: any) => {
    if (!response?.success) {
      console.error('[LastSeen] Mark conversation read failed:', response?.error);
    }
  });
}

// Utility function to determine if a conversation is unread
export function isConversationUnread(unreadData: Record<string, any>, conversationId: string): boolean {
  return (unreadData[conversationId]?.unreadCount || 0) > 0;
}

// Get unread count for specific conversation
export function getUnreadCount(unreadData: Record<string, any>, conversationId: string): number {
  return unreadData[conversationId]?.unreadCount || 0;
}

// Get total unread count across all conversations
export function getTotalUnreadCount(unreadData: Record<string, any>): number {
  return Object.values(unreadData).reduce((sum: number, conv: any) => sum + (conv.unreadCount || 0), 0);
}
