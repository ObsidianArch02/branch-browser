import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ancestors, visibleChildren } from './data';
import type { DirectorySource } from './filesystem';
import type { FileTree } from './types';

const batchSize = 8;

export function useDirectoryLoading(source: DirectorySource, activeId: string, previews: boolean, hidden: boolean, reportError: (error: unknown) => void) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (source.getSnapshot().entries.get(activeId)?.handle?.kind !== 'directory') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        await source.load(activeId);
        if (!previews || cancelled) return;

        const { entries } = source.getSnapshot();
        const children = visibleChildren(entries, entries.get(activeId)!, hidden).filter(entry => entry.kind === 'directory');
        for (let i = 0; i < children.length && !cancelled; i += batchSize) {
          await Promise.all(children.slice(i, i + batchSize).map(entry => source.load(entry.id)));
        }
      } catch (error) {
        if (!cancelled) reportError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [source, activeId, previews, hidden, reportError]);

  return loading;
}

export function useDirectorySearch(source: DirectorySource, tree: FileTree, query: string, hidden: boolean, reportError: (error: unknown) => void) {
  const [searching, setSearching] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    if (!needle) return [];
    return [...tree.entries.values()].filter(entry => entry.id !== tree.rootId && (hidden || !ancestors(tree.entries, entry.id).some(item => item.parentId && item.name.startsWith('.'))) && (entry.searchName ?? entry.name.toLocaleLowerCase()).includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).slice(0, 100);
  }, [deferredQuery, tree, hidden]);

  useEffect(() => {
    const { rootId, entries } = source.getSnapshot();
    if (!query.trim() || entries.get(rootId)?.handle?.kind !== 'directory') {
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      const queue = [rootId];
      try {
        while (queue.length && !cancelled) {
          const ids = queue.splice(0, batchSize);
          await Promise.all(ids.map(source.load));
          if (cancelled) return;

          const { entries } = source.getSnapshot();
          for (const id of ids) {
            for (const child of visibleChildren(entries, entries.get(id)!, hidden)) {
              if (child.kind === 'directory') queue.push(child.id);
            }
          }
        }
      } catch (error) {
        if (!cancelled) reportError(error);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [source, query, hidden, reportError]);

  return { results, searching };
}
