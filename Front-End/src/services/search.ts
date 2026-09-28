import { api } from '@/lib/api';

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user';
  status: 'online' | 'away' | 'offline' | 'dnd';
  department: string;
}

export interface MessageSearchResult {
  id: string;
  conversationId: string;
  content: string;
  sender: {
    id: string;
    name: string;
    avatar: string;
  } | null;
  timestamp: string;
  type: string;
}

// The server ignores anything shorter than this
export const MIN_SEARCH_LENGTH = 2;

// Debounce search requests
let searchTimeout: NodeJS.Timeout;

export async function searchUsers(query: string, limit = 20): Promise<UserSearchResult[]> {
  if (!query || query.length < 2) return [];

  try {
    const data = await api.get<{ results: UserSearchResult[] }>(`/users/search/${encodeURIComponent(query)}?limit=${limit}`);
    return data.results || [];
  } catch (err) {
    console.error('[Search] User search failed:', err);
    return [];
  }
}

export async function searchMessages(
  query: string,
  conversationId?: string,
  limit = 50,
  offset = 0
): Promise<MessageSearchResult[]> {
  if (!query || query.length < 2) return [];

  try {
    let url = `/messages/search/${encodeURIComponent(query)}?limit=${limit}&offset=${offset}`;
    if (conversationId) {
      url += `&conversationId=${encodeURIComponent(conversationId)}`;
    }

    const data = await api.get<{ results: MessageSearchResult[] }>(url);
    return data.results || [];
  } catch (err) {
    console.error('[Search] Message search failed:', err);
    return [];
  }
}

/**
 * Search one conversation's full history on the server. Each call cancels the previous one,
 * so results from an older keystroke can never overwrite newer ones.
 */
let conversationSearchController: AbortController | null = null;

export async function searchConversation(
  query: string,
  conversationId: string,
  limit = 100,
): Promise<MessageSearchResult[] | null> {
  conversationSearchController?.abort();
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH || !conversationId) return [];

  const controller = new AbortController();
  conversationSearchController = controller;
  try {
    const data = await api.get<{ results: MessageSearchResult[] }>(
      `/messages/search/${encodeURIComponent(trimmed)}?limit=${limit}&conversationId=${encodeURIComponent(conversationId)}`,
      { signal: controller.signal },
    );
    return data.results || [];
  } catch (err) {
    // Superseded by a newer keystroke — the caller should keep showing what it has
    if ((err as Error).name === 'AbortError') return null;
    console.error('[Search] Conversation search failed:', err);
    throw err;
  } finally {
    if (conversationSearchController === controller) conversationSearchController = null;
  }
}

/** Mentions are stored as @[Name](id) — show them as @Name in result snippets. */
export function toPlainText(content: string): string {
  return (content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

export function debouncedSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  delay = 300
): (query: string) => Promise<T[]> {
  return (query: string) => {
    return new Promise((resolve) => {
      clearTimeout(searchTimeout);

      searchTimeout = setTimeout(async () => {
        const results = await searchFn(query);
        resolve(results);
      }, delay);
    });
  };
}

// Create debounced versions
export const debouncedUserSearch = debouncedSearch((query) => searchUsers(query, 30));
export const debouncedMessageSearch = debouncedSearch((query) => searchMessages(query, undefined, 50));

// Filter utilities
export function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export function getRelevanceScore(item: any, query: string): number {
  let score = 0;

  if (item.name) {
    if (item.name.toLowerCase().startsWith(query.toLowerCase())) score += 3;
    if (item.name.toLowerCase().includes(query.toLowerCase())) score += 2;
  }

  if (item.email && item.email.toLowerCase().includes(query.toLowerCase())) {
    score += 1;
  }

  if (item.content && item.content.toLowerCase().includes(query.toLowerCase())) {
    score += 1;
  }

  return score;
}
