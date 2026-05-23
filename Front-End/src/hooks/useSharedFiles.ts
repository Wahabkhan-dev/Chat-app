import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAppContext } from '@/context/AppContext';
import { SharedFile } from '@/mock/files';

export function useSharedFilesLoader() {
  const { state, dispatch } = useAppContext();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!state.currentUser?.id || loaded) return;

    const loadSharedFiles = async () => {
      try {
        const [resp1, resp2] = await Promise.all([
          api.get<{ files: SharedFile[] }>('/files/shared').catch(() => ({ files: [] } as any)),
          api.get<{ files: SharedFile[] }>('/files/shared/metadata').catch(() => ({ files: [] } as any)),
        ]);

        const files1 = Array.isArray(resp1?.files) ? resp1.files : [];
        const files2 = Array.isArray(resp2?.files) ? resp2.files : [];

        // First-pass: dedupe by id
        const byId = new Map<string, SharedFile>();
        for (const f of [...files1, ...files2]) {
          const existing = byId.get(f.id);
          byId.set(f.id, existing ? { ...existing, ...f } : f);
        }

        // Second-pass: dedupe by R2 key — same physical file can appear from both
        // endpoints with different ID schemes (f_${msgId}_${key} vs m_${row.id})
        const byKey = new Map<string, SharedFile>();
        for (const f of Array.from(byId.values())) {
          const k = f.key || f.id;
          if (!byKey.has(k)) byKey.set(k, f);
        }
        const merged = Array.from(byKey.values());

        dispatch({ type: 'LOAD_SHARED_FILES', payload: merged });
        console.log('[useSharedFilesLoader] Loaded', merged.length, 'shared files (merged)');
      } catch (error) {
        console.warn('[useSharedFilesLoader] Failed to load shared files:', error);
      } finally {
        setLoaded(true);
      }
    };

    loadSharedFiles();
  }, [state.currentUser?.id, loaded, dispatch]);

  return state.sharedFiles;
}

