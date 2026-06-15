
"use client";

import React, { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react';
import { User, UserStatus } from '@/mock/users';
import { Group } from '@/mock/groups';
import { Message, MessageFile } from '@/mock/messages';
import { SharedFile } from '@/mock/files';
import { getCurrentUser } from '@/services/auth';
import { api } from '@/lib/api';
import { getToken } from '@/lib/api';
import { loadSettings, onSettingsChanged, onSettingsCleared, UserSettings } from '@/services/settings';
import { fetchConversationMetadata, fetchConversationList } from '@/services/conversationMetadata';
import { setupCrossTabSync } from '@/services/session';

export type AppView = 'chat' | 'admin' | 'files' | 'settings';
export type ConversationType = 'dm' | 'group';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ModalType = 'createGroup' | 'createUser' | 'editUser' | 'addMember' | 'confirm' | 'editGroup' | 'userProfile' | 'blockUser' | 'kickMember' | 'leaveGroup' | 'transferOwnership' | null;

export interface ActiveConversation {
  type: ConversationType;
  id: string;
  name: string;
  avatar: string | null;
}

export interface AppNotification {
  id: string;
  type: 'dm_message' | 'group_message' | 'mention' | 'group_added' | 'kicked' | 'promoted' | 'demoted' | 'broadcast' | 'user_joined' | 'ownership_transferred' | 'reaction';
  recipientId: string;
  senderId?: string;
  conversationId?: string;
  messageId?: string;
  emoji?: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  onUndo?: () => void;
}

export interface ConversationMeta {
  muted: boolean;
  muteUntil: string | null;
  mutedAt: string | null;
  pinned: boolean;
  pinnedAt: string | null;
  blocked: boolean;
  blockedAt: string | null;
  hidden: boolean;
  unreadCount: number;
  hasUnreadMention: boolean;
  /** True when the server has a conversation_metadata row for this conversation.
   *  Determines Chats vs Users section — set by LOAD_CONVERSATION_LIST and LOAD_MESSAGES. */
  chatTracked?: boolean;
  /** True when the user explicitly clicked "Mark as Unread". Stored in conversation_metadata.is_unread.
   *  Cleared automatically when the conversation is opened. */
  isManuallyUnread?: boolean;
  leftAt?: string;
  leftReason?: 'left' | 'removed';
  lastReadAt?: string;
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: string;
  };
}

function normalizeServerConversationMeta(rawMeta: Record<string, any>): Record<string, ConversationMeta> {
  return Object.entries(rawMeta).reduce((acc, [conversationId, meta]) => {
    const isManuallyUnread = Boolean(meta.isUnread);
    acc[conversationId] = {
      muted: Boolean(meta.isMuted),
      muteUntil: meta.mutedUntil || null,
      mutedAt: meta.updatedAt || null,
      pinned: Boolean(meta.isPinned),
      pinnedAt: meta.updatedAt || null,
      blocked: Boolean(meta.isBlocked),
      blockedAt: meta.updatedAt || null,
      hidden: Boolean(meta.isHidden),
      isManuallyUnread,
      unreadCount: isManuallyUnread ? 1 : 0,
      hasUnreadMention: false,
      // A row existing in conversation_metadata means the user has interacted with this DM.
      // Set chatTracked so the sidebar shows it under Chats even before LOAD_CONVERSATION_LIST fires.
      ...(conversationId.startsWith('dm_') ? { chatTracked: true } : {}),
      ...(meta.leftAt ? { leftAt: meta.leftAt } : {}),
      ...(meta.leftReason ? { leftReason: meta.leftReason } : {}),
      ...(meta.lastReadAt ? { lastReadAt: meta.lastReadAt } : {}),
      ...(meta.lastMessage ? { lastMessage: meta.lastMessage } : {}),
    };
    return acc;
  }, {} as Record<string, ConversationMeta>);
}

export interface InAppNotification {
  id: string;
  conversationId: string;
  conversationName: string;
  conversationType: 'dm' | 'group';
  senderName: string;
  senderAvatar: string;
  message: string;
  timestamp: string;
}

export interface UploadedFile {
  file: File;
  previewUrl: string;
  name: string;
  size: string;
  type: string;
  mimeType?: string;
}

const normalizeUser = (user: any): User => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar || '',
  status: user.status || 'offline',
  department: user.department || '',
  createdAt: user.created_at ? String(user.created_at) : new Date().toISOString(),
  isActive: user.is_active === 1,
});

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  activeView: AppView;
  users: User[];
  groups: Group[];
  messages: Record<string, Message[]>;
  pinnedMessages: Record<string, Message | null>;
  sharedFiles: SharedFile[];
  activeConversation: ActiveConversation | null;
  conversationMeta: Record<string, ConversationMeta>;
  typingUsers: Record<string, string[]>;
  notifications: AppNotification[];
  inAppNotifications: InAppNotification[];
  theme: ThemePreference;
  userSettings: UserSettings | null;
  sessionWarning: { show: boolean; secondsRemaining: number };
  replyingTo: Message | null;
  forwardingMessage: Message | null;
  activeModal: ModalType;
  modalData: any;
  toasts: Toast[];
  mediaGallery: {
    open: boolean;
    items: MessageFile[];
    currentIndex: number;
  };
  chatUI: {
    editingMessageId: string | null;
    searchQuery: string;
    isSearchActive: boolean;
    uploadedFiles: UploadedFile[];
    isUploading: boolean;
  };
  rightPanel: {
    open: boolean;
    activeTab: 'members' | 'about' | 'media' | 'files' | 'links' | 'settings';
    mediaView: 'grid' | 'list';
    filesSort: 'newest' | 'largest' | 'nameAZ';
  };
  // removed: messageReads — was written but never read
  // PHASE 5: Draft state per conversation
  drafts: Record<string, { content: string; fileNames: string[] }>; // Record<conversationId, draft>
}

