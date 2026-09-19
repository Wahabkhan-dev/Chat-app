"use client";

/**
 * Download manager — tracks every file download in the app so the Downloads
 * panel can show a Teams-style progress bar per file. Downloads stream through
 * fetch so progress is reported as bytes arrive; the file is saved to the
 * browser's Downloads folder when complete.
 */

import { useSyncExternalStore } from 'react';

const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawApiUrl.startsWith('http')
  ? _rawApiUrl
  : 'https://chat-app-dzn1.onrender.com/api';

export type DownloadStatus = 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface DownloadSource {
  name: string;
  /** Private R2 key — downloaded through the authenticated backend proxy. */
  key?: string;
  /** Direct URL (blob:, data:, or public) — used when there is no key. */
  url?: string;
}

export interface DownloadItem {
  id: string;
  name: string;
  source: DownloadSource;
  status: DownloadStatus;
  loaded: number;
  /** Total bytes, or null when the server did not report a size. */
  total: number | null;
  error?: string;
  startedAt: number;
}

interface DownloadState {
  items: DownloadItem[];
  panelOpen: boolean;
  panelCollapsed: boolean;
}

let state: DownloadState = { items: [], panelOpen: false, panelCollapsed: false };
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
let idCounter = 0;

function setState(next: Partial<DownloadState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function updateItem(id: string, patch: Partial<DownloadItem>) {
  setState({ items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
}

// How long a finished row stays visible ("Saved to Downloads") before it disappears.
const COMPLETED_ROW_DISMISS_MS = 1500;

/** Mark a download complete, then remove its row; the panel closes once it is empty. */
function completeItem(id: string, patch: Partial<DownloadItem> = {}) {
  updateItem(id, { ...patch, status: 'completed' });
  setTimeout(() => {
    const items = state.items.filter((it) => it.id !== id);
    setState({ items, panelOpen: items.length > 0 && state.panelOpen });
  }, COMPLETED_ROW_DISMISS_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const SERVER_SNAPSHOT: DownloadState = { items: [], panelOpen: false, panelCollapsed: false };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useDownloads(): DownloadState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Non-hook check, e.g. so the auto-refresh doesn't reload mid-download. */
export function hasActiveDownloads(): boolean {
  return state.items.some((it) => it.status === 'downloading');
}

function sourceId(source: DownloadSource): string {
  return source.key ? `key:${source.key}` : `url:${source.url}`;
}

/** True while a download for this file is in progress — lets buttons show a busy state. */
export function useIsDownloading(source: { key?: string; url?: string }): boolean {
  const { items } = useDownloads();
  if (!source.key && !source.url) return false;
  const sid = sourceId(source as DownloadSource);
  return items.some((it) => it.status === 'downloading' && sourceId(it.source) === sid);
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/** Let the browser handle the download itself (used when fetch is blocked, e.g. by CORS). */
function nativeDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function run(id: string, source: DownloadSource) {
  const controller = new AbortController();
  controllers.set(id, controller);

  let requestUrl: string;
  let headers: Record<string, string> = {};
  if (source.key) {
    const token = localStorage.getItem('teams_token');
    requestUrl = `${BASE_URL}/files/download?key=${encodeURIComponent(source.key)}&filename=${encodeURIComponent(source.name)}`;
    if (token) headers = { Authorization: `Bearer ${token}` };
  } else {
    requestUrl = source.url!;
  }

  try {
    let res: Response;
    try {
      res = await fetch(requestUrl, { headers, signal: controller.signal });
    } catch (err) {
      // A direct URL on another origin can fail CORS — hand it to the browser instead.
      if (!source.key && (err as Error).name !== 'AbortError') {
        nativeDownload(requestUrl, source.name);
        completeItem(id);
        return;
      }
      throw err;
    }
    if (!res.ok) throw new Error(res.status === 404 ? 'File not found' : `Server error (${res.status})`);

    const lengthHeader = Number(res.headers.get('Content-Length'));
    const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
    updateItem(id, { total });

    let blob: Blob;
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;
      let lastUpdate = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        // Throttle re-renders to ~10 per second
        const now = Date.now();
        if (now - lastUpdate > 100) {
          lastUpdate = now;
          updateItem(id, { loaded });
        }
      }
      blob = new Blob(chunks, { type: res.headers.get('Content-Type') || 'application/octet-stream' });
    } else {
      blob = await res.blob();
    }

    saveBlob(blob, source.name);
    completeItem(id, { loaded: blob.size, total: total ?? blob.size });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      updateItem(id, { status: 'cancelled' });
    } else {
      console.error('[downloads] failed', source.name, err);
      updateItem(id, { status: 'failed', error: (err as Error).message || 'Download failed' });
    }
  } finally {
    controllers.delete(id);
  }
}

/**
 * Start downloading a file. Opens the Downloads panel and returns immediately;
 * progress and errors are shown in the panel. Clicking again while the same
 * file is still downloading does not start a duplicate.
 */
export function startDownload(source: DownloadSource): void {
  if (typeof window === 'undefined') return;
  if (!source.key && !source.url) {
    const id = `dl-${++idCounter}`;
    setState({
      items: [{ id, name: source.name, source, status: 'failed', loaded: 0, total: null, error: 'File is not available', startedAt: Date.now() }, ...state.items],
      panelOpen: true,
      panelCollapsed: false,
    });
    return;
  }

  const sid = sourceId(source);
  if (state.items.some((it) => it.status === 'downloading' && sourceId(it.source) === sid)) {
    setState({ panelOpen: true, panelCollapsed: false });
    return;
  }

  const id = `dl-${++idCounter}`;
  const item: DownloadItem = { id, name: source.name, source, status: 'downloading', loaded: 0, total: null, startedAt: Date.now() };
  setState({ items: [item, ...state.items], panelOpen: true, panelCollapsed: false });
  void run(id, source);
}

/** Download several files at once — each gets its own row in the panel. */
export function startDownloads(sources: DownloadSource[]): void {
  sources.forEach(startDownload);
}

export function cancelDownload(id: string) {
  controllers.get(id)?.abort();
}

export function retryDownload(id: string) {
  const item = state.items.find((it) => it.id === id);
  if (!item || item.status === 'downloading') return;
  setState({ items: state.items.filter((it) => it.id !== id) });
  startDownload(item.source);
}

export function removeDownload(id: string) {
  cancelDownload(id);
  setState({ items: state.items.filter((it) => it.id !== id) });
}

/** Remove finished rows; closes the panel when nothing is left downloading. */
export function clearFinishedDownloads() {
  const items = state.items.filter((it) => it.status === 'downloading');
  setState({ items, panelOpen: items.length > 0 && state.panelOpen });
}

export function closeDownloadsPanel() {
  const items = state.items.filter((it) => it.status === 'downloading');
  setState({ items, panelOpen: false });
}

export function openDownloadsPanel() {
  setState({ panelOpen: true, panelCollapsed: false });
}

export function toggleDownloadsPanelCollapsed() {
  setState({ panelCollapsed: !state.panelCollapsed });
}
