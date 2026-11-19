import type { Entry, FileTree, ReadonlyDirectoryHandle } from './types';

let nextId = 0;
/** Allocate an opaque entry id. Ids are pure identifiers and never encode the entry's path. */
export function allocateId(): string {
  return `e${nextId++}`;
}

export function createDirectorySource(initialTree: FileTree) {
  let tree = initialTree;
  const pendingReads = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function load(id: string): Promise<void> {
    const entry = tree.entries.get(id);
    if (entry?.handle?.kind !== 'directory' || entry.children !== undefined) return Promise.resolve();
    const handle = entry.handle;
    const pending = pendingReads.get(id);
    if (pending) return pending;

    const read = (async () => {
      const children: Entry[] = [];
      for await (const child of handle.values()) {
        children.push({ id: allocateId(), name: child.name, searchName: child.name.toLocaleLowerCase(), kind: child.kind, parentId: id, handle: child });
      }

      const entries = new Map(tree.entries);
      for (const child of children) entries.set(child.id, child);
      entries.set(id, { ...entry, children: children.map(child => child.id) });
      tree = { ...tree, entries };
      listeners.forEach(listener => listener());
    })().finally(() => pendingReads.delete(id));
    pendingReads.set(id, read);
    return read;
  }

  return { getSnapshot: () => tree, subscribe, load };
}

export type DirectorySource = ReturnType<typeof createDirectorySource>;

export async function sourceFromHandle(handle: ReadonlyDirectoryHandle): Promise<DirectorySource> {
  const rootId = allocateId();
  const tree: FileTree = { rootId, entries: new Map([[rootId, { id: rootId, name: handle.name, kind: 'directory', handle }]]) };
  const source = createDirectorySource(tree);
  await source.load(rootId);
  return source;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '读取文件夹失败';

export function treeFromFiles(files: File[]): FileTree {
  const rootName = files[0]?.webkitRelativePath?.split('/')[0] || '本地文件夹';
  const rootId = allocateId();
  const entries = new Map<string, Entry>([[rootId, { id: rootId, name: rootName, kind: 'directory', children: [] }]]);
  // Key intermediate directories by their path so files sharing a directory land
  // under the same node; the actual entry ids stay opaque.
  const directories = new Map<string, string>([['', rootId]]);
  for (const file of files) {
    const components = (file.webkitRelativePath || `${rootName}/${file.name}`).split('/').slice(1);
    let parentId = rootId;
    let pathKey = '';
    components.forEach((name, index) => {
      pathKey = pathKey ? `${pathKey}/${name}` : name;
      const isFile = index === components.length - 1;
      let id = isFile ? undefined : directories.get(pathKey);
      if (!id) {
        id = allocateId();
        entries.set(id, { id, name, searchName: name.toLocaleLowerCase(), parentId, kind: isFile ? 'file' : 'directory', children: isFile ? undefined : [], file: isFile ? file : undefined, size: isFile ? file.size : undefined, modified: isFile ? file.lastModified : undefined });
        entries.get(parentId)!.children!.push(id);
        if (!isFile) directories.set(pathKey, id);
      }
      parentId = id;
    });
  }
  return { rootId, entries };
}

/**
 * Resolve an entry's underlying File. When the entry gains size/modified
 * metadata, the result includes a patched `entry` so callers can merge it
 * immutably. Never mutates the passed entry.
 */
export async function readFile(entry: Entry): Promise<{ file?: File; entry?: Entry }> {
  if (entry.file) return { file: entry.file };
  if (entry.handle?.kind === 'file') {
    const file = await entry.handle.getFile();
    return { file, entry: { ...entry, size: file.size, modified: file.lastModified } };
  }
  if (entry.asset) {
    const response = await fetch(entry.asset);
    if (!response.ok) throw new Error('预览资源读取失败');
    const blob = await response.blob();
    return { file: new File([blob], entry.name, { type: blob.type }) };
  }
  if (entry.content !== undefined && entry.content !== '') return { file: new File([entry.content], entry.name, { type: 'text/plain' }) };
  return {};
}
