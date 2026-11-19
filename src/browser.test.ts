import { describe, expect, it } from 'vitest';
import { createDemo, DEMO_FOCUS, entryAtPath, fileType, visibleChildren } from './data';
import { createDirectorySource, readFile, sourceFromHandle, treeFromFiles } from './filesystem';
import { messages } from './i18n';
import { initialNavigation, navigationReducer } from './navigation';
import { buildLayout, focusBounds } from './layout';
import type { FileTree, ReadonlyDirectoryHandle } from './types';

const settings = { previews: true, hidden: true, fontSize: 15, gap: 110 };

/** Resolve a slash-separated path of entry names to an opaque entry id. */
function atPath(tree: FileTree, path: string): string {
  const entry = entryAtPath(tree, path);
  if (!entry) throw new Error(`no entry at path: ${path}`);
  return entry.id;
}
const focusId = (tree: FileTree) => atPath(tree, DEMO_FOCUS);

describe('localization', () => {
  it('formats counts and file types in the selected language', () => {
    const file = { id: 'file', kind: 'file', name: 'notes.txt' } as const;
    expect(messages.en.files(1)).toBe('1 file');
    expect(messages.en.directories(1200)).toBe('1,200 directories');
    expect(messages['zh-CN'].files(1)).toBe('1 个文件');
    expect(fileType(file, 'en')).toBe('TXT file');
    expect(fileType(file, 'zh-CN')).toBe('TXT 文件');
  });
});