type AppAction =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'LOAD_SETTINGS'; payload: UserSettings }
  | { type: 'UPDATE_SETTING'; payload: Partial<UserSettings> }
  | { type: 'LOAD_SHARED_FILES'; payload: SharedFile[] }
  | { type: 'SHOW_SESSION_WARNING'; payload: number }
  | { type: 'HIDE_SESSION_WARNING' }
  | { type: 'SET_ACTIVE_VIEW'; payload: AppView }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_GROUPS'; payload: Group[] }
  | { type: 'LOAD_MESSAGES'; payload: { conversationId: string; messages: Message[] } }
  | { type: 'UPDATE_USER_STATUS'; payload: { userId: string; status: UserStatus } }
  | { type: 'SET_EDITING_MESSAGE'; payload: string | null }
  | { type: 'SET_MESSAGE_REACTIONS'; payload: { conversationId: string; messageId: string; reactions: { emoji: string; users: string[] }[] } }
  | { type: 'CLEAR_TYPING'; payload: { conversationId: string; userId: string } }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'CREATE_USER'; payload: User }
  | { type: 'DELETE_USER'; payload: string }
  | { type: 'DEACTIVATE_USER'; payload: string }
  | { type: 'REACTIVATE_USER'; payload: string }
  | { type: 'CREATE_GROUP'; payload: Group }
  | { type: 'RECEIVE_NEW_GROUP'; payload: Group }
  | { type: 'UPDATE_GROUP'; payload: Group }
  | { type: 'DELETE_GROUP'; payload: string }
  | { type: 'ADD_GROUP_MEMBERS'; payload: { groupId: string; userIds: string[]; systemMessage: Message } }
  | { type: 'REMOVE_GROUP_MEMBER'; payload: { groupId: string; userId: string; systemMessage: Message } }
  | { type: 'UPDATE_GROUP_SETTINGS'; payload: { groupId: string; settings: any } }
  | { type: 'SEND_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'EDIT_MESSAGE'; payload: { conversationId: string; messageId: string; newContent: string; editedAt: string } }
  | { type: 'DELETE_MESSAGE'; payload: { conversationId: string; messageId: string; deletedBy: string; deletedAt: string } }
  | { type: 'SET_MESSAGE_STATUS'; payload: { conversationId: string; messageId: string; status: Message['status'] } }
  | { type: 'SET_ACTIVE_CONVERSATION'; payload: ActiveConversation | null }
  | { type: 'PIN_CONVERSATION'; payload: string }
  | { type: 'UNPIN_CONVERSATION'; payload: string }
  | { type: 'MUTE_CONVERSATION'; payload: { conversationId: string; muteUntil: string | null } }
  | { type: 'UNMUTE_CONVERSATION'; payload: string }
  | { type: 'BLOCK_USER'; payload: string }
  | { type: 'UNBLOCK_USER'; payload: string }
  | { type: 'HYDRATE_CONVERSATION_META'; payload: Record<string, ConversationMeta> }
  | { type: 'SET_TYPING'; payload: { conversationId: string; userName: string; isTyping: boolean } }
  | { type: 'ADD_NOTIFICATION'; payload: AppNotification }
  | { type: 'MARK_NOTIFICATIONS_READ' }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_NOTIFICATIONS_READ_BY_IDS'; payload: string[] }
  | { type: 'MARK_CONVERSATION_NOTIFICATIONS_READ'; payload: string }
  | { type: 'PUSH_IN_APP_NOTIFICATION'; payload: InAppNotification }
  | { type: 'DISMISS_IN_APP_NOTIFICATION'; payload: string }
  | { type: 'OPEN_MODAL'; payload: { type: ModalType; data?: any } }
  | { type: 'CLOSE_MODAL' }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: number }
  | { type: 'SET_REPLYING_TO'; payload: Message | null }
  | { type: 'SET_FORWARDING_MESSAGE'; payload: Message | null }
  | { type: 'SET_CHAT_SEARCH'; payload: { active: boolean; query: string } }
  | { type: 'ADD_REACTION'; payload: { conversationId: string; messageId: string; emoji: string; userId: string } }
  | { type: 'TOGGLE_RIGHT_PANEL'; payload?: boolean }
  | { type: 'SET_RIGHT_PANEL_TAB'; payload: AppState['rightPanel']['activeTab'] }
  | { type: 'SET_MEDIA_VIEW'; payload: AppState['rightPanel']['mediaView'] }
  | { type: 'SET_FILES_SORT'; payload: AppState['rightPanel']['filesSort'] }
  | { type: 'PROMOTE_TO_ADMIN'; payload: { groupId: string; userId: string; systemMessage?: Message } }
  | { type: 'DEMOTE_FROM_ADMIN'; payload: { groupId: string; userId: string; systemMessage?: Message } }
  | { type: 'TRANSFER_ADMIN_AND_LEAVE'; payload: { groupId: string; leavingUserId: string; newAdminId: string; systemMessages: Message[] } }
  | { type: 'TRANSFER_OWNERSHIP'; payload: { groupId: string; oldOwnerId: string; newOwnerId: string; systemMessage: Message } }
  // PHASE 3: Read status actions
  | { type: 'CONVERSATION_READ'; payload: { conversationId: string; userId: string } }
  // PHASE 5: Draft actions
  | { type: 'UPDATE_DRAFT'; payload: { conversationId: string; content: string; fileNames: string[] } }
  | { type: 'CLEAR_DRAFT'; payload: string }
  | { type: 'OPEN_GALLERY'; payload: { items: MessageFile[]; index: number } }
  | { type: 'CLOSE_GALLERY' }
  | { type: 'NAVIGATE_GALLERY'; payload: number }
  | { type: 'SET_THEME'; payload: ThemePreference }
  | { type: 'MARK_CONVERSATION_READ'; payload: string }
  | { type: 'MARK_CONVERSATION_UNREAD'; payload: string }
  | { type: 'UNDO_DELETE'; payload: { conversationId: string; messageId: string } }
  | { type: 'PIN_MESSAGE'; payload: { conversationId: string; message: Message } }
  | { type: 'UNPIN_MESSAGE'; payload: string }
  | { type: 'ADD_UPLOADED_FILES'; payload: UploadedFile[] }
  | { type: 'REMOVE_UPLOADED_FILE'; payload: number }
  | { type: 'CLEAR_UPLOADED_FILES' }
  | { type: 'SET_UPLOADING'; payload: boolean }
  | { type: 'RESTORE_CONVERSATION_META'; payload: Record<string, ConversationMeta> }
  | { type: 'LOAD_CONVERSATION_LIST'; payload: Array<{ conversationId: string; type: string; lastMessageAt: string | null; lastMessageContent: string; lastMessageSenderId: string }> }
  | { type: 'UPDATE_UNREAD_COUNTS'; payload: { counts: Record<string, number>; previews?: Record<string, { senderId: string; content: string; timestamp: string }> } }
  | { type: 'DISMISS_LEFT_GROUP'; payload: string }
  | { type: 'REJOIN_GROUP'; payload: Group };

