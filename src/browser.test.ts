import { describe, expect, it } from 'vitest';
import { createDemo, DEMO_FOCUS, entryAtPath, visibleChildren } from './data';
import { loadDirectory, readFile, treeFromFiles } from './filesystem';
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
    expect(await (await readFile(imported))?.text()).toBe('hello local files');
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
    await Promise.all([loadDirectory(tree, 'root'), loadDirectory(tree, 'root')]);
    expect(reads).toBe(1);
    const childIds = tree.entries.get('root')!.children!;
    expect(childIds).toHaveLength(1);
    expect(tree.entries.get(childIds[0])!.name).toBe('notes.txt');
    expect(await (await readFile(tree.entries.get(childIds[0])!))?.text()).toBe('notes');
  });
});
