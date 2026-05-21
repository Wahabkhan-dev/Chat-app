
export type MessageType = 'text' | 'file' | 'system' | 'image' | 'video';
export type FileCategory = 'pdf' | 'pptx' | 'xlsx' | 'docx' | 'image' | 'video' | 'archive' | 'document' | 'other';

export interface Reaction {
  emoji: string;
  users: string[];
}

export interface MessageFile {
  key?: string;   // R2 storage key — used to fetch a signed URL (private bucket)
  url?: string;   // Legacy / temporary signed URL resolved on the frontend
  name: string;
  size: string;
  type: string;
  mimeType?: string;
}

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  domain: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  type: MessageType;
  files?: MessageFile[];
  links?: LinkMetadata[];
  reactions: Reaction[];
  replyTo?: string; 
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  isPinned?: boolean;
  hiddenFor?: string[];
  mentions?: string[];
  status?: 'sending' | 'sent' | 'delivered' | 'seen';
}

export const mockMessages: Record<string, Message[]> = {
  // --- DM: Arham ↔ Sara ---
  'u1_u2': [
    { id: 'm1', senderId: 'u1', content: 'Hey Sara! Can you share the latest design files?', timestamp: '2024-05-10T09:00:00Z', type: 'text', reactions: [] },
    { id: 'm2', senderId: 'u2', content: 'Sure! Uploading them now.', timestamp: '2024-05-10T09:01:00Z', type: 'text', reactions: [] },
    { id: 'm3', senderId: 'u2', content: '', timestamp: '2024-05-10T09:02:00Z', type: 'file', files: [{ url: 'https://placehold.co/600x400/png?text=Mock+PDF+Url', name: 'Brand_Guidelines_v3.pdf', type: 'pdf', size: '3.2 MB' }], reactions: [] },
    { id: 'msg_img1', senderId: 'u2', content: '', timestamp: '2024-05-10T10:00:00Z', type: 'image', files: [{ url: 'https://picsum.photos/seed/mawby1/800/600', name: 'Team_Outing.jpg', type: 'image', size: '1.2 MB' }], reactions: [] },
    { id: 'msg_link1', senderId: 'u2', content: 'Check the design system here: https://www.figma.com/file/abc123', timestamp: '2024-05-10T10:05:00Z', type: 'text', reactions: [] },
    { id: 'm4', senderId: 'u1', content: 'Perfect, thank you! 🙌', timestamp: '2024-05-10T09:03:00Z', type: 'text', reactions: [{ emoji: '❤️', users: ['u2'] }] },
    { id: 'm5', senderId: 'u2', content: 'Also, the sprint board is updated. Check Figma when you get a chance.', timestamp: '2024-05-10T09:10:00Z', type: 'text', reactions: [] },
    { id: 'm6', senderId: 'u1', content: 'On it! Will review before standup.', timestamp: '2024-05-10T09:12:00Z', type: 'text', reactions: [] },
  ],

  // --- DM: Arham ↔ Bilal ---
  'u1_u3': [
    { id: 'm7', senderId: 'u3', content: 'Arham, marketing deck is ready for review.', timestamp: '2024-05-09T14:00:00Z', type: 'text', reactions: [] },
    { id: 'm8', senderId: 'u1', content: 'Great, send it over.', timestamp: '2024-05-09T14:02:00Z', type: 'text', reactions: [] },
    { id: 'm9', senderId: 'u3', content: '', timestamp: '2024-05-09T14:03:00Z', type: 'file', files: [{ url: 'https://placehold.co/600x400/png?text=Mock+PPTX+Url', name: 'Marketing_Deck_May.pptx', type: 'pptx', size: '8.7 MB' }], reactions: [] },
    { id: 'm10', senderId: 'u1', content: 'Looks solid. One slide needs revision — slide 7.', timestamp: '2024-05-09T14:20:00Z', type: 'text', reactions: [] },
  ],

  // --- Group: Q2 Sprint Team ---
  'g1': [
    { id: 'gm1', senderId: 'u1', content: 'Welcome to the Q2 Sprint Team group! 🚀', timestamp: '2024-04-01T09:05:00Z', type: 'text', reactions: [{ emoji: '🔥', users: ['u2', 'u4'] }] },
    { id: 'gm2', senderId: 'u4', content: "Excited to be here. Let's crush it this sprint!", timestamp: '2024-04-01T09:10:00Z', type: 'text', reactions: [] },
    { id: 'gm3', senderId: 'u2', content: 'Sprint board is ready. Sharing now.', timestamp: '2024-04-01T09:15:00Z', type: 'text', reactions: [] },
    { id: 'gm4', senderId: 'u2', content: '', timestamp: '2024-04-01T09:16:00Z', type: 'file', files: [{ url: 'https://placehold.co/600x400/png?text=Mock+XLSX+Url', name: 'Sprint_Board_Q2.xlsx', type: 'xlsx', size: '420 KB' }], reactions: [] },
    { id: 'gm_img1', senderId: 'u4', content: '', timestamp: '2024-04-05T11:00:00Z', type: 'image', files: [{ url: 'https://picsum.photos/seed/arch/800/600', name: 'Architecture_Diagram.png', type: 'image', size: '2.1 MB' }], reactions: [] },
    { id: 'gm5', senderId: 'u1', content: 'Daily standup at 10 AM. Be there! ✅', timestamp: '2024-04-02T09:00:00Z', type: 'text', reactions: [{ emoji: '✅', users: ['u2', 'u4'] }] },
    { id: 'gm6', senderId: 'u4', content: 'Working on auth module today. Will push PR by EOD.', timestamp: '2024-04-02T10:30:00Z', type: 'text', reactions: [] },
    { id: 'gm7', senderId: 'u1', content: '', timestamp: '2024-04-03T11:00:00Z', type: 'file', files: [{ url: 'https://placehold.co/600x400/png?text=Mock+PDF+Url', name: 'API_Docs_v2.pdf', type: 'pdf', size: '5.1 MB' }], reactions: [] },
    { id: 'gm8', senderId: 'u2', content: 'Review done. LGTM 👍', timestamp: '2024-04-03T14:00:00Z', type: 'text', reactions: [{ emoji: '👍', users: ['u1'] }] },
  ],

  // --- Group: Brand & Design ---
  'g2': [
    { id: 'gm9',  senderId: 'u2', content: "Brand refresh kickoff! Let's align on the new direction.", timestamp: '2024-03-20T10:10:00Z', type: 'text', reactions: [] },
    { id: 'gm10', senderId: 'u6', content: "Love the energy. I'll share the competitor analysis.", timestamp: '2024-03-20T10:15:00Z', type: 'text', reactions: [] },
    { id: 'gm11', senderId: 'u6', content: '', timestamp: '2024-03-20T10:16:00Z', type: 'file', files: [{ url: 'https://placehold.co/600x400/png?text=Mock+PDF+Url', name: 'Competitor_Analysis.pdf', type: 'pdf', size: '2.8 MB' }], reactions: [] },
    { id: 'gm12', senderId: 'u3', content: 'Logo concepts coming tomorrow. Stay tuned 🎨', timestamp: '2024-03-20T11:00:00Z', type: 'text', reactions: [{ emoji: '😍', users: ['u2', 'u6'] }] },
  ],
};
