import type { CSSProperties } from 'react';
import { ChevronRight, Maximize, Minus, Plus } from 'lucide-react';
import { FilePreview } from './file-preview';
import { IconButton } from './icon-button';
import type { GraphLayout } from './layout';
import type { Camera, Entry, FileTree } from './types';

interface GraphViewProps {
  graph: GraphLayout;
  tree: FileTree;
  camera: Camera;
  viewport: { width: number; height: number };
  activeId: string;
  selectedId: string;
  pathIds: Set<string>;
  previews: boolean;
  fontSize: number;
  instant: boolean;
  onNavigate: (id: string) => void;
  onClickFile: (entry: Entry, clickCount: number) => void;
  onOpen: (entry: Entry) => void;
  onClosePreview: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onResetZoom: () => void;
}

function entryColor(entry: Entry, onPath: boolean, selected: boolean): string {
  if (selected) return 'selected';
  if (onPath) return 'on-path';
  if (entry.kind === 'directory') return 'directory';
  if (/\.(swift|ts|tsx|js|json|plist|csv|log|m4a)$/i.test(entry.name)) return 'code-file';
  if (/\.(txt|sh|png|pdf|xlsx)$/i.test(entry.name)) return 'blue-file';
  return 'plain-file';
}

export function GraphView({ graph, tree, camera, viewport, activeId, selectedId, pathIds, previews, fontSize, instant, onNavigate, onClickFile, onOpen, onClosePreview, onFit, onZoom, onResetZoom }: GraphViewProps) {
  const mapScale = Math.min(148 / graph.bounds.width, 82 / graph.bounds.height);
  const mapX = (160 - graph.bounds.width * mapScale) / 2 - graph.bounds.x * mapScale;
  const mapY = (94 - graph.bounds.height * mapScale) / 2 - graph.bounds.y * mapScale;

  return <>
    <div className={`graph-scene ${instant ? 'instant' : ''}`} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, fontSize }}>
      <svg className="connections" width={graph.bounds.width} height="1" aria-hidden="true">{graph.connections.map(connection => <path key={connection.id} d={connection.path} style={{ d: `path("${connection.path}")` } as CSSProperties} className={connection.preview ? 'preview-connection' : connection.active ? 'path-connection' : ''} />)}</svg>
      {graph.panels.map(panel => <div className={`directory-panel ${panel.id === activeId ? 'active-panel' : ''}`} key={panel.id} data-panel-id={panel.id} style={{ transform: `translate(${panel.x}px, ${panel.y}px)`, width: panel.width, height: panel.height }} aria-label={`${panel.entry.name} 目录`}>
        {panel.rows.length ? panel.rows.map(entry => <button key={entry.id} data-entry-id={entry.id} className={`entry-row ${entryColor(entry, pathIds.has(entry.id) || (panel.id === activeId && previews && entry.kind === 'directory'), selectedId === entry.id)}`} style={{ height: graph.rowHeight }} title={entry.name} aria-label={entry.name} aria-current={selectedId === entry.id ? 'true' : undefined} onClick={event => entry.kind === 'directory' ? onNavigate(entry.id) : onClickFile(entry, event.detail)} onDoubleClick={() => onOpen(entry)}><span className="selection-caret" /><span className="entry-name">{entry.name}</span>{entry.kind === 'directory' && <ChevronRight className="entry-chevron" size={12} />}</button>) : <span className="empty-directory" style={{ lineHeight: `${graph.rowHeight}px` }}>{panel.entry.children === undefined ? '读取中…' : '空文件夹'}</span>}
      </div>)}
      {graph.preview && <FilePreview key={graph.preview.id} node={graph.preview} tree={tree} selected={selectedId === graph.preview.id} onClose={onClosePreview} />}
    </div>
    <div className="minimap" aria-label="目录缩略图">
      <svg viewBox="0 0 160 94" aria-hidden="true"><g transform={`translate(${mapX} ${mapY}) scale(${mapScale})`}>
        {graph.connections.map(connection => <path key={connection.id} d={connection.path} className={connection.preview ? 'mini-preview-line' : connection.active ? 'mini-active-line' : ''} />)}
        {graph.panels.map(panel => <rect key={panel.id} x={panel.x} y={panel.y} width={panel.width * 0.72} height={panel.height} className={panel.id === activeId ? 'mini-active-panel' : ''} />)}
        {graph.preview && <rect className="mini-preview" x={graph.preview.x} y={graph.preview.y} width={graph.preview.width} height={graph.preview.height} />}
        <rect className="mini-viewport" x={-camera.x / camera.scale} y={-camera.y / camera.scale} width={viewport.width / camera.scale} height={viewport.height / camera.scale} />
      </g></svg>
      <button aria-label="缩放到全部目录" onClick={onFit} />
    </div>
    <div className="zoom-control">
      <IconButton label="缩小" onClick={() => onZoom(0.85)}><Minus size={15} /></IconButton>
      <button className="zoom-value" aria-label="重置为 100%" onClick={onResetZoom}>{Math.round(camera.scale * 100)}%</button>
      <IconButton label="放大" onClick={() => onZoom(1.18)}><Plus size={15} /></IconButton>
      <div className="zoom-divider" />
      <IconButton label="适应全部目录" onClick={onFit}><Maximize size={14} /></IconButton>
    </div>
  </>;
}
