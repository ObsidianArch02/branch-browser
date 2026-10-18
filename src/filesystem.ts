import type { Entry, FileTree, ReadonlyDirectoryHandle } from './types';

const pendingReads = new WeakMap<ReadonlyDirectoryHandle, Promise<void>>();

export async function loadDirectory(tree: FileTree, id: string): Promise<void> {
  const entry = tree.entries.get(id);
  if (!entry || entry.kind !== 'directory' || entry.children !== undefined) return;
  const handle = entry.handle;
  if (!handle || handle.kind !== 'directory') return;
  const pending = pendingReads.get(handle);
  if (pending) return pending;
  const read = (async () => {
    const children: Entry[] = [];
    for await (const child of handle.values()) {
      children.push({ id: `${id}/${child.name}`, name: child.name, kind: child.kind, parentId: id, handle: child });
    }
    children.forEach(child => tree.entries.set(child.id, child));
    entry.children = children.map(child => child.id);
  })();
  pendingReads.set(handle, read);
  try { await read; } finally { pendingReads.delete(handle); }
}

export async function treeFromHandle(handle: ReadonlyDirectoryHandle): Promise<FileTree> {
  const rootId = `local/${handle.name}`;
  const tree: FileTree = { rootId, entries: new Map([[rootId, { id: rootId, name: handle.name, kind: 'directory', handle }]]) };
  await loadDirectory(tree, rootId);
  return tree;
}

export function treeFromFiles(files: File[]): FileTree {
  const rootName = files[0]?.webkitRelativePath.split('/')[0] || '\u672c\u5730\u6587\u4ef6\u5939';
  const rootId = `local/${rootName}`;
  const entries = new Map<string, Entry>([[rootId, { id: rootId, name: rootName, kind: 'directory', children: [] }]]);
  for (const file of files) {
    const components = (file.webkitRelativePath || `${rootName}/${file.name}`).split('/').slice(1);
    let parentId = rootId;
    components.forEach((name, index) => {
      const id = `${parentId}/${name}`;
      if (!entries.has(id)) {
        const isFile = index === components.length - 1;
        entries.set(id, { id, name, parentId, kind: isFile ? 'file' : 'directory', children: isFile ? undefined : [], file: isFile ? file : undefined, size: isFile ? file.size : undefined, modified: isFile ? file.lastModified : undefined });
        entries.get(parentId)!.children!.push(id);
      }
      parentId = id;
    });
  }
  return { rootId, entries };
}

export async function readFile(entry: Entry): Promise<File | undefined> {
  if (entry.file) return entry.file;
  if (entry.handle?.kind === 'file') {
    const file = await entry.handle.getFile();
    entry.size = file.size;
    entry.modified = file.lastModified;
    return file;
  }
  if (entry.asset) {
    const response = await fetch(entry.asset);
    if (!response.ok) throw new Error('\u9884\u89c8\u8d44\u6e90\u8bfb\u53d6\u5931\u8d25');
    const blob = await response.blob();
    return new File([blob], entry.name, { type: blob.type });
  }
  if (entry.content !== undefined && entry.content !== '') return new File([entry.content], entry.name, { type: 'text/plain' });
  return undefined;
}
