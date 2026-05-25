const _rawUploadApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawUploadApiUrl.startsWith('http')
  ? _rawUploadApiUrl
  : 'https://chat-app-wv5a.onrender.com/api';

export interface UploadedFileResult {
  key: string;       // R2 storage key — store this in the message; never a direct URL
  name: string;
  size: string;
  type: string;
  mimeType: string;
}

export async function uploadFilesToR2(files: File[], conversationId: string, originMessageId?: number | null): Promise<UploadedFileResult[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('conversationId', conversationId);
  if (originMessageId) formData.append('originMessageId', String(originMessageId));

  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Upload failed');
  }

  const data = await res.json();
  return data.files as UploadedFileResult[];
}
