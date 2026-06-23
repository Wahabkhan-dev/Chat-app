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

export async function uploadFilesToR2(
  files: File[],
  conversationId: string,
  originMessageId?: number | null,
  onProgress?: (percentage: number) => void
): Promise<UploadedFileResult[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('conversationId', conversationId);
  if (originMessageId) formData.append('originMessageId', String(originMessageId));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percentComplete);
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.files as UploadedFileResult[]);
        } catch (err) {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error((err as any).message || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('POST', `${BASE_URL}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}
