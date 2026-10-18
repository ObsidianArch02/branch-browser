import type { Entry, FileTree, ReadonlyDirectoryHandle } from './types';

const pendingReads = new WeakMap<ReadonlyDirectoryHandle, Promise<FileTree>>();

let nextId = 0;
/** Allocate an opaque entry id. Ids are pure identifiers and never encode the entry's path. */
export function allocateId(): string {
  return `e${nextId++}`;
}

/**
 * Ensure a directory's children are loaded. Resolves to a new FileTree whose
 * entries map contains the loaded children; the input tree is never mutated.
 * Concurrent calls for the same directory share one read and resolve to the
 * same updated tree. If a caller's tree is stale, its own fresh copy is built.
 */
export function loadDirectory(tree: FileTree, id: string): Promise<FileTree> {
  const entry = tree.entries.get(id);
  if (!entry || entry.kind !== 'directory' || entry.children !== undefined) return Promise.resolve(tree);
  const handle = entry.handle;
  if (!handle || handle.kind !== 'directory') return Promise.resolve(tree);

  const pending = pendingReads.get(handle);
  if (pending) return pending.then(loaded => mergeLoaded(tree, loaded, id));

  const read = (async (): Promise<FileTree> => {
    const children: Entry[] = [];
    for await (const child of handle.values()) {
      children.push({ id: allocateId(), name: child.name, kind: child.kind, parentId: id, handle: child });
    }
    return mergeLoaded(tree, children, id);
  })();

  pendingReads.set(handle, read);
  read.finally(() => pendingReads.delete(handle));
  return read;
}

/** Apply loaded children (a list or an already-built tree's entries for `id`) onto `tree`, immutably. */
function mergeLoaded(tree: FileTree, loaded: FileTree | Entry[], id: string): FileTree {
  const source = Array.isArray(loaded) ? undefined : loaded;
  const children: Entry[] = Array.isArray(loaded)
    ? loaded
    : (source!.entries.get(id)!.children ?? []).map(childId => source!.entries.get(childId)!);
  const entries = new Map(tree.entries);
  const base = entries.get(id)!;
  for (const child of children) entries.set(child.id, child);
  entries.set(id, { ...base, children: children.map(child => child.id) });
  return { ...tree, entries };
}

export async function treeFromHandle(handle: ReadonlyDirectoryHandle): Promise<FileTree> {
  const rootId = allocateId();
  const tree: FileTree = { rootId, entries: new Map([[rootId, { id: rootId, name: handle.name, kind: 'directory', handle }]]) };
  return loadDirectory(tree, rootId);
}

export function treeFromFiles(files: File[]): FileTree {
  const rootName = files[0]?.webkitRelativePath.split('/')[0] || '本地文件夹';
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
        entries.set(id, { id, name, parentId, kind: isFile ? 'file' : 'directory', children: isFile ? undefined : [], file: isFile ? file : undefined, size: isFile ? file.size : undefined, modified: isFile ? file.lastModified : undefined });
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
