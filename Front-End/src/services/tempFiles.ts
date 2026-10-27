const _rawUploadApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawUploadApiUrl.startsWith('http')
  ? _rawUploadApiUrl
  : 'https://chat-app-dzn1.onrender.com/api';

export interface TempFileUploadResult {
  code: string;
  expiresAt: string;
  name: string;
  size: string;
}

export interface TempFileInfo {
  url: string;
  name: string;
  size: string;
  mimeType: string;
  expiresAt: string;
  sharedBy: string;
}

export interface MyTempFile {
  code: string;
  name: string;
  size: string;
  mimeType: string;
  createdAt: string;
  expiresAt: string;
}

function getToken(): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function apiFetch(path: string, body: any, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.message || 'Request failed');
  return data;
}

function putToR2(uploadUrl: string, file: File, onProgress?: (percentage: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload to storage failed (${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/** Uploads a file straight to R2 (no size limit) and returns an 8-char code good for `expiresInHours`. */
export async function uploadTempFile(
  file: File,
  expiresInHours: number,
  onProgress?: (percentage: number) => void
): Promise<TempFileUploadResult> {
  const token = getToken();

  const { key, uploadUrl } = await apiFetch('/temp-files/presign', {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
  }, token);

  await putToR2(uploadUrl, file, onProgress);

  return apiFetch('/temp-files/complete', {
    key,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    expiresInHours,
  }, token) as Promise<TempFileUploadResult>;
}

/** This user's active (not-yet-expired) shares. Expired ones are simply gone — the cleanup
 *  job deletes the record outright, so there's nothing to filter out on this end. */
export async function fetchMyTempFiles(): Promise<MyTempFile[]> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/temp-files/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Failed to load your shared files.');
  return data.files as MyTempFile[];
}

/** Looks up a temp-file code. No login required — the code itself is the access credential. */
export async function fetchTempFileInfo(code: string): Promise<TempFileInfo> {
  const res = await fetch(`${BASE_URL}/temp-files/${encodeURIComponent(code.trim().toUpperCase())}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Code not found or expired.');
  return data as TempFileInfo;
}
