import { getSocket } from './socket';

export interface Reaction {
  emoji: string;
  users: string[];
}

export function addReaction(
  messageId: string,
  conversationId: string,
  emoji: string
): void {
  const socket = getSocket();
  if (!socket) return;

  socket.emit(
    'react_message',
    { messageId, conversationId, emoji },
    (response: any) => {
      if (!response?.success) {
        console.error('[Reactions] Add reaction failed:', response?.error);
      }
    }
  );
}

export function removeReaction(
  messageId: string,
  conversationId: string,
  emoji: string
): void {
  const socket = getSocket();
  if (!socket) return;

  // Removing is done by reacting with the same emoji again (toggle)
  socket.emit(
    'react_message',
    { messageId, conversationId, emoji },
    (response: any) => {
      if (!response?.success) {
        console.error('[Reactions] Remove reaction failed:', response?.error);
      }
    }
  );
}

export function toggleReaction(
  messageId: string,
  conversationId: string,
  emoji: string
): void {
  // Same action for both add and remove - toggle
  addReaction(messageId, conversationId, emoji);
}

// List of supported emoji reactions for chat
export const SUPPORTED_REACTIONS = [
  '👍', '❤️', '😂', '😮', '😢', '😡',
  '🎉', '🚀', '✨', '👏', '🔥', '💯',
  '🙏', '😍', '🤔', '💪', '👌', '😎'
];

export function getReactionLabel(emoji: string): string {
  const labels: Record<string, string> = {
    '👍': 'Like',
    '❤️': 'Love',
    '😂': 'Haha',
    '😮': 'Wow',
    '😢': 'Sad',
    '😡': 'Angry',
    '🎉': 'Party',
    '🚀': 'Rocket',
    '✨': 'Sparkle',
    '👏': 'Applause',
    '🔥': 'Fire',
    '💯': 'Perfect',
    '🙏': 'Thanks',
    '😍': 'Love it',
    '🤔': 'Thinking',
    '💪': 'Strong',
    '👌': 'OK',
    '😎': 'Cool'
  };
  return labels[emoji] || emoji;
}
