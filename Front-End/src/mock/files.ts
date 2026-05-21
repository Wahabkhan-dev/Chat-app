
export interface SharedFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: string;
  conversationId: string;
  conversationName?: string;
  originMessageId?: number;
  messageId?: number;
  timestamp: string;
  key?: string;       // R2 storage key (private bucket)
  url?: string;
  previewUrl?: string;
}

export const mockFiles: SharedFile[] = [
  { id: 'f1', name: 'Brand_Guidelines_v3.pdf',   type: 'pdf',   size: '3.2 MB', uploadedBy: 'u2', conversationId: 'u1_u2', timestamp: '2024-05-10T09:02:00Z' },
  { id: 'f2', name: 'Marketing_Deck_May.pptx',    type: 'pptx',  size: '8.7 MB', uploadedBy: 'u3', conversationId: 'u1_u3', timestamp: '2024-05-09T14:03:00Z' },
  { id: 'f3', name: 'Sprint_Board_Q2.xlsx',        type: 'xlsx',  size: '420 KB', uploadedBy: 'u2', conversationId: 'g1',    timestamp: '2024-04-01T09:16:00Z' },
  { id: 'f4', name: 'API_Docs_v2.pdf',             type: 'pdf',   size: '5.1 MB', uploadedBy: 'u1', conversationId: 'g1',    timestamp: '2024-04-03T11:00:00Z' },
  { id: 'f5', name: 'Competitor_Analysis.pdf',     type: 'pdf',   size: '2.8 MB', uploadedBy: 'u6', conversationId: 'g2',    timestamp: '2024-03-20T10:16:00Z' },
  { id: 'f6', name: 'Team_Photo.jpg',              type: 'image', size: '1.2 MB', uploadedBy: 'u6', conversationId: 'g2',    timestamp: '2024-03-21T12:00:00Z', previewUrl: 'https://picsum.photos/400/250?random=5' },
];
