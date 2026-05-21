import { getSocket } from './socket';

export interface ReadReceipt {
  userId: string;
  readAt: string;
}

export function markMessageRead(messageId: string, conversationId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('mark_message_read', { messageId, conversationId }, (response: any) => {
    if (!response?.success) {
      console.error('[ReadReceipts] Mark message read failed:', response?.error);
    }
  });
}

export function getMessageReadReceipts(
  messageId: string,
  callback: (reads: ReadReceipt[]) => void
): void {
  const socket = getSocket();
  if (!socket) {
    callback([]);
    return;
  }

  socket.emit('get_message_reads', { messageId }, (response: any) => {
    if (response?.success) {
      callback(response.reads || []);
    } else {
      console.error('[ReadReceipts] Get reads failed:', response?.error);
      callback([]);
    }
  });
}

export function markConversationRead(conversationId: string, lastMessageId: string): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit('mark_conversation_read', { conversationId, lastMessageId }, (response: any) => {
    if (!response?.success) {
      console.error('[ReadReceipts] Mark conversation read failed:', response?.error);
    }
  });
}

export function requestReadReceipts(
  conversationId: string,
  messageIds: string[]
): Promise<Record<string, ReadReceipt[]>> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket) {
      resolve({});
      return;
    }

    let completed = 0;
    const results: Record<string, ReadReceipt[]> = {};

    messageIds.forEach((msgId) => {
      getMessageReadReceipts(msgId, (reads) => {
        results[msgId] = reads;
        completed++;
        if (completed === messageIds.length) {
          resolve(results);
        }
      });
    });
  });
}
