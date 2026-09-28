"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2, ListCollapse, List } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useAppContext } from '@/context/AppContext';
import { searchConversation, toPlainText, MIN_SEARCH_LENGTH, type MessageSearchResult } from '@/services/search';

const DEBOUNCE_MS = 250;

/** Splits text on the query so matches can be highlighted. */
function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

function formatWhen(timestamp: string): string {
  const d = new Date(timestamp);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, yyyy');
}

interface ChatSearchPanelProps {
  conversationId: string;
  /** Scrolls to the message and highlights it; resolves false when it couldn't be found. */
  onJumpToMessage: (messageId: string) => Promise<boolean> | boolean;
  onClose: () => void;
}

const ChatSearchPanel: React.FC<ChatSearchPanelProps> = ({ conversationId, onJumpToMessage, onClose }) => {
  const { state, dispatch } = useAppContext();
  const query = state.chatUI.searchQuery;

  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [jumpingId, setJumpingId] = useState<string | null>(null);
  // Closing the list keeps the search bar (and Enter/▲▼ "find next") active — it just
  // gets the result list out of the way so the chat underneath is visible, like Ctrl+F.
  const [listCollapsed, setListCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Search the whole conversation history on the server, debounced
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchConversation(trimmed, conversationId);
        if (found === null) return; // superseded by a newer keystroke
        setResults(found);
        setActiveIndex(0);
        setError(null);
        setListCollapsed(false); // a new search always shows its results first
      } catch {
        setError('Search failed. Check your connection and try again.');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, conversationId]);

  const senderName = (result: MessageSearchResult) => {
    if (String(result.sender?.id) === String(state.currentUser?.id)) return 'You';
    return result.sender?.name || state.users.find(u => String(u.id) === String(result.sender?.id))?.name || 'Unknown';
  };

  const jumpTo = async (index: number, collapseAfter = false) => {
    const result = results[index];
    if (!result) return;
    setActiveIndex(index);
    setJumpingId(result.id);
    try {
      const found = await onJumpToMessage(result.id);
      if (!found) setError('Could not open that message. Try scrolling up in the chat.');
      else {
        setError(null);
        // Picking a result from the list closes it so the message is visible in the chat;
        // Enter/▲▼ still "find" the next one without reopening it.
        if (collapseAfter) setListCollapsed(true);
      }
    } finally {
      setJumpingId(null);
    }
  };

  const step = (delta: number) => {
    if (results.length === 0) return;
    const next = (activeIndex + delta + results.length) % results.length;
    jumpTo(next);
  };

  // Keep the selected result visible in the list
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results.length]);

  const counter = useMemo(() => {
    if (results.length === 0) return '';
    return `${activeIndex + 1} of ${results.length}`;
  }, [activeIndex, results.length]);

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_SEARCH_LENGTH;

  return (
    <div className="border-b bg-card z-10 animate-in slide-in-from-top-2 duration-150">
      {/* Search input row */}
      <div className="px-3 md:px-6 py-2 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Search in this chat..."
          className="flex-1 h-8 bg-transparent border-none focus-visible:ring-0 px-0 text-sm"
          value={query}
          onChange={(e) => dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: true, query: e.target.value } })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
        />

        {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        {counter && <span className="text-[10px] font-bold text-muted-foreground tabular-nums shrink-0">{counter}</span>}

        <button
          onClick={() => step(-1)}
          disabled={results.length === 0}
          title="Previous match (Shift+Enter)"
          className="p-1 hover:bg-muted rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          onClick={() => step(1)}
          disabled={results.length === 0}
          title="Next match (Enter)"
          className="p-1 hover:bg-muted rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        {results.length > 0 && (
          <button
            onClick={() => setListCollapsed(v => !v)}
            title={listCollapsed ? 'Show result list' : 'Hide result list — keep using ▲▼/Enter to find'}
            className={cn('p-1 hover:bg-muted rounded-full text-muted-foreground', listCollapsed && 'bg-muted text-primary')}
          >
            {listCollapsed ? <List className="h-4 w-4" /> : <ListCollapse className="h-4 w-4" />}
          </button>
        )}
        <button onClick={onClose} title="Close search (Esc)" className="p-1 hover:bg-muted rounded-full text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Results — hidden while collapsed, but search + find-next/prev stay active */}
      {!listCollapsed && (query.trim().length >= MIN_SEARCH_LENGTH || tooShort || error) && (
        <div ref={listRef} className="max-h-[40vh] overflow-y-auto scrollbar-chat border-t border-border/60">
          {error ? (
            <p className="px-4 py-3 text-xs font-medium text-destructive">{error}</p>
          ) : tooShort ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Type at least {MIN_SEARCH_LENGTH} characters.</p>
          ) : results.length === 0 ? (
            !isSearching && <p className="px-4 py-3 text-xs text-muted-foreground">No messages found for “{query.trim()}”.</p>
          ) : (
            results.map((result, idx) => (
              <button
                key={result.id}
                data-active={idx === activeIndex}
                onClick={() => jumpTo(idx, true)}
                className={cn(
                  'w-full text-left px-4 py-2.5 border-b border-border/40 last:border-b-0 transition-colors flex flex-col gap-0.5',
                  idx === activeIndex ? 'bg-primary/10' : 'hover:bg-muted/60'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold truncate">{senderName(result)}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{formatWhen(result.timestamp)}</span>
                  {jumpingId === result.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
                  {highlight(toPlainText(result.content) || '(attachment)', query)}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ChatSearchPanel;
