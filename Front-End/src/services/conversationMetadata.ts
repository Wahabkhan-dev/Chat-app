import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';

export type ConversationMetadataAction = 'block' | 'unblock' | 'mute' | 'unmute' | 'pin' | 'unpin';

export async function fetchConversationMetadata() {
  const response = await api.get<{ metadata: Record<string, any> }>('/conversation-metadata');
  return response.metadata || {};
}

export async function setConversationBlockStatus(conversationId: string, isBlocked: boolean) {
  const endpoint = `/conversation-metadata/${encodeURIComponent(conversationId)}/${isBlocked ? 'block' : 'unblock'}`;
  const response = await api.post<{ success: boolean }>(endpoint, {});
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