const initialState: AppState = {
  currentUser: null,
  isAuthenticated: false,
  activeView: 'chat',
  users: [],
  groups: [],
  messages: {},
  pinnedMessages: {},
  sharedFiles: [],
  activeConversation: null,
  conversationMeta: {},
  typingUsers: {},
  notifications: [],
  inAppNotifications: [],
  theme: 'system',
  userSettings: null,
  sessionWarning: { show: false, secondsRemaining: 0 },
  replyingTo: null,
  forwardingMessage: null,
  activeModal: null,
  modalData: null,
  toasts: [],
  mediaGallery: { open: false, items: [], currentIndex: 0 },
  chatUI: {
    editingMessageId: null,
    searchQuery: '',
    isSearchActive: false,
    uploadedFiles: [],
    isUploading: false,
  },
  rightPanel: {
    open: false,
    activeTab: 'about',
    mediaView: 'grid',
    filesSort: 'newest'
  },
  drafts: {},
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, currentUser: action.payload, isAuthenticated: true };
    case 'LOGOUT':
      return { ...initialState };
    case 'LOAD_SETTINGS':
      return {
        ...state,
        userSettings: action.payload,
        theme: action.payload.theme,
      };
    case 'LOAD_SHARED_FILES':
      return {
        ...state,
        sharedFiles: action.payload,
      };
    case 'UPDATE_SETTING':
      return {
        ...state,
        userSettings: state.userSettings
          ? { ...state.userSettings, ...action.payload }
          : null,
        theme:
          action.payload.theme && state.userSettings
            ? action.payload.theme
            : state.theme,
      };
    case 'SHOW_SESSION_WARNING':
      return {
        ...state,
        sessionWarning: {
          show: true,
          secondsRemaining: action.payload,
        },
      };
    case 'HIDE_SESSION_WARNING':
      return {
        ...state,
        sessionWarning: { show: false, secondsRemaining: 0 },
      };
    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.payload, activeModal: null };
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'LOAD_MESSAGES': {
      const { conversationId: loadConvId, messages: loadedMsgs } = action.payload;
      const existingLoadMeta = state.conversationMeta[loadConvId] || { muted: false, muteUntil: null, mutedAt: null, pinned: false, pinnedAt: null, blocked: false, blockedAt: null, hidden: false, unreadCount: 0, hasUnreadMention: false };
      const latestMsg = loadedMsgs.length > 0 ? loadedMsgs[loadedMsgs.length - 1] : null;

      // Extract file attachments from history so the shared-assets panel shows them
      const historyFiles: SharedFile[] = loadedMsgs.flatMap(msg => [
        ...(msg.files || []).filter((f: any) => f.name).map((f: any) => ({
          id: `f_${msg.id}_${f.key || f.name}`,
          name: f.name,
          size: f.size || '',
          type: f.type || 'other',
          key: f.key,
          uploadedBy: msg.senderId,
          conversationId: loadConvId,
          timestamp: msg.timestamp,
          previewUrl: f.url,
        })),
        ...((msg.links || []) as any[]).filter((l: any) => l.url).map((l: any) => ({
          id: `l_${msg.id}_${l.url}`,
          name: l.title || l.url,
          size: l.domain || '',
          type: 'link' as const,
          uploadedBy: msg.senderId,
          conversationId: loadConvId,
          timestamp: msg.timestamp,
          previewUrl: l.url,
        })),
      ]);

      return {
        ...state,
        messages: { ...state.messages, [loadConvId]: loadedMsgs },
        sharedFiles: [
          ...state.sharedFiles,
          ...historyFiles.filter((file) => !state.sharedFiles.some((existing) => existing.id === file.id)),
        ],
        conversationMeta: {
          ...state.conversationMeta,
          [loadConvId]: {
            ...existingLoadMeta,
            chatTracked: true,
            unreadCount: 0,
            hasUnreadMention: false,
            isManuallyUnread: false,
            lastReadAt: latestMsg ? latestMsg.timestamp : new Date().toISOString(),
            ...(latestMsg ? {
              lastMessage: {
                // Respect soft-deletes — a deleted last message must show the placeholder in the
                // sidebar, not leak its original text back in when the chat is opened.
                content: latestMsg.isDeleted
                  ? 'This message was deleted'
                  : (latestMsg.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1'),
                senderId: latestMsg.senderId,
                timestamp: latestMsg.timestamp,
              },
            } : {}),
          },
        },
      };
    }
    case 'PREPEND_MESSAGES': {
      const { conversationId: prependConvId, messages: messagesToPrepend } = action.payload;
      const existing = state.messages[prependConvId] || [];
      // Prepend new messages to the beginning (oldest messages first when loading history)
      return {
        ...state,
        messages: { ...state.messages, [prependConvId]: [...messagesToPrepend, ...existing] },
      };
    }
    case 'UPDATE_USER_STATUS':
      return {
        ...state,
        users: state.users.map(u => u.id === action.payload.userId ? { ...u, status: action.payload.status } : u),
      };
    case 'SET_EDITING_MESSAGE':
      return { ...state, chatUI: { ...state.chatUI, editingMessageId: action.payload } };
    case 'UPDATE_USER':
      return { 
        ...state, 
        users: state.users.map(u => u.id === action.payload.id ? action.payload : u),
        currentUser: state.currentUser?.id === action.payload.id ? action.payload : state.currentUser
      };
    case 'CREATE_USER':
      // Deduplicate — socket event and modal dispatch can both fire for the same user
      if (state.users.some(u => u.id === action.payload.id)) return state;
      return { ...state, users: [...state.users, action.payload] };
    case 'DELETE_USER':
      return { ...state, users: state.users.filter(u => u.id !== action.payload) };
    case 'DEACTIVATE_USER':
      return {
        ...state,
        users: state.users.map(u => u.id === action.payload ? { ...u, isActive: false, status: 'offline' } : u)
      };
    case 'REACTIVATE_USER':
      return {
        ...state,
        users: state.users.map(u => u.id === action.payload ? { ...u, isActive: true } : u)
      };
    case 'CREATE_GROUP':
      if (state.groups.some(g => g.id === action.payload.id)) return state;
      return { ...state, groups: [...state.groups, action.payload], activeConversation: { type: 'group', id: action.payload.id, name: action.payload.name, avatar: action.payload.avatar } };
    case 'RECEIVE_NEW_GROUP':
      if (state.groups.some(g => g.id === action.payload.id)) return state;
      return { ...state, groups: [...state.groups, action.payload] };
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.id ? action.payload : g),
        activeConversation: state.activeConversation?.id === action.payload.id
          ? { ...state.activeConversation, name: action.payload.name, avatar: action.payload.avatar ?? undefined }
          : state.activeConversation,
      };
    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter(g => g.id !== action.payload),
        activeConversation: state.activeConversation?.id === action.payload ? null : state.activeConversation
      };
    case 'DISMISS_LEFT_GROUP': {
      const { [action.payload]: _meta, ...restMeta } = state.conversationMeta;
      const { [action.payload]: _msgs, ...restMessages } = state.messages;
      return {
        ...state,
        groups: state.groups.filter(g => g.id !== action.payload),
        conversationMeta: restMeta,
        messages: restMessages,
        activeConversation: state.activeConversation?.id === action.payload ? null : state.activeConversation,
      };
    }
    case 'REJOIN_GROUP': {
      const gid = action.payload.id;
      const { leftAt: _leftAt, ...existingMeta } = state.conversationMeta[gid] || {};
      const groupInState = state.groups.some(g => g.id === gid);
      return {
        ...state,
        // Add the group if it was removed after a kick+refresh, otherwise update it
        groups: groupInState
          ? state.groups.map(g => g.id === gid ? action.payload : g)
          : [...state.groups, action.payload],
        conversationMeta: {
          ...state.conversationMeta,
          // Spread without leftAt / leftReason — this is what makes the group show as active again
          [gid]: { ...existingMeta, unreadCount: 0, hasUnreadMention: false },
        },
      };
    }
    case 'ADD_GROUP_MEMBERS':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? { ...g, members: [...new Set([...g.members, ...action.payload.userIds])] } : g),
        messages: { ...state.messages, [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), action.payload.systemMessage] }
      };
    case 'REMOVE_GROUP_MEMBER': {
      const isLeavingSelf = state.currentUser?.id === action.payload.userId;
      return {
        ...state,
        groups: state.groups.map(g => {
          if (g.id !== action.payload.groupId) return g;

          const newMembers = g.members.filter(m => m !== action.payload.userId);
          const newAdmins = g.admins.filter(a => a !== action.payload.userId);
          let newOwnerId = g.ownerId;

          if (action.payload.userId === g.ownerId) {
            newOwnerId = newAdmins[0] || newMembers[0] || '';
          }

          return { ...g, members: newMembers, admins: newAdmins, ownerId: newOwnerId };
        }),
        messages: { ...state.messages, [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), action.payload.systemMessage] },
        conversationMeta: isLeavingSelf
          ? {
              ...state.conversationMeta,
              [action.payload.groupId]: {
                ...(state.conversationMeta[action.payload.groupId] || { muted: false, pinned: false, unreadCount: 0, hasUnreadMention: false }),
                leftAt: action.payload.leftAt || new Date().toISOString(),
                leftReason: action.payload.leftReason || 'removed',
                unreadCount: 0,
                hasUnreadMention: false,
              },
            }
          : state.conversationMeta,
      };
    }
    case 'TRANSFER_ADMIN_AND_LEAVE':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? {
          ...g,
          ownerId: action.payload.newAdminId,
          admins: [...new Set([...g.admins.filter(a => a !== action.payload.leavingUserId), action.payload.newAdminId])],
          members: g.members.filter(m => m !== action.payload.leavingUserId)
        } : g),
        messages: {
          ...state.messages,
          [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), ...action.payload.systemMessages]
        },
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload.groupId]: {
            ...(state.conversationMeta[action.payload.groupId] || { muted: false, pinned: false, unreadCount: 0, hasUnreadMention: false }),
            leftAt: action.payload.leftAt || new Date().toISOString(),
            leftReason: action.payload.leftReason || 'left',
            unreadCount: 0,
            hasUnreadMention: false,
          },
        },
      };
    case 'TRANSFER_OWNERSHIP':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? {
          ...g,
          ownerId: action.payload.newOwnerId,
          admins: [...new Set([...g.admins, action.payload.newOwnerId, action.payload.oldOwnerId])]
        } : g),
        messages: {
          ...state.messages,
          [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), action.payload.systemMessage]
        }
      };
    case 'UPDATE_GROUP_SETTINGS':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? { ...g, settings: { ...g.settings, ...action.payload.settings } } : g)
      };
    case 'SEND_MESSAGE': {
      const { conversationId, message } = action.payload;
      // Deduplicate — same message can arrive via room broadcast AND personal room
      const existing = state.messages[conversationId] || [];
      if (existing.some(m => m.id === message.id)) return state;
      const meta = state.conversationMeta[conversationId] || { muted: false, pinned: false, unreadCount: 0 };

      // Increment unread only when this conversation is not the one currently open
      const isActiveConv = state.activeConversation?.id === conversationId;
      const isOwnMessage = String(message.senderId) === String(state.currentUser?.id);
      const newUnreadCount = (isActiveConv || isOwnMessage) ? 0 : (meta.unreadCount || 0) + 1;

      // Detect if current user is @mentioned (direct mention or @everyone in a group)
      const mentionPattern = state.currentUser?.id
        ? new RegExp(`@\\[[^\\]]+\\]\\(${state.currentUser.id}\\)`)
        : null;
      const isGroupConv = state.groups.some(g => g.id === conversationId);
      const isMentioned = !isOwnMessage && !isActiveConv && (
        !!mentionPattern?.test(message.content || '') ||
        (isGroupConv && (message.content || '').includes('@[everyone](everyone)'))
      );
      const newHasUnreadMention = (meta.hasUnreadMention || isMentioned) && !isActiveConv;

      // Strip @[Name](id) → @Name for display in preview
      const displayContent = (message.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');

      // Stable IDs (matching LOAD_MESSAGES pattern) so subsequent dedup checks can catch these
      const newFiles: SharedFile[] = (message.files || []).map(f => ({
        id: `f_${message.id}_${f.key || f.name}`,
        name: f.name,
        size: f.size || '',
        type: f.type,
        key: f.key,
        uploadedBy: message.senderId,
        conversationId: conversationId,
        timestamp: message.timestamp,
        previewUrl: f.url,
      }));

      const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
      const contentUrls = [...new Set((message.content || '').match(urlRegex) || [])];
      const urlLinks: SharedFile[] = contentUrls.map(url => {
        let domain = '';
        try { domain = new URL(url).hostname.replace('www.', ''); } catch { /* ignore */ }
        return {
          id: `l_${message.id}_${url}`,
          name: url,
          size: domain,
          type: 'link' as const,
          uploadedBy: message.senderId,
          conversationId: conversationId,
          timestamp: message.timestamp,
          previewUrl: url,
        };
      });

      // Stable IDs for message.links; urlLinks that aren't in message.links are appended
      const newLinks: SharedFile[] = [
        ...(message.links || []).map((l: any) => ({
          id: `l_${message.id}_${l.url}`,
          name: l.title || l.url,
          size: l.domain,
          type: 'link' as const,
          uploadedBy: message.senderId,
          conversationId: conversationId,
          timestamp: message.timestamp,
          previewUrl: l.url,
        })),
        ...urlLinks.filter(ul => !(message.links || []).some((l: any) => l.url === ul.previewUrl)),
      ];

      // Dedup: skip any entry whose ID already exists in sharedFiles
      const incomingShared = [...newFiles, ...newLinks].filter(
        nf => !state.sharedFiles.some(existing => existing.id === nf.id)
      );

      return {
        ...state,
        messages: { ...state.messages, [conversationId]: [...(state.messages[conversationId] || []), message] },
        sharedFiles: [...state.sharedFiles, ...incomingShared],
        conversationMeta: {
          ...state.conversationMeta,
          [conversationId]: {
            ...meta,
            unreadCount: newUnreadCount,
            hasUnreadMention: newHasUnreadMention,
            lastMessage: {
              content: displayContent,
              senderId: message.senderId,
              timestamp: message.timestamp,
            },
          },
        },
        replyingTo: null,
        chatUI: { ...state.chatUI, uploadedFiles: [] }
      };
    }
    case 'EDIT_MESSAGE':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: (state.messages[action.payload.conversationId] || []).map(m => m.id === action.payload.messageId ? { ...m, content: action.payload.newContent, editedAt: action.payload.editedAt } : m)
        },
        chatUI: { ...state.chatUI, editingMessageId: null }
      };
    case 'DELETE_MESSAGE': {
      const { conversationId: delConvId, messageId: delMsgId } = action.payload;
      const existing = state.messages[delConvId];
      // If this conversation hasn't been loaded yet, skip — when it loads from DB it will already be deleted
      if (!existing) return state;
      const updatedList = existing.map(m =>
        m.id === delMsgId
          ? { ...m, isDeleted: true, deletedBy: action.payload.deletedBy, deletedAt: action.payload.deletedAt }
          : m
      );

      // If the deleted message was the conversation's latest message, the sidebar preview
      // (conversationMeta.lastMessage) would otherwise keep showing the old text. Update it
      // to match the chat view ("This message was deleted").
      const delMeta = state.conversationMeta[delConvId];
      const latest = updatedList[updatedList.length - 1];
      const updatedConversationMeta = (delMeta?.lastMessage && latest?.id === delMsgId)
        ? {
            ...state.conversationMeta,
            [delConvId]: {
              ...delMeta,
              lastMessage: { ...delMeta.lastMessage, content: 'This message was deleted' },
            },
          }
        : state.conversationMeta;

      return {
        ...state,
        messages: { ...state.messages, [delConvId]: updatedList },
        conversationMeta: updatedConversationMeta,
      };
    }
    case 'UNDO_DELETE': {
      const { conversationId: undoConvId, messageId: undoMsgId } = action.payload;
      const undoList = (state.messages[undoConvId] || []).map(m =>
        m.id === undoMsgId
          ? { ...m, isDeleted: false, deletedAt: undefined, deletedBy: undefined }
          : m
      );

      // Mirror of DELETE_MESSAGE: if the restored message is the latest, put its real
      // content back into the sidebar preview (we replaced it with the deleted placeholder).
      const undoMeta = state.conversationMeta[undoConvId];
      const undoLatest = undoList[undoList.length - 1];
      const restoredConversationMeta = (undoMeta?.lastMessage && undoLatest?.id === undoMsgId)
        ? {
            ...state.conversationMeta,
            [undoConvId]: {
              ...undoMeta,
              lastMessage: {
                ...undoMeta.lastMessage,
                content: (undoLatest.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1'),
              },
            },
          }
        : state.conversationMeta;

      return {
        ...state,
        messages: { ...state.messages, [undoConvId]: undoList },
        conversationMeta: restoredConversationMeta,
      };
    }
    case 'PIN_MESSAGE':
      return {
        ...state,
        pinnedMessages: { ...state.pinnedMessages, [action.payload.conversationId]: action.payload.message },
        messages: {
          ...state.messages,
          [action.payload.conversationId]: (state.messages[action.payload.conversationId] || []).map(m =>
            ({ ...m, isPinned: m.id === action.payload.message.id })
          ),
        },
      };
    case 'UNPIN_MESSAGE':
      return {
        ...state,
        pinnedMessages: { ...state.pinnedMessages, [action.payload]: null },
        messages: {
          ...state.messages,
          [action.payload]: (state.messages[action.payload] || []).map(m => ({ ...m, isPinned: false })),
        },
      };
    case 'SET_MESSAGE_STATUS':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: (state.messages[action.payload.conversationId] || []).map(m => m.id === action.payload.messageId ? { ...m, status: action.payload.status } : m)
        }
      };
    case 'SET_ACTIVE_CONVERSATION': {
      const payload = action.payload as ActiveConversation | null;

      // Normalize/resolve a friendly display name whenever possible so the UI never shows raw IDs
      let resolvedPayload: ActiveConversation | null = null;
      if (payload) {
        let finalName = payload.name;
        // If name is missing or obviously a raw id (dm_... or exactly the id), try to resolve
        if (!finalName || finalName === payload.id || finalName.startsWith('dm_')) {
          if (payload.type === 'group') {
            const group = state.groups.find(g => g.id === payload.id);
            finalName = group?.name || payload.id;
          } else {
            // dm: extract the other user id from conversation id and lookup
            const parts = payload.id.split('_');
            const otherId = parts.find(p => p !== String(state.currentUser?.id));
            const user = otherId ? state.users.find(u => u.id === otherId) : null;
            finalName = user ? (user.displayName || user.name) : payload.id;
          }
        }

        resolvedPayload = { ...payload, name: finalName, avatar: payload.avatar ?? null };
      }

      const convId = resolvedPayload?.id;
      const newMeta = convId ? {
        ...(state.conversationMeta[convId] || { muted: false, pinned: false, unreadCount: 0 }),
        unreadCount: 0,
        hasUnreadMention: false,
        isManuallyUnread: false,
        lastReadAt: new Date().toISOString(),
      } : null;

      return {
        ...state,
        activeConversation: resolvedPayload,
        activeView: resolvedPayload ? 'chat' : state.activeView,
        conversationMeta: convId ? { ...state.conversationMeta, [convId]: newMeta! } : state.conversationMeta,
        chatUI: { ...state.chatUI, isSearchActive: false, searchQuery: '', uploadedFiles: [], isUploading: false },
        // A pending reply/forward belongs to the conversation it was started in —
        // clear it on switch so it can never attach to a message in another conversation.
        replyingTo: null,
        forwardingMessage: null,
      };
    }
    case 'PIN_CONVERSATION':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, unreadCount: 0 }), pinned: true, pinnedAt: new Date().toISOString() }
        }
      };
    case 'UNPIN_CONVERSATION':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, unreadCount: 0 }), pinned: false, pinnedAt: null }
        }
      };
    case 'MUTE_CONVERSATION':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload.conversationId]: { 
            ...(state.conversationMeta[action.payload.conversationId] || { pinned: false, unreadCount: 0 }), 
            muted: true, 
            muteUntil: action.payload.muteUntil,
            mutedAt: new Date().toISOString()
          }
        }
      };
    case 'UNMUTE_CONVERSATION':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, pinned: false }), muted: false, muteUntil: null }
        }
      };
    case 'BLOCK_USER':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, pinned: false, unreadCount: 0 }), blocked: true, blockedAt: new Date().toISOString() }
        }
      };
    case 'UNBLOCK_USER':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, pinned: false, unreadCount: 0 }), blocked: false, blockedAt: null }
        }
      };
    case 'SET_TYPING': {
      const current = state.typingUsers[action.payload.conversationId] || [];
      const updated = action.payload.isTyping
        ? [...new Set([...current, action.payload.userName])]
        : current.filter(u => u !== action.payload.userName);
      return { ...state, typingUsers: { ...state.typingUsers, [action.payload.conversationId]: updated } };
    }
    case 'CLEAR_TYPING': {
      const typingUser = state.users.find(u => u.id === action.payload.userId);
      const userName = typingUser?.name || '';
      const current2 = state.typingUsers[action.payload.conversationId] || [];
      return {
        ...state,
        typingUsers: {
          ...state.typingUsers,
          [action.payload.conversationId]: current2.filter(u => u !== userName),
        },
      };
    }
    case 'SET_MESSAGE_REACTIONS':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: (state.messages[action.payload.conversationId] || []).map(m =>
            m.id === action.payload.messageId ? { ...m, reactions: action.payload.reactions } : m
          ),
        },
      };
    case 'ADD_NOTIFICATION':
      if (state.notifications.some(n => n.id === action.payload.id)) return state;
      return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 100) };
    case 'MARK_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.filter(
          (n) => !(n.recipientId === state.currentUser?.id || n.recipientId === 'all')
        ),
        inAppNotifications: [],
      };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.payload),
      };
    case 'MARK_NOTIFICATIONS_READ_BY_IDS':
      return {
        ...state,
        notifications: state.notifications.filter((n) => !action.payload.includes(n.id)),
      };
    case 'MARK_CONVERSATION_NOTIFICATIONS_READ':
      // Remove every bell notification tied to this conversation (message, mention, reaction…).
      // Used when the user opens a conversation so the bell clears immediately on this device.
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.conversationId !== action.payload),
      };
    case 'OPEN_MODAL':
      return { ...state, activeModal: action.payload.type, modalData: action.payload.data };
    case 'CLOSE_MODAL':
      return { ...state, activeModal: null, modalData: null };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, { ...action.payload, id: Date.now() }] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_REPLYING_TO':
      return { ...state, replyingTo: action.payload };
    case 'SET_FORWARDING_MESSAGE':
      return { ...state, forwardingMessage: action.payload };
    case 'SET_CHAT_SEARCH':
      return { ...state, chatUI: { ...state.chatUI, isSearchActive: action.payload.active, searchQuery: action.payload.query } };
    case 'ADD_REACTION': {
      const { conversationId, messageId, emoji, userId } = action.payload;
      const updatedMessages = (state.messages[conversationId] || []).map(m => {
        if (m.id === messageId) {
          let reactions = [...m.reactions];
          reactions = reactions.map(r => ({
            ...r,
            users: r.users.filter(u => u !== userId)
          })).filter(r => r.users.length > 0);
          const wasSameEmoji = m.reactions.find(r => r.emoji === emoji && r.users.includes(userId));
          if (!wasSameEmoji) {
            const rIndex = reactions.findIndex(r => r.emoji === emoji);
            if (rIndex > -1) {
              reactions[rIndex].users.push(userId);
            } else {
              reactions.push({ emoji, users: [userId] });
            }
          }
          return { ...m, reactions };
        }
        return m;
      });
      return { ...state, messages: { ...state.messages, [conversationId]: updatedMessages } };
    }
    case 'TOGGLE_RIGHT_PANEL':
      return {
        ...state,
        rightPanel: {
          ...state.rightPanel,
          open: action.payload !== undefined ? action.payload : !state.rightPanel.open
        }
      };
    case 'SET_RIGHT_PANEL_TAB':
      return {
        ...state,
        rightPanel: { ...state.rightPanel, activeTab: action.payload }
      };
    case 'SET_MEDIA_VIEW':
      return {
        ...state,
        rightPanel: { ...state.rightPanel, mediaView: action.payload }
      };
    case 'SET_FILES_SORT':
      return {
        ...state,
        rightPanel: { ...state.rightPanel, filesSort: action.payload }
      };
    case 'PROMOTE_TO_ADMIN':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? { ...g, admins: [...new Set([...g.admins, action.payload.userId])] } : g),
        messages: action.payload.systemMessage ? { 
          ...state.messages, 
          [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), action.payload.systemMessage] 
        } : state.messages
      };
    case 'DEMOTE_FROM_ADMIN':
      return {
        ...state,
        groups: state.groups.map(g => g.id === action.payload.groupId ? { ...g, admins: g.admins.filter(a => a !== action.payload.userId) } : g),
        messages: action.payload.systemMessage ? { 
          ...state.messages, 
          [action.payload.groupId]: [...(state.messages[action.payload.groupId] || []), action.payload.systemMessage] 
        } : state.messages
      };
    case 'OPEN_GALLERY':
      return {
        ...state,
        mediaGallery: { open: true, items: action.payload.items, currentIndex: action.payload.index }
      };
    case 'CLOSE_GALLERY':
      return { ...state, mediaGallery: { ...state.mediaGallery, open: false } };
    case 'NAVIGATE_GALLERY':
      const newIdx = (state.mediaGallery.currentIndex + action.payload + state.mediaGallery.items.length) % state.mediaGallery.items.length;
      return { ...state, mediaGallery: { ...state.mediaGallery, currentIndex: newIdx } };
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
        userSettings: state.userSettings ? { ...state.userSettings, theme: action.payload } : state.userSettings,
      };
    case 'MARK_CONVERSATION_READ':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          // lastReadAt MUST advance here. syncMissedMessages re-counts unread since lastReadAt;
          // if we clear the badge without moving lastReadAt, the next sync re-counts the same
          // messages and the notification/unread badge reappears.
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, pinned: false }), unreadCount: 0, hasUnreadMention: false, isManuallyUnread: false, lastReadAt: new Date().toISOString() }
        }
      };
    case 'MARK_CONVERSATION_UNREAD':
      return {
        ...state,
        conversationMeta: {
          ...state.conversationMeta,
          [action.payload]: { ...(state.conversationMeta[action.payload] || { muted: false, pinned: false }), unreadCount: 1, isManuallyUnread: true }
        }
      };
    case 'ADD_UPLOADED_FILES':
      return {
        ...state,
        chatUI: {
          ...state.chatUI,
          uploadedFiles: [...state.chatUI.uploadedFiles, ...action.payload].slice(0, 10)
        }
      };
    case 'REMOVE_UPLOADED_FILE':
      return {
        ...state,
        chatUI: {
          ...state.chatUI,
          uploadedFiles: state.chatUI.uploadedFiles.filter((_, i) => i !== action.payload)
        }
      };
    case 'CLEAR_UPLOADED_FILES':
      return {
        ...state,
        chatUI: {
          ...state.chatUI,
          uploadedFiles: [],
          isUploading: false,
        }
      };
    case 'SET_UPLOADING':
      return {
        ...state,
        chatUI: { ...state.chatUI, isUploading: action.payload }
      };
    case 'RESTORE_CONVERSATION_META':
      return {
        ...state,
        conversationMeta: { ...action.payload, ...state.conversationMeta }
      };
    case 'LOAD_CONVERSATION_LIST': {
      const convListMeta = { ...state.conversationMeta };
      // MySQL returns "YYYY-MM-DD HH:MM:SS" which is not ISO 8601 — Date.parse() on that
      // format returns NaN in Firefox/Safari. Normalise the space separator to "T" first.
      const toMs = (ts: string | null | undefined): number => {
        if (!ts) return 0;
        const parsed = Date.parse(ts.includes('T') ? ts : ts.replace(' ', 'T'));
        return isNaN(parsed) ? 0 : parsed;
      };
      action.payload.forEach(conv => {
        const existing = convListMeta[conv.conversationId];
        const base = existing || { muted: false, muteUntil: null, mutedAt: null, pinned: false, pinnedAt: null, blocked: false, blockedAt: null, hidden: false, unreadCount: 0, hasUnreadMention: false };
        const incomingTs = toMs(conv.lastMessageAt);
        const existingTs = toMs(existing?.lastMessage?.timestamp);
        const isoTimestamp = conv.lastMessageAt
          ? (conv.lastMessageAt.includes('T') ? conv.lastMessageAt : conv.lastMessageAt.replace(' ', 'T'))
          : null;
        convListMeta[conv.conversationId] = {
          ...base,
          chatTracked: true,
          ...(incomingTs >= existingTs && isoTimestamp ? {
            lastMessage: {
              content: (conv.lastMessageContent || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1'),
              senderId: conv.lastMessageSenderId || '',
              timestamp: isoTimestamp,
            },
          } : {}),
        };
      });
      return { ...state, conversationMeta: convListMeta };
    }
    case 'HYDRATE_CONVERSATION_META': {
      const hydratedMeta: Record<string, ConversationMeta> = { ...state.conversationMeta };
      Object.entries(action.payload).forEach(([conversationId, meta]) => {
        const existingCount = state.conversationMeta[conversationId]?.unreadCount || 0;
        hydratedMeta[conversationId] = {
          ...(state.conversationMeta[conversationId] || { muted: false, muteUntil: null, mutedAt: null, pinned: false, pinnedAt: null, blocked: false, blockedAt: null, hidden: false, unreadCount: 0, hasUnreadMention: false }),
          ...meta,
          // Server returns unreadCount=0 for normal conversations (only 1 for manually-marked-unread).
          // Preserve the local count if it's higher — it reflects real-time messages received
          // during the previous session that haven't been read yet.
          // syncMissedMessages will verify and correct this count against the backend.
          unreadCount: Math.max((meta as any).unreadCount ?? 0, existingCount),
        };
      });
      return { ...state, conversationMeta: hydratedMeta };
    }
    case 'UPDATE_UNREAD_COUNTS': {
      const newMeta = { ...state.conversationMeta };
      const activeConvId = state.activeConversation?.id;
      const { counts, previews } = action.payload;
      Object.entries(counts).forEach(([convId, count]) => {
        // Skip the currently open conversation — user is viewing it right now
        if (convId === activeConvId) return;
        const serverCount = Number(count);
        const existing = newMeta[convId] || { muted: false, pinned: false, unreadCount: 0, hasUnreadMention: false };
        const preview = previews?.[convId];
        // Never decrease the in-memory count below the server count: real-time SEND_MESSAGE
        // increments may have advanced the count beyond what the server returned (the server
        // only counts messages up to the moment the /unread-since query ran).
        const resolvedCount = Math.max(serverCount, existing.unreadCount || 0, existing.isManuallyUnread ? 1 : 0);
        newMeta[convId] = {
          ...existing,
          unreadCount: resolvedCount,
          hasUnreadMention: resolvedCount > 0 ? (existing.hasUnreadMention ?? false) : false,
          // Update sidebar preview with the latest message — always, not only when unread,
          // so that fully-read conversations also get their sort timestamp refreshed.
          ...(preview ? {
            lastMessage: {
              content: preview.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1'),
              senderId: preview.senderId,
              timestamp: preview.timestamp,
            },
          } : {}),
        };
      });
      return { ...state, conversationMeta: newMeta };
    }
    case 'PUSH_IN_APP_NOTIFICATION':
      return {
        ...state,
        inAppNotifications: [...state.inAppNotifications, action.payload].slice(-5),
      };
    case 'DISMISS_IN_APP_NOTIFICATION':
      return {
        ...state,
        inAppNotifications: state.inAppNotifications.filter(n => n.id !== action.payload),
      };
    // removed: MESSAGE_READ case — wrote to state.messageReads, which no component ever read
    case 'CONVERSATION_READ': {
      // We (this user) read this conversation on another device. Clear the unread badge
      // AND advance lastReadAt — otherwise on the next refresh/reconnect syncMissedMessages
      // would re-count these already-read messages and the badge/notification would come back.
      const { conversationId, userId } = action.payload;
      if (userId === state.currentUser?.id) {
        return {
          ...state,
          conversationMeta: {
            ...state.conversationMeta,
            [conversationId]: {
              ...(state.conversationMeta[conversationId] || { muted: false, pinned: false, unreadCount: 0, hasUnreadMention: false }),
              unreadCount: 0,
              hasUnreadMention: false,
              isManuallyUnread: false,
              lastReadAt: new Date().toISOString(),
            },
          },
          // Also drop any bell notifications for this conversation so the observing device
          // matches the device that did the reading.
          notifications: state.notifications.filter((n) => n.conversationId !== conversationId),
        };
      }
      return state;
    }
    // PHASE 5: Draft management
    case 'UPDATE_DRAFT': {
      const { conversationId, content, fileNames } = action.payload;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [conversationId]: { content, fileNames },
        },
      };
    }
    case 'CLEAR_DRAFT': {
      const conversationId = action.payload;
      const { [conversationId]: _, ...rest } = state.drafts;
      return {
        ...state,
        drafts: rest,
      };
    }
    default:
      return state;
  }
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Setup cross-tab session sync on mount
  useEffect(() => {
    setupCrossTabSync();
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    const settings = loadSettings();
    dispatch({ type: 'LOAD_SETTINGS', payload: settings });

    // Listen for settings changes from other tabs
    const unsubscribe = onSettingsChanged((newSettings) => {
      dispatch({ type: 'LOAD_SETTINGS', payload: newSettings });
    });

    // Listen for settings clear (logout in other tab)
    const unsubscribeClear = onSettingsCleared(() => {
      dispatch({ type: 'LOGOUT' });
    });

    return () => {
      unsubscribe();
      unsubscribeClear();
    };
  }, []);

  // Apply theme from settings
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (state.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(state.theme);
    }
  }, [state.theme]);


  // Restore conversation meta (unread counts, pins, mutes) from localStorage on login
  useEffect(() => {
    if (!state.currentUser?.id) return;
    try {
      const saved = localStorage.getItem(`cmeta_${state.currentUser.id}`);
      if (saved) {
        const meta = JSON.parse(saved);
        dispatch({ type: 'RESTORE_CONVERSATION_META', payload: meta });
      }
    } catch { /* parse error — ignore */ }
  }, [state.currentUser?.id]);

  // Persist conversation meta to localStorage.
  // lastMessage is included so the sidebar sort order is correct immediately on refresh
  // (server will overwrite it via LOAD_CONVERSATION_LIST shortly after login).
  // pinned/pinnedAt, muted/muteUntil/mutedAt, and isManuallyUnread are server-canonical
  // and fetched fresh via HYDRATE_CONVERSATION_META — they are excluded here so a stale
  // local cache on another device never overrides the server truth.
  useEffect(() => {
    if (!state.currentUser?.id) return;
    try {
      const metaToSave = Object.fromEntries(
        Object.entries(state.conversationMeta).map(([id, meta]) => {
          const { pinned: _p, pinnedAt: _pa, chatTracked: _ct,
                  muted: _m, muteUntil: _mu, mutedAt: _ma, isManuallyUnread: _iu, ...deviceMeta } = meta;
          return [id, deviceMeta];
        })
      );
      localStorage.setItem(`cmeta_${state.currentUser.id}`, JSON.stringify(metaToSave));
    } catch { /* storage quota exceeded */ }
  }, [state.conversationMeta, state.currentUser?.id]);

  useEffect(() => {
    const checkMuteExpiry = () => {
      const now = new Date();
      Object.entries(state.conversationMeta).forEach(([convId, meta]) => {
        if (meta.muted && meta.muteUntil && new Date(meta.muteUntil) < now) {
          dispatch({ type: 'UNMUTE_CONVERSATION', payload: convId });
          dispatch({ type: 'ADD_TOAST', payload: { message: `🔔 Notifications restored for ${convId}`, type: 'info' } });
        }
      });
    };

    const interval = setInterval(checkMuteExpiry, 60000);
    return () => clearInterval(interval);
  }, [state.conversationMeta]);

  // Load server settings and shared files after login or token restore
  useEffect(() => {
    if (!state.currentUser?.id) return;

    const loadUserData = async () => {
      try {
        const settingsRes = await api.get<{ settings: UserSettings }>('/settings');
        if (settingsRes?.settings) {
          dispatch({ type: 'LOAD_SETTINGS', payload: settingsRes.settings });
        }
      } catch (e) {
        console.warn('Failed to load server settings:', (e as Error).message || e);
      }

      try {
        const metadataRes = await fetchConversationMetadata().catch(() => ({}));
        const normalizedMeta = normalizeServerConversationMeta(metadataRes);
        if (Object.keys(normalizedMeta).length > 0) {
          dispatch({ type: 'HYDRATE_CONVERSATION_META', payload: normalizedMeta });
        }
      } catch (e) {
        console.warn('Failed to load conversation metadata:', (e as Error).message || e);
      }

      try {
        const convList = await fetchConversationList().catch(() => []);
        if (convList.length > 0) {
          dispatch({ type: 'LOAD_CONVERSATION_LIST', payload: convList });
        }
      } catch (e) {
        console.warn('Failed to load conversation list:', (e as Error).message || e);
      }

      try {
        const [resp1, resp2] = await Promise.all([
          api.get<{ files: SharedFile[] }>('/files/shared').catch(() => ({ files: [] } as any)),
          api.get<{ files: SharedFile[] }>('/files/shared/metadata').catch(() => ({ files: [] } as any)),
        ]);

        const files1 = Array.isArray(resp1?.files) ? resp1.files : [];
        const files2 = Array.isArray(resp2?.files) ? resp2.files : [];
        const mergedMap = new Map<string, SharedFile>();

        for (const file of [...files1, ...files2]) {
          const existing = mergedMap.get(file.id);
          mergedMap.set(file.id, existing ? { ...existing, ...file } : file);
        }

        const mergedFiles = Array.from(mergedMap.values());
        dispatch({ type: 'LOAD_SHARED_FILES', payload: mergedFiles });
      } catch (e) {
        console.warn('Failed to load shared files:', (e as Error).message || e);
      }
    };

    loadUserData();
  }, [state.currentUser?.id, dispatch]);

  // Restore session from persisted token on app initialization
  const sessionRestored = useRef(false);
  useEffect(() => {
    if (sessionRestored.current || state.currentUser) return;
    sessionRestored.current = true;

    const restoreSession = async () => {
      const token = getToken();

      if (!token) return;

      try {
        const user = await getCurrentUser();
        if (user) {
          dispatch({ type: 'LOGIN', payload: normalizeUser(user) });
        }
      } catch {
        dispatch({ type: 'LOGOUT' });
      }
    };

    restoreSession();
  }, [state.currentUser]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
