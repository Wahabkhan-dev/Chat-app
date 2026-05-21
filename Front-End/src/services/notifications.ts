import { api } from '@/lib/api';
import { getSocket } from './socket';

export interface Notification {
  id: string;
  type: string;
  recipientId?: string;
  senderId?: string;
  conversationId?: string;
  messageId?: string;
  emoji?: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export async function fetchNotifications(): Promise<Notification[]> {
  try {
    const data = await api.get<{ notifications: any[] }>('/notifications');
    return data.notifications.map((n: any) => ({
      id: String(n.id),
      type: n.type,
      recipientId: n.recipient_id ? String(n.recipient_id) : undefined,
      senderId: n.sender_id ? String(n.sender_id) : undefined,
      conversationId: n.conversation_id ? String(n.conversation_id) : undefined,
      messageId: n.message_id ? String(n.message_id) : undefined,
      emoji: n.emoji || undefined,
      title: n.title,
      body: n.body,
      timestamp: n.created_at instanceof Date ? n.created_at.toISOString() : String(n.created_at),
      read: Boolean(n.is_read),
    }));
  } catch (err) {
    console.error('[Notifications] Fetch failed:', err);
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const data = await api.get<{ unreadCount: number }>('/notifications/unread/count');
    return data.unreadCount;
  } catch (err) {
    console.error('[Notifications] Unread count failed:', err);
    return 0;
  }
}

export function markNotificationRead(notificationId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('mark_notification_read', { notificationId }, (response: any) => {
    if (!response?.success) {
      console.error('[Notifications] Mark read failed:', response?.error);
    }
  });
}

export function markConversationNotificationsRead(conversationId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('mark_conversation_notifications_read', { conversationId }, (response: any) => {
    if (!response?.success) {
      console.error('[Notifications] Mark conversation notifications read failed:', response?.error);
    }
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const socket = getSocket();
  if (socket?.connected) {
    socket.emit('mark_all_notifications_read', (response: any) => {
      if (!response?.success) {
        console.error('[Notifications] Mark all read failed:', response?.error);
      }
    });
    return;
  }

  try {
    await api.post('/notifications/read', {});
  } catch (err) {
    console.error('[Notifications] Mark all read failed:', err);
  }
}

export async function createNotification(
  type: string,
  title: string,
  body: string,
  recipientId?: string
): Promise<Notification | null> {
  try {
    const data = await api.post<{ notification: any }>('/notifications', {
      type,
      title,
      body,
      recipientId: recipientId || null,
    });

    return {
      id: String(data.notification.id),
      type: data.notification.type,
      recipientId: data.notification.recipientId ? String(data.notification.recipientId) : undefined,
      title: data.notification.title,
      body: data.notification.body,
      timestamp: data.notification.timestamp || new Date().toISOString(),
      read: false,
    };
  } catch (err) {
    console.error('[Notifications] Create failed:', err);
    return null;
  }
}

export async function markAllRead(): Promise<boolean> {
  try {
    await api.post('/notifications/read', {});
    return true;
  } catch (err) {
    console.error('[Notifications] Mark all read (REST) failed:', err);
    return false;
  }
}
