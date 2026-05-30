import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';

export type ConversationMetadataAction = 'block' | 'unblock' | 'mute' | 'unmute' | 'pin' | 'unpin';

export interface ConversationListItem {
  conversationId: string;
  type: 'dm' | 'group';
  lastMessageAt: string | null;
  lastMessageContent: string;
  lastMessageSenderId: string;
}

export async function fetchConversationMetadata() {
  const response = await api.get<{ metadata: Record<string, any> }>('/conversation-metadata');
  return response.metadata || {};
}

export async function fetchConversationList(): Promise<ConversationListItem[]> {
  const response = await api.get<{ conversations: ConversationListItem[] }>('/conversation-metadata/conversations/list');
  return response.conversations || [];
}

export async function setConversationBlockStatus(conversationId: string, isBlocked: boolean) {
  const endpoint = `/conversation-metadata/${encodeURIComponent(conversationId)}/${isBlocked ? 'block' : 'unblock'}`;
  const response = await api.post<{ success: boolean }>(endpoint, {});
  return response.success;
}

export async function muteConversation(conversationId: string, muteUntil: string | null) {
  const response = await api.post<{ success: boolean }>(
    `/conversation-metadata/${encodeURIComponent(conversationId)}/mute`,
    { mutedUntil: muteUntil }
  );
  return response.success;
}

export async function unmuteConversation(conversationId: string) {
  const response = await api.post<{ success: boolean }>(
    `/conversation-metadata/${encodeURIComponent(conversationId)}/unmute`,
    {}
  );
  return response.success;
}

export async function markConversationUnread(conversationId: string) {
  const response = await api.post<{ success: boolean }>(
    `/conversation-metadata/${encodeURIComponent(conversationId)}/mark-unread`,
    {}
  );
  return response.success;
}

export async function markConversationRead(conversationId: string) {
  const response = await api.post<{ success: boolean }>(
    `/conversation-metadata/${encodeURIComponent(conversationId)}/mark-read`,
    {}
  );
  return response.success;
}

export function emitConversationMetadataChanged(conversationId: string, action: ConversationMetadataAction, value: boolean) {
  const socket = getSocket();
  if (!socket?.connected) return;
  socket.emit('conversation_metadata_changed', { conversationId, action, value }, (ack: any) => {
    if (!ack?.success) {
      console.warn('[conversationMetadata] metadata change emit failed', ack?.error);
    }
  });
}
