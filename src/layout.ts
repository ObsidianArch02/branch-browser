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

// ---- Layout tuning constants (hand-tuned; group all magic numbers here) ----
/** Vertical padding added to each row beyond the font size. */
const ROW_PADDING = 6;
/** Estimated width (em) of an ASCII character; non-ASCII assumed full-width. */
const ASCII_CHAR_EM = 0.62;
/** Estimated width (em) of a non-ASCII character. */
const WIDE_CHAR_EM = 1;
/** Estimated average character width (em) used for connector start points. */
const CONNECTOR_CHAR_EM = 0.61;
/** Extra horizontal space (px) reserved around a panel in the tree layout. */
const PANEL_NODE_PADDING = 20;
/** Horizontal inset (px) from a panel edge to the text used for connector start. */
const TEXT_INSET = 8;
/** Connector routing: fraction of the inter-panel gap used for the bend. */
const BEND_GAP_FRACTION = 0.44;
/** Maximum number of distinct staggered connector lanes. */
const MAX_LANE = 9;
/** Vertical/horizontal offset (px) applied per connector lane index. */
const LANE_OFFSET = 3;
/** Minimum flextree spacing (px) between sibling subtrees. */
const TREE_SPACING = 14;
/** Minimum panel width (px). */
const MIN_PANEL_WIDTH = 100;
/** Maximum panel width as a multiple of fontSize. */
const MAX_PANEL_WIDTH_EM = 17;
/** Extra width (px) added to the longest label for a panel. */
const LABEL_EXTRA_WIDTH = 16;
/** Connector end inset (px) before the target panel edge. */
const END_INSET = 8;
/** Maximum connector corner radius (px). */
const MAX_RADIUS = 8;
/** Height (px) treated as the connection anchor for file-preview nodes. */
const PREVIEW_ANCHOR_HEIGHT = 24;
/** Maximum gap (px) for a single expanded child. */
const SINGLE_CHILD_GAP = 44;
/** Canvas bound paddings. */
const BOUNDS_LEFT = -16;
const BOUNDS_TOP = 24;
const BOUNDS_RIGHT = 36;
const BOUNDS_BOTTOM = 48;

export function buildLayout(tree: FileTree, activeId: string, settings: Settings, descending = false, preview?: PreviewRequest): GraphLayout {
  const path = new Set(ancestors(tree.entries, activeId).map(entry => entry.id));
  const previewPath = new Set(preview ? ancestors(tree.entries, preview.id).map(entry => entry.id) : []);
  const rowHeight = settings.fontSize + ROW_PADDING;
  function build(entry: Entry): NodeData {
    const rows = visibleChildren(tree.entries, entry, settings.hidden, descending);
    const children: NodeData[] = [];
    for (const row of rows) {
      if (row.kind === 'directory' && (path.has(row.id) || previewPath.has(row.id) || (entry.id === activeId && settings.previews))) children.push(build(row));
      else if (preview?.id === row.id && row.kind === 'file') children.push({ entry: row, rows: [], children: [], width: preview.width, height: preview.height, gap: 0, preview: true });
    }
    const longestLabel = rows.reduce((longest, row) => Math.max(longest, [...row.name].reduce((width, character) => width + (character.charCodeAt(0) < 128 ? ASCII_CHAR_EM : WIDE_CHAR_EM) * settings.fontSize, 0)), 0);
    const width = Math.max(MIN_PANEL_WIDTH, Math.min(settings.fontSize * MAX_PANEL_WIDTH_EM, longestLabel + LABEL_EXTRA_WIDTH));
    return { entry, rows, children, width, height: Math.max(1, rows.length) * rowHeight, gap: children.length > 1 ? settings.gap : Math.min(settings.gap, SINGLE_CHILD_GAP), preview: false };
  }
  const layout = flextree<NodeData>({ nodeSize: node => [node.data.height + PANEL_NODE_PADDING, node.data.width + node.data.gap], spacing: TREE_SPACING });
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
    const endY = to.y + (to.preview ? PREVIEW_ANCHOR_HEIGHT : to.height / 2);
    const approximateTextWidth = Math.min(from.width - TEXT_INSET, to.entry.name.length * settings.fontSize * CONNECTOR_CHAR_EM + 14);
    const startX = from.x + approximateTextWidth;
    const endX = to.x - END_INSET;
    const lane = node.parent.children && node.parent.children.length > 1 ? Math.min(rowIndex, MAX_LANE) * LANE_OFFSET : 0;
    const bendX = Math.min(endX - 10, from.x + from.width + node.parent.data.gap * BEND_GAP_FRACTION + lane);
    const radius = Math.min(MAX_RADIUS, Math.abs(endY - startY) / 2);
    const direction = Math.sign(endY - startY);
    const route = `M ${startX} ${startY} H ${bendX - radius} Q ${bendX} ${startY} ${bendX} ${startY + radius * direction} V ${endY - radius * direction} Q ${bendX} ${endY} ${bendX + radius} ${endY} H ${endX}`;
    connections.push({ id: to.id, path: route, active: path.has(to.id), preview: to.preview });
  }
  const minY = Math.min(...nodes.map(node => node.y));
  const maxY = Math.max(...nodes.map(node => node.y + node.height));
  return { panels, connections, preview: previewNode, bounds: { x: BOUNDS_LEFT, y: minY - BOUNDS_TOP, width: Math.max(...nodes.map(node => node.x + node.width)) + BOUNDS_RIGHT, height: maxY - minY + BOUNDS_BOTTOM }, rowHeight };
}

export function focusBounds(graph: GraphLayout, selectedId: string): Bounds {
  if (graph.preview?.id === selectedId) return graph.preview;
  const panel = graph.panels.find(item => item.rows.some(entry => entry.id === selectedId));
  if (panel) return { x: panel.x, y: panel.y + panel.rows.findIndex(entry => entry.id === selectedId) * graph.rowHeight, width: panel.width, height: graph.rowHeight };
  return graph.panels.find(item => item.id === selectedId) ?? graph.bounds;
}
