import { flextree } from 'd3-flextree';
import { ancestors, visibleChildren } from './data';
import type { Entry, FileTree, Settings } from './types';

interface NodeData { entry: Entry; rows: Entry[]; children: NodeData[]; width: number; height: number; gap: number; preview: boolean; }
export interface Bounds { x: number; y: number; width: number; height: number; }
export interface PreviewRequest { id: string; width: number; height: number; }
export interface PreviewNode extends PreviewRequest { x: number; y: number; entry: Entry; }
export interface Panel {
  id: string;
  entry: Entry;
  rows: Entry[];
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}
export interface Connection { id: string; path: string; active: boolean; preview: boolean; }
export interface GraphLayout {
  panels: Panel[];
  connections: Connection[];
  preview?: PreviewNode;
  bounds: Bounds;
  rowHeight: number;
}

export function buildLayout(tree: FileTree, activeId: string, settings: Settings, descending = false, preview?: PreviewRequest): GraphLayout {
  const path = new Set(ancestors(tree.entries, activeId).map(entry => entry.id));
  const previewPath = new Set(preview ? ancestors(tree.entries, preview.id).map(entry => entry.id) : []);
  const rowHeight = settings.fontSize + 6;
  function build(entry: Entry): NodeData {
    const rows = visibleChildren(tree.entries, entry, settings.hidden, descending);
    const children: NodeData[] = [];
    for (const row of rows) {
      if (row.kind === 'directory' && (path.has(row.id) || previewPath.has(row.id) || (entry.id === activeId && settings.previews))) children.push(build(row));
      else if (preview?.id === row.id && row.kind === 'file') children.push({ entry: row, rows: [], children: [], width: preview.width, height: preview.height, gap: 0, preview: true });
    }
    const longestLabel = rows.reduce((longest, row) => Math.max(longest, [...row.name].reduce((width, character) => width + (character.charCodeAt(0) < 128 ? 0.62 : 1) * settings.fontSize, 0)), 0);
    const width = Math.max(100, Math.min(settings.fontSize * 17, longestLabel + 16));
    return { entry, rows, children, width, height: Math.max(1, rows.length) * rowHeight, gap: children.length > 1 ? settings.gap : Math.min(settings.gap, 44), preview: false };
  }
  const layout = flextree<NodeData>({ nodeSize: node => [node.data.height + 20, node.data.width + node.data.gap], spacing: 14 });
  const root = layout.hierarchy(build(tree.entries.get(tree.rootId)!));
  layout(root);
  const nodes = root.descendants().map(node => ({ id: node.data.entry.id, entry: node.data.entry, rows: node.data.rows, x: node.y, y: node.x - node.data.height / 2, width: node.data.width, height: node.data.height, depth: node.depth, preview: node.data.preview }));
  const panels: Panel[] = nodes.filter(node => !node.preview);
  const previewNode = nodes.find(node => node.preview);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const connections: Connection[] = [];
  for (const node of root.descendants()) {
    if (!node.parent) continue;
    const from = byId.get(node.parent.data.entry.id)!;
    const to = byId.get(node.data.entry.id)!;
    const rowIndex = from.rows.findIndex(row => row.id === to.id);
    const startY = from.y + rowIndex * rowHeight + rowHeight / 2;
    const endY = to.y + (to.preview ? 24 : to.height / 2);
    const approximateTextWidth = Math.min(from.width - 8, to.entry.name.length * settings.fontSize * 0.61 + 14);
    const startX = from.x + approximateTextWidth;
    const endX = to.x - 8;
    const lane = node.parent.children && node.parent.children.length > 1 ? Math.min(rowIndex, 9) * 3 : 0;
    const bendX = Math.min(endX - 10, from.x + from.width + node.parent.data.gap * 0.44 + lane);
    const radius = Math.min(8, Math.abs(endY - startY) / 2);
    const direction = Math.sign(endY - startY);
    const route = `M ${startX} ${startY} H ${bendX - radius} Q ${bendX} ${startY} ${bendX} ${startY + radius * direction} V ${endY - radius * direction} Q ${bendX} ${endY} ${bendX + radius} ${endY} H ${endX}`;
    connections.push({ id: to.id, path: route, active: path.has(to.id), preview: to.preview });
  }
  const minY = Math.min(...nodes.map(node => node.y));
  const maxY = Math.max(...nodes.map(node => node.y + node.height));
  return { panels, connections, preview: previewNode, bounds: { x: -16, y: minY - 24, width: Math.max(...nodes.map(node => node.x + node.width)) + 36, height: maxY - minY + 48 }, rowHeight };
}

export function focusBounds(graph: GraphLayout, selectedId: string): Bounds {
  if (graph.preview?.id === selectedId) return graph.preview;
  const panel = graph.panels.find(item => item.rows.some(entry => entry.id === selectedId));
  if (panel) return { x: panel.x, y: panel.y + panel.rows.findIndex(entry => entry.id === selectedId) * graph.rowHeight, width: panel.width, height: graph.rowHeight };
  return graph.panels.find(item => item.id === selectedId) ?? graph.bounds;
}
