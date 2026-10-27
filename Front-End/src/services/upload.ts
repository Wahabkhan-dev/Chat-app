const _rawUploadApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawUploadApiUrl.startsWith('http')
  ? _rawUploadApiUrl
  : 'https://chat-app-dzn1.onrender.com/api';

export interface UploadedFileResult {
  key: string;       // R2 storage key — store this in the message; never a direct URL
  name: string;
  size: string;
  type: string;
  mimeType: string;
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

// Uploads a single file to R2 via a presigned PUT URL (bytes go straight to R2, never through
// our server) and reports 0-100 progress for that one file via XHR's upload progress event.
function putToR2(uploadUrl: string, file: File, onProgress?: (percentage: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload to storage failed (${xhr.status})`));
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Uploads files directly to Cloudflare R2 using presigned URLs.
 *
 * Why: the old flow posted files to our own server (multer buffered the whole file in memory,
 * then wrote it to R2/disk on the single Node thread). For large files that blocked the event
 * loop long enough to starve Socket.io's heartbeat — the client would see the progress bar hit
 * 100% (its bytes were sent) while the server was still busy, then the socket would drop,
 * showing "Reconnecting…" followed by an error. Uploading straight to R2 means our server is
 * never in the data path for the actual bytes, so it can't block on them.
 */
export async function uploadFilesToR2(
  files: File[],
  conversationId: string,
  originMessageId?: number | null,
  onProgress?: (percentage: number) => void
): Promise<UploadedFileResult[]> {
  const token = getToken();

  const { files: presigned } = await apiFetch('/upload/presign', {
    conversationId,
    originMessageId,
    files: files.map(f => ({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' })),
  }, token);

  // Combined progress across all files, weighted by size (matches the old single-request feel).
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const uploadedPerFile = new Array(files.length).fill(0);
  const reportCombined = () => {
    const uploaded = uploadedPerFile.reduce((sum, v, i) => sum + (v / 100) * files[i].size, 0);
    onProgress?.(Math.round((uploaded / totalBytes) * 100));
  };

  await Promise.all(
    presigned.map((p: { uploadUrl: string }, i: number) =>
      putToR2(p.uploadUrl, files[i], (pct) => {
        uploadedPerFile[i] = pct;
        reportCombined();
      })
    )
  );

  const { files: completed } = await apiFetch('/upload/complete', {
    conversationId,
    originMessageId,
    files: presigned.map((p: { key: string; name: string; size: number; mimeType: string }) => ({
      key: p.key, name: p.name, size: p.size, mimeType: p.mimeType,
    })),
  }, token);

  return completed as UploadedFileResult[];
}