describe('directory graph', () => {
  it('keeps variable-height sibling previews apart at every font size', () => {
    const tree = createDemo();
    for (const fontSize of [12, 15, 19]) {
      const graph = buildLayout(tree, focusId(tree), { ...settings, fontSize });
      const depths = new Set(graph.panels.map(panel => panel.depth));
      for (const depth of depths) {
        const panels = graph.panels.filter(panel => panel.depth === depth).sort((a, b) => a.y - b.y);
        for (let i = 1; i < panels.length; i++) expect(panels[i - 1].y + panels[i - 1].height).toBeLessThan(panels[i].y);
      }
      expect(graph.panels.filter(panel => panel.depth === 4)).toHaveLength(10);
    }
  });

  it('collapses previews while retaining the complete ancestor path', () => {
    const tree = createDemo();
    const graph = buildLayout(tree, focusId(tree), { ...settings, previews: false });
    expect(graph.panels.map(panel => panel.entry.name)).toEqual(['Users', 'drcode', 'file-browser', 'test-folders']);
    expect(graph.connections).toHaveLength(3);
    expect(graph.connections.every(connection => connection.active)).toBe(true);
  });

  it('reserves canvas space for file previews and includes them in the graph bounds', () => {
    const tree = createDemo();
    for (const path of ['Users/drcode/file-browser/README.md', `${DEMO_FOCUS}/02 Moria/Size Illusions.md`]) {
      const id = atPath(tree, path);
      for (const fontSize of [12, 15, 19]) {
        for (const descending of [false, true]) {
          const graph = buildLayout(tree, focusId(tree), { ...settings, fontSize }, descending, { id, width: 560, height: 420 });
          expect(graph.preview?.id).toBe(id);
          expect(graph.panels.some(panel => panel.rows.some(entry => entry.id === id))).toBe(true);
          expect(graph.connections.filter(connection => connection.preview).map(connection => connection.id)).toEqual([id]);
          const nodes = [...graph.panels, graph.preview!];
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            expect(node.x).toBeGreaterThanOrEqual(graph.bounds.x);
            expect(node.y).toBeGreaterThanOrEqual(graph.bounds.y);
            expect(node.x + node.width).toBeLessThanOrEqual(graph.bounds.x + graph.bounds.width);
            expect(node.y + node.height).toBeLessThanOrEqual(graph.bounds.y + graph.bounds.height);
            for (const other of nodes.slice(i + 1)) {
              const overlaps = node.x < other.x + other.width && node.x + node.width > other.x && node.y < other.y + other.height && node.y + node.height > other.y;
              expect(overlaps, `${node.id} intersects ${other.id}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('retains a preview source when child directories are collapsed', () => {
    const tree = createDemo();
    const id = atPath(tree, `${DEMO_FOCUS}/02 Moria/Size Illusions.md`);
    const graph = buildLayout(tree, focusId(tree), { ...settings, previews: false }, false, { id, width: 322, height: 420 });
    const source = graph.panels.find(panel => panel.id === graph.preview!.entry.parentId)!;
    expect(source).toBeDefined();
    expect(graph.preview!.x).toBeGreaterThan(source.x + source.width);
    expect(graph.preview!.width).toBe(322);
  });

  it('retains every filename and its original order while a preview opens and closes', () => {
    const tree = createDemo();
    const id = atPath(tree, `${DEMO_FOCUS}/02 Moria/Size Illusions.md`);
    const parentId = tree.entries.get(id)!.parentId!;
    for (const descending of [false, true]) {
      const original = visibleChildren(tree.entries, tree.entries.get(parentId)!, true, descending).map(entry => entry.id);
      const opened = buildLayout(tree, focusId(tree), settings, descending, { id, width: 560, height: 420 });
      expect(opened.panels.find(panel => panel.id === parentId)!.rows.map(entry => entry.id)).toEqual(original);
      const closed = buildLayout(tree, focusId(tree), settings, descending);
      expect(closed.panels.find(panel => panel.id === parentId)!.rows.map(entry => entry.id)).toEqual(original);
      expect(visibleChildren(tree.entries, tree.entries.get(parentId)!, true, descending).map(entry => entry.id)).toEqual(original);
    }
  });

  it('uses the preview as the selected file focus and returns to its row after closing', () => {
    const tree = createDemo();
    const id = atPath(tree, `${DEMO_FOCUS}/02 Moria/Size Illusions.md`);
    const opened = buildLayout(tree, focusId(tree), settings, false, { id, width: 560, height: 420 });
    expect(focusBounds(opened, id)).toBe(opened.preview);
    const closed = buildLayout(tree, focusId(tree), settings);
    const panel = closed.panels.find(item => item.rows.some(entry => entry.id === id))!;
    expect(focusBounds(closed, id)).toEqual({ x: panel.x, y: panel.y + panel.rows.findIndex(entry => entry.id === id) * closed.rowHeight, width: panel.width, height: closed.rowHeight });
    expect(focusBounds(closed, tree.rootId)).toBe(closed.panels.find(item => item.id === tree.rootId));
  });

  it('keeps the only file in a directory visible and connected to its preview', () => {
    const file = new File(['notes'], 'only.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'single/only.txt' });
    const tree = treeFromFiles([file]);
    const id = tree.entries.get(tree.rootId)!.children![0];
    const graph = buildLayout(tree, tree.rootId, settings, false, { id, width: 560, height: 420 });
    expect(graph.panels[0].rows.map(entry => entry.id)).toEqual([id]);
    expect(graph.preview?.id).toBe(id);
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0].path).not.toMatch(/NaN|Infinity/);
    expect(tree.entries.get(tree.rootId)!.children).toEqual([id]);
  });

  it('removes a filtered file preview from both the layout and connections', () => {
    const tree = createDemo();
    const id = atPath(tree, 'Users/drcode/file-browser/.gitignore');
    const graph = buildLayout(tree, focusId(tree), { ...settings, hidden: false }, false, { id, width: 560, height: 420 });
    expect(graph.preview).toBeUndefined();
    expect(graph.connections.some(connection => connection.preview)).toBe(false);
  });

  it('uses natural filename order and filters dotfiles', () => {
    const tree = createDemo();
    const rohan = tree.entries.get(atPath(tree, `${DEMO_FOCUS}/03 Rohan`))!;
    const rows = visibleChildren(tree.entries, rohan, true).map(entry => entry.name);
    expect(rows.indexOf('Horse 2.txt')).toBeLessThan(rows.indexOf('Horse 10.txt'));
    const project = tree.entries.get(atPath(tree, 'Users/drcode/file-browser'))!;
    expect(visibleChildren(tree.entries, project, false).some(entry => entry.name.startsWith('.'))).toBe(false);
  });
});

describe('local directories', () => {
  it('preserves nesting, unusual filenames, and actual file contents on import', async () => {
    const file = new File(['hello local files'], "space & quote's.txt", { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: `sample/nested/${file.name}` });
    const tree = treeFromFiles([file]);
    // Walk by names since ids are opaque.
    const root = tree.entries.get(tree.rootId)!;
    const nestedDir = root.children!.map(c => tree.entries.get(c)!).find(e => e.name === 'nested')!;
    expect(nestedDir.kind).toBe('directory');
    const imported = tree.entries.get(nestedDir.children![0])!;
    expect(imported.name).toBe(file.name);
    expect(await (await readFile(imported)).file?.text()).toBe('hello local files');
  });

  it('coalesces concurrent native reads without duplicating children', async () => {
    let reads = 0;
    const handle: ReadonlyDirectoryHandle = {
      kind: 'directory', name: 'root',
      async *values() {
        reads++;
        await Promise.resolve();
        yield { kind: 'file' as const, name: 'notes.txt', getFile: async () => new File(['notes'], 'notes.txt') };
      },
    };
    const tree: FileTree = { rootId: 'root', entries: new Map([['root', { id: 'root', name: 'root', kind: 'directory', handle }]]) };
    const source = createDirectorySource(tree);
    await Promise.all([source.load('root'), source.load('root')]);
    const loaded = source.getSnapshot();
    await source.load('root');
    expect(reads).toBe(1);
    const childIds = loaded.entries.get('root')!.children!;
    expect(childIds).toHaveLength(1);
    expect(loaded.entries.get(childIds[0])!.name).toBe('notes.txt');
    expect(await (await readFile(loaded.entries.get(childIds[0])!)).file?.text()).toBe('notes');
    // The input tree is left untouched by the immutable load.
    expect(tree.entries.get('root')!.children).toBeUndefined();
  });

  it('retains both directory updates when different reads finish out of order', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    function directory(name: string, ready: Promise<void>): ReadonlyDirectoryHandle {
      return {
        kind: 'directory', name,
        async *values() {
          await ready;
          yield { kind: 'file' as const, name: `${name}.txt`, getFile: async () => new File([], `${name}.txt`) };
        },
      };
    }
    const source = await sourceFromHandle({
      kind: 'directory', name: 'root',
      async *values() {
        yield directory('slow', gate);
        yield directory('fast', Promise.resolve());
      },
    });
    const initial = source.getSnapshot();
    const [slowId, fastId] = initial.entries.get(initial.rootId)!.children!;
    const reading = source.load(slowId);
    await source.load(fastId);
    const partial = source.getSnapshot();
    release();
    await reading;

    const complete = source.getSnapshot();
    expect(complete.entries.get(fastId)).toBe(partial.entries.get(fastId));
    expect(partial.entries.get(slowId)?.children).toBeUndefined();
    expect([...complete.entries.values()].filter(entry => entry.kind === 'file').map(entry => entry.name).sort()).toEqual(['fast.txt', 'slow.txt']);
  });

  it('propagates a rejected directory read and leaves the directory unloaded', async () => {
    const handle: ReadonlyDirectoryHandle = {
      kind: 'directory', name: 'root',
      // eslint-disable-next-line require-await
      async *values() { throw new Error('denied'); },
    };
    const tree: FileTree = { rootId: 'root', entries: new Map([['root', { id: 'root', name: 'root', kind: 'directory', handle }]]) };
    const source = createDirectorySource(tree);
    await expect(source.load('root')).rejects.toThrow('denied');
    // The directory is still considered unloaded and the read is retried on the next call.
    expect(source.getSnapshot()).toBe(tree);
    await expect(source.load('root')).rejects.toThrow('denied');
  });

  it('imports a file without a webkitRelativePath under a default folder name', () => {
    const file = new File(['data'], 'loose.txt', { type: 'text/plain' });
    const tree = treeFromFiles([file]);
    const root = tree.entries.get(tree.rootId)!;
    expect(root.name).toBe('Local folder');
    expect(root.children).toHaveLength(1);
    const entry = tree.entries.get(root.children![0])!;
    expect(entry.name).toBe('loose.txt');
    expect(entry.kind).toBe('file');
  });

  it('never collides entry ids for names that would collide under a path scheme', () => {
    const literal = new File(['x'], 'a/b', { type: 'text/plain' });
    Object.defineProperty(literal, 'webkitRelativePath', { value: 'root/a/b' });
    const nestedA = new File(['y'], 'b', { type: 'text/plain' });
    Object.defineProperty(nestedA, 'webkitRelativePath', { value: 'root/nested/b' });
    const tree = treeFromFiles([literal, nestedA]);
    const ids = [...tree.entries.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    // Both files named "b" (one literally "a/b") exist as distinct entries.
    const bs = [...tree.entries.values()].filter(e => e.name === 'b');
    expect(bs).toHaveLength(2);
    expect(bs[0].id).not.toBe(bs[1].id);
  });
});

describe('navigation reducer', () => {
  const hidden = true;
  const descending = false;
  function setup() {
    const tree = createDemo();
    const state = initialNavigation(tree, DEMO_FOCUS, `${DEMO_FOCUS}/02 Moria`);
    return { tree, state };
  }

  it('navigates into a directory, records history, and selects its first child', () => {
    const { tree, state } = setup();
    const moria = entryAtPath(tree, `${DEMO_FOCUS}/02 Moria`)!;
    const next = navigationReducer(state, { type: 'navigate', tree, id: moria.id, hidden, descending });
    expect(next.activeId).toBe(moria.id);
    expect(next.previewId).toBeUndefined();
    expect(next.history.items[next.history.index]).toBe(moria.id);
    const first = visibleChildren(tree.entries, moria, hidden, descending)[0];
    expect(next.selectedId).toBe(first.id);
  });

  it('walks history back and forward without pushing duplicate entries', () => {
    const { tree, state } = setup();
    const moria = entryAtPath(tree, `${DEMO_FOCUS}/02 Moria`)!;
    let s = navigationReducer(state, { type: 'navigate', tree, id: moria.id, hidden, descending });
    s = navigationReducer(s, { type: 'history', delta: -1, tree, hidden, descending });
    expect(s.activeId).toBe(state.activeId);
    expect(s.history.index).toBe(0);
    s = navigationReducer(s, { type: 'history', delta: 1, tree, hidden, descending });
    expect(s.activeId).toBe(moria.id);
    expect(s.history.index).toBe(1);
    expect(s.history.items).toHaveLength(2);
  });

  it('clears the preview when selecting a directory while a preview is open', () => {
    const { tree, state } = setup();
    const moria = entryAtPath(tree, `${DEMO_FOCUS}/02 Moria`)!;
    const file = visibleChildren(tree.entries, moria, hidden, descending).find(e => e.kind === 'file')!;
    const dir = visibleChildren(tree.entries, moria, hidden, descending).find(e => e.kind === 'directory')!;
    let s = navigationReducer(state, { type: 'preview', id: file.id });
    expect(s.previewId).toBe(file.id);
    s = navigationReducer(s, { type: 'select', id: dir.id, kind: 'directory' });
    expect(s.previewId).toBeUndefined();
    expect(s.selectedId).toBe(dir.id);
  });
});
