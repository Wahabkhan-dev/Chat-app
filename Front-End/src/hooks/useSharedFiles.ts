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

        // Merge and dedupe by id
        const map = new Map<string, SharedFile>();
        for (const f of [...files1, ...files2]) {
          const existing = map.get(f.id);
          map.set(f.id, existing ? { ...existing, ...f } : f);
        }
        const merged = Array.from(map.values());

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

