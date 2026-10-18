import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ArrowDownAZ, ArrowLeft, ArrowRight, Check, ChevronRight, Database, Download, Eye, EyeOff, File, FileCode2, Folder, FolderOpen, GitBranch, List, LoaderCircle, Maximize, Minus, Network, Plus, Search, Settings2, X } from 'lucide-react';
import { ancestors, createDemo, DEMO_FOCUS, entryAtPath, fileType, formatSize, visibleChildren } from './data';
import { loadDirectory, readFile, treeFromFiles, treeFromHandle } from './filesystem';
import { buildLayout, focusBounds } from './layout';
import type { PreviewNode } from './layout';
import type { Camera, Entry, FileTree, Point, Settings } from './types';

const initialSettings: Settings = { previews: true, hidden: true, fontSize: 15, gap: 110 };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '读取文件夹失败';

/** Merge the entries of a freshly loaded tree into `base`, producing a new FileTree. */
function mergeTrees(base: FileTree, loaded: FileTree): FileTree {
  if (loaded === base) return base;
  const entries = new Map(base.entries);
  let changed = false;
  for (const [id, entry] of loaded.entries) if (entries.get(id) !== entry) { entries.set(id, entry); changed = true; }
  return changed ? { ...base, entries } : base;
}

function IconButton({ label, children, active, className = '', ...props }: { label: string; children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" aria-label={label} data-tooltip={label} aria-pressed={active} className={`icon-button ${active ? 'is-active' : ''} ${className}`}>{children}</button>;
}

function entryColor(entry: Entry, onPath: boolean, selected: boolean): string {
  if (selected) return 'selected';
  if (onPath) return 'on-path';
  if (entry.kind === 'directory') return 'directory';
  if (/\.(swift|ts|tsx|js|json|plist|csv|log|m4a)$/i.test(entry.name)) return 'code-file';
  if (/\.(txt|sh|png|pdf|xlsx)$/i.test(entry.name)) return 'blue-file';
  return 'plain-file';
}

function Preview({ node, tree, selected, onClose }: { node: PreviewNode; tree: FileTree; selected: boolean; onClose: () => void }) {
  const { entry } = node;
  const [state, setState] = useState<{ loading: boolean; file?: File; text?: string; url?: string; error?: string; binary?: boolean; size?: number; modified?: number }>({ loading: true });
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setState({ loading: true });
    (async () => {
      try {
        const { file, entry: patched } = await readFile(entry);
        if (disposed) return;
        const size = patched?.size;
        const modified = patched?.modified;
        if (!file) { setState({ loading: false, size, modified }); return; }
        const media = /^(image|video|audio)\//.test(file.type) || /\.(png|jpe?g|webp|gif|svg|mp4|webm|mp3|wav|m4a|ogg|pdf)$/i.test(entry.name);
        if (media) {
          objectUrl = URL.createObjectURL(file);
          setState({ loading: false, file, url: objectUrl, size, modified });
        } else {
          const bytes = await file.slice(0, 512 * 1024).arrayBuffer();
          if (disposed) return;
          const binary = new Uint8Array(bytes).some(byte => byte === 0);
          setState({ loading: false, file, binary, text: binary ? undefined : new TextDecoder().decode(bytes), size, modified });
        }
      } catch (error) {
        if (!disposed) setState({ loading: false, error: errorMessage(error) });
      }
    })();
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [entry]);

  function download() {
    if (!state.file) return;
    const url = URL.createObjectURL(state.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = entry.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const image = /\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name) || state.file?.type.startsWith('image/');
  const video = /\.(mp4|webm)$/i.test(entry.name) || state.file?.type.startsWith('video/');
  const audio = /\.(mp3|wav|m4a|ogg)$/i.test(entry.name) || state.file?.type.startsWith('audio/');
  return <section className="preview" aria-label="文件预览" aria-current={selected ? 'true' : undefined} data-preview-id={entry.id} style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.width, height: node.height }}>
    <header className="preview-toolbar"><FileCode2 size={17} strokeWidth={1.5} /><h2 title={entry.name}>{entry.name}</h2><div className="button-group"><IconButton label="下载文件" disabled={!state.file} onClick={download}><Download size={16} /></IconButton><IconButton label="关闭预览" onClick={onClose}><X size={17} /></IconButton></div></header>
    <div className="preview-meta"><span>{fileType(entry)}</span><span>{formatSize(state.file?.size ?? state.size ?? entry.size)}</span><time>{(state.modified ?? entry.modified) ? new Date((state.modified ?? entry.modified)!).toLocaleString('zh-CN', { hour12: false }) : '--'}</time></div>
    <div className="preview-content" tabIndex={0} aria-label={`${entry.name} 内容`}>
      {state.loading ? <div className="preview-empty"><LoaderCircle className="spin" size={24} /><span>正在读取</span></div>
        : state.error ? <div className="preview-empty error-text">{state.error}</div>
          : state.url && image ? <img className="image-preview" src={state.url} alt={entry.name} />
            : state.url && video ? <video className="media-preview" src={state.url} controls />
              : state.url && audio ? <audio className="audio-preview" src={state.url} controls />
                : state.url && /\.pdf$/i.test(entry.name) ? <iframe className="pdf-preview" title={entry.name} src={state.url} />
                  : state.text !== undefined ? <><div className="code-preview">{state.text.split('\n').map((line, index) => <div className="code-line" key={index}><span>{index + 1}</span><code>{line || ' '}</code></div>)}</div>{state.file && state.file.size > 512 * 1024 && <div className="truncated-notice">显示前 512 KB</div>}</>
                    : <div className="preview-empty"><File size={32} strokeWidth={1} /><span>{state.binary ? '此文件暂不支持预览' : entry.content === '' ? '空文件' : '示例文件未包含内容'}</span></div>}
    </div>
    <div className="preview-path">{ancestors(tree.entries, entry.id).map(item => item.name).join('/')}</div>
  </section>;
}

export default function App() {
  const [tree, setTree] = useState<FileTree>(createDemo);
  const [activeId, setActiveId] = useState(() => entryAtPath(tree, DEMO_FOCUS)!.id);
  const [selectedId, setSelectedId] = useState(() => entryAtPath(tree, `${DEMO_FOCUS}/02 Moria`)!.id);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [descending, setDescending] = useState(false);
  const [navigation, setNavigation] = useState(() => ({ items: [entryAtPath(tree, DEMO_FOCUS)!.id], index: 0 }));
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ width: 1200, height: 760 });
  const [autoCenter, setAutoCenter] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [wheelZooming, setWheelZooming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string>();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  const viewportRef = useRef(viewport);
  const pointerPositions = useRef(new Map<number, Point>());
  const panOrigin = useRef<{ point: Point; camera: Camera; distance?: number } | undefined>(undefined);
  const importVersion = useRef(0);
  const wheelTimer = useRef<number | undefined>(undefined);
  const selectionTimer = useRef<number | undefined>(undefined);
  const framedPreview = useRef<string | undefined>(undefined);
  cameraRef.current = camera;

  const cancelSelection = useCallback(() => { window.clearTimeout(selectionTimer.current); selectionTimer.current = undefined; }, []);
  useEffect(() => cancelSelection, [tree, activeId, view, settingsOpen, cancelSelection]);

  const active = tree.entries.get(activeId)!;
  const selected = tree.entries.get(selectedId);
  const path = useMemo(() => ancestors(tree.entries, activeId), [tree, activeId]);
  const pathIds = useMemo(() => new Set(path.map(entry => entry.id)), [path]);
  const previewWidth = viewport.width < 700 ? Math.max(280, viewport.width - 68) : 560;
  const graph = useMemo(() => buildLayout(tree, activeId, settings, descending, previewId ? { id: previewId, width: previewWidth, height: 420 } : undefined), [tree, activeId, settings, descending, previewId, previewWidth]);
  const focus = useMemo(() => focusBounds(graph, selectedId), [graph, selectedId]);
  const centeredCamera = useCallback((scale: number): Camera => ({ scale, x: viewport.width / 2 - (focus.x + focus.width / 2) * scale, y: viewport.height / 2 - (focus.y + focus.height / 2) * scale }), [focus, viewport]);
  const currentRows = visibleChildren(tree.entries, active, settings.hidden, descending);
  const isDemo = tree.demo === true;
  const counts = useMemo(() => {
    let directories = 0, files = 0;
    for (const entry of tree.entries.values()) if (entry.kind === 'directory') directories++; else files++;
    return { directories, files };
  }, [tree]);
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const needle = query.trim().toLocaleLowerCase();
    return [...tree.entries.values()].filter(entry => entry.id !== tree.rootId && (settings.hidden || !ancestors(tree.entries, entry.id).some(item => item.parentId && item.name.startsWith('.'))) && entry.name.toLocaleLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).slice(0, 100);
  }, [query, tree, settings.hidden]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        // Merge each freshly loaded tree into state; entries accumulate immutably.
        let next = await loadDirectory(tree, activeId);
        setTree(current => mergeTrees(current, next));
        if (settings.previews) {
          const children = visibleChildren(next.entries, next.entries.get(activeId)!, settings.hidden).filter(entry => entry.kind === 'directory');
          for (let i = 0; i < children.length; i += 8) {
            if (cancelled) return;
            const batch = await Promise.all(children.slice(i, i + 8).map(entry => loadDirectory(next, entry.id)));
            next = batch.reduce((acc, t) => mergeTrees(acc, t), next);
            setTree(current => batch.reduce((acc, t) => mergeTrees(acc, t), current));
          }
        }
      } catch (error) { if (!cancelled) setToast(errorMessage(error)); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [tree, activeId, settings.previews, settings.hidden]);

  useEffect(() => {
    if (!query.trim() || isDemo) { setSearching(false); return; }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setSearching(true);
      const queue = [tree.rootId];
      try {
        let next = tree;
        while (queue.length && !cancelled) {
          const ids = queue.splice(0, 8);
          const batch = await Promise.all(ids.map(id => loadDirectory(next, id)));
          next = batch.reduce((acc, t) => mergeTrees(acc, t), next);
          for (const id of ids) {
            for (const child of visibleChildren(next.entries, next.entries.get(id)!, settings.hidden)) if (child.kind === 'directory') queue.push(child.id);
          }
          if (!cancelled) setTree(current => batch.reduce((acc, t) => mergeTrees(acc, t), current));
        }
      } catch (error) { if (!cancelled) setToast(errorMessage(error)); }
      finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query, tree, settings.hidden, isDemo]);

  useLayoutEffect(() => {
    const resized = viewportRef.current.width !== viewport.width || viewportRef.current.height !== viewport.height;
    viewportRef.current = viewport;
    if (view !== 'graph' || dragging) return;
    const node = graph.preview;
    const previewFocused = node?.id === selectedId;
    const openingPreview = previewFocused && framedPreview.current !== node.id;
    framedPreview.current = previewFocused ? node.id : undefined;
    setCamera(old => {
      let scale = old.scale;
      if (openingPreview || (previewFocused && resized)) scale = clamp(Math.min(openingPreview ? 1 : old.scale, (viewport.width - 64) / focus.width, (viewport.height - 160) / focus.height), 0.08, 1);
      else if (autoCenter) scale = viewport.width < 700 ? 0.8 : Math.min(1, (viewport.width - 72) / graph.bounds.width);
      return centeredCamera(scale);
    });
  }, [graph, viewport, selectedId, view, dragging, autoCenter, focus, centeredCamera]);

  const fit = useCallback(() => {
    const bounds = graph.bounds;
    const centerX = focus.x + focus.width / 2;
    const centerY = focus.y + focus.height / 2;
    const width = 2 * Math.max(centerX - bounds.x, bounds.x + bounds.width - centerX);
    const height = 2 * Math.max(centerY - bounds.y, bounds.y + bounds.height - centerY);
    const scale = clamp(Math.min((viewport.width - 80) / width, (viewport.height - 120) / height), 0.08, 2);
    setAutoCenter(false);
    setCamera(centeredCamera(scale));
  }, [graph, viewport, focus, centeredCamera]);

  const zoom = useCallback((factor: number) => {
    setAutoCenter(false);
    setCamera(old => centeredCamera(clamp(old.scale * factor, 0.08, 3)));
  }, [centeredCamera]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || view !== 'graph') return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey && (event.target as Element).closest('.preview-content')) return;
      event.preventDefault();
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportRef.current.height : 1);
      setWheelZooming(true);
      zoom(Math.exp(-clamp(delta, -160, 160) * (event.ctrlKey || event.metaKey ? 0.01 : 0.002)));
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => setWheelZooming(false), 140);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); window.clearTimeout(wheelTimer.current); setWheelZooming(false); };
  }, [zoom, view]);

  const navigate = useCallback((id: string, addHistory = true) => {
    const entry = tree.entries.get(id);
    if (!entry || entry.kind !== 'directory') return;
    cancelSelection();
    setActiveId(id);
    setSelectedId(visibleChildren(tree.entries, entry, settings.hidden, descending)[0]?.id ?? id);
    setPreviewId(undefined);
    setAutoCenter(true);
    setSearchOpen(false);
    setQuery('');
    if (addHistory) setNavigation(old => old.items[old.index] === id ? old : { items: [...old.items.slice(0, old.index + 1), id], index: old.index + 1 });
  }, [tree, settings.hidden, descending, cancelSelection]);

  useEffect(() => {
    if (settings.hidden) return;
    const hiddenAncestor = path.findIndex(entry => entry.parentId && entry.name.startsWith('.'));
    if (hiddenAncestor > 0) navigate(path[hiddenAncestor - 1].id);
    else if (selected?.name.startsWith('.') && selected.parentId === activeId) setSelectedId(currentRows[0]?.id ?? activeId);
    if (previewId && ancestors(tree.entries, previewId).some(entry => entry.parentId && entry.name.startsWith('.'))) setPreviewId(undefined);
  }, [settings.hidden]);

  function goHistory(delta: number) {
    const index = navigation.index + delta;
    if (index < 0 || index >= navigation.items.length) return;
    navigate(navigation.items[index], false);
    setNavigation(old => ({ ...old, index }));
  }

  function selectEntry(entry: Entry) {
    cancelSelection();
    setSelectedId(entry.id);
    setAutoCenter(false);
    if (previewId) setPreviewId(entry.kind === 'file' ? entry.id : undefined);
  }

  function clickFile(entry: Entry, clickCount: number) {
    cancelSelection();
    // Keep the target stationary until the browser has a chance to register a double click.
    if (clickCount === 1) selectionTimer.current = window.setTimeout(() => selectEntry(entry), 350);
    else if (clickCount === 0) selectEntry(entry);
  }

  function showPreview(entry: Entry) {
    cancelSelection();
    setSelectedId(entry.id);
    setPreviewId(entry.id);
    setView('graph');
    setAutoCenter(false);
    canvasRef.current?.focus({ preventScroll: true });
  }

  function closePreview() {
    cancelSelection();
    setPreviewId(undefined);
    setAutoCenter(false);
    canvasRef.current?.focus({ preventScroll: true });
  }

  function openEntry(entry: Entry) {
    if (entry.kind === 'directory') navigate(entry.id);
    else showPreview(entry);
  }

  function selectSearchResult(entry: Entry) {
    if (entry.kind === 'directory') navigate(entry.id);
    else {
      if (entry.parentId) navigate(entry.parentId);
      showPreview(entry);
    }
    setSearchOpen(false);
    setQuery('');
  }

  useEffect(() => { setSearchIndex(0); }, [query]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!settingsOpen) return;
    const onOutside = (event: PointerEvent) => { if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false); };
    window.addEventListener('pointerdown', onOutside);
    return () => window.removeEventListener('pointerdown', onOutside);
  }, [settingsOpen]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closePreview(); setSettingsOpen(false); setSearchOpen(false); searchInput.current?.blur(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key === 'f' || event.key === '/' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault(); searchInput.current?.focus(); setSearchOpen(true); return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || settingsOpen) return;
      if (view === 'graph' && previewId && (event.key === 'ArrowLeft' || event.key === 'Backspace')) {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.target instanceof Element && event.target.closest('.preview-content, .preview button')) return;
      if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault(); if (event.key === '0') fit(); else zoom(event.key === '-' ? 0.85 : 1.18); return;
      }
      if (!selected) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const parent = tree.entries.get(selected.parentId ?? activeId)!;
        const siblings = visibleChildren(tree.entries, parent, settings.hidden, descending);
        const index = siblings.findIndex(entry => entry.id === selectedId);
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1 : clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, siblings.length - 1);
        if (siblings[nextIndex]) selectEntry(siblings[nextIndex]);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (selected.kind === 'directory') {
          if (selected.id === activeId && currentRows.length) selectEntry(currentRows[0]);
          else navigate(selected.id);
        } else showPreview(selected);
      } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
        event.preventDefault();
        const parent = selected.parentId ? tree.entries.get(selected.parentId) : undefined;
        if (parent) {
          if (selected.id === activeId) {
            navigate(parent.id);
            selectEntry(selected);
          } else {
            if (pathIds.has(parent.id) && parent.id !== activeId) navigate(parent.id);
            selectEntry(parent);
          }
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (selected.kind === 'directory') navigate(selected.id); else showPreview(selected);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [tree, active, activeId, selected, selectedId, settings.hidden, descending, currentRows, previewId, settingsOpen, view, fit, zoom, navigate, pathIds]);

  async function installTree(nextTree: FileTree) {
    setTree(nextTree);
    setActiveId(nextTree.rootId);
    setSelectedId(visibleChildren(nextTree.entries, nextTree.entries.get(nextTree.rootId)!, settings.hidden, descending)[0]?.id ?? nextTree.rootId);
    setNavigation({ items: [nextTree.rootId], index: 0 });
    setPreviewId(undefined);
    setQuery('');
    setAutoCenter(true);
  }

  async function openFolder() {
    const version = ++importVersion.current;
    if (!window.showDirectoryPicker) { fileInput.current?.click(); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      setBusy(true);
      const nextTree = await treeFromHandle(handle);
      if (version === importVersion.current) await installTree(nextTree);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (error instanceof Error && ['SecurityError', 'NotAllowedError'].includes(error.name)) fileInput.current?.click();
      else setToast(errorMessage(error));
    } finally { if (version === importVersion.current) setBusy(false); }
  }

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) void installTree(treeFromFiles(files));
    event.target.value = '';
  }

  function resetDemo() {
    importVersion.current++;
    const next = createDemo();
    const focusId = entryAtPath(next, DEMO_FOCUS)!.id;
    const selectId = entryAtPath(next, `${DEMO_FOCUS}/02 Moria`)!.id;
    setTree(next); setActiveId(focusId); setSelectedId(selectId);
    setNavigation({ items: [focusId], index: 0 });
    setPreviewId(undefined); setQuery(''); setAutoCenter(true);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, .preview-content, .preview-meta, .preview-path, .minimap, .zoom-control')) return;
    cancelSelection();
    event.currentTarget.focus({ preventScroll: true });
    const point = { x: event.clientX, y: event.clientY };
    pointerPositions.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const scene = event.currentTarget.querySelector('.graph-scene');
    const transform = scene ? new DOMMatrixReadOnly(getComputedStyle(scene).transform) : undefined;
    const visibleCamera = transform ? { x: transform.m41, y: transform.m42, scale: transform.a } : cameraRef.current;
    setCamera(visibleCamera);
    cameraRef.current = visibleCamera;
    setAutoCenter(false);
    setDragging(true);
    const points = [...pointerPositions.current.values()];
    panOrigin.current = { point: points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : point, camera: visibleCamera, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : undefined };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerPositions.current.has(event.pointerId) || !panOrigin.current) return;
    pointerPositions.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointerPositions.current.values()];
    const origin = panOrigin.current;
    if (points.length > 1 && origin.distance) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const rect = event.currentTarget.getBoundingClientRect();
      const pivot = { x: origin.point.x - rect.left, y: origin.point.y - rect.top };
      const scale = clamp(origin.camera.scale * distance / origin.distance, 0.08, 3);
      setCamera({ scale, x: pivot.x - (pivot.x - origin.camera.x) * scale / origin.camera.scale + center.x - origin.point.x, y: pivot.y - (pivot.y - origin.camera.y) * scale / origin.camera.scale + center.y - origin.point.y });
    } else {
      setCamera({ ...origin.camera, x: origin.camera.x + event.clientX - origin.point.x, y: origin.camera.y + event.clientY - origin.point.y });
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointerPositions.current.delete(event.pointerId);
    const remaining = [...pointerPositions.current.values()];
    if (remaining.length) panOrigin.current = { point: remaining[0], camera: cameraRef.current };
    else { panOrigin.current = undefined; setDragging(false); }
  }

  const mapScale = Math.min(148 / graph.bounds.width, 82 / graph.bounds.height);
  const mapX = (160 - graph.bounds.width * mapScale) / 2 - graph.bounds.x * mapScale;
  const mapY = (94 - graph.bounds.height * mapScale) / 2 - graph.bounds.y * mapScale;
  const selectedPath = selected ? ancestors(tree.entries, selected.id).map(entry => entry.name).join(' / ') : active.name;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><GitBranch size={19} strokeWidth={1.6} /><span>branch<span className="brand-dot">.</span></span></div>
      <div className="history-controls"><IconButton label="后退" disabled={navigation.index === 0} onClick={() => goHistory(-1)}><ArrowLeft size={16} /></IconButton><IconButton label="前进" disabled={navigation.index === navigation.items.length - 1} onClick={() => goHistory(1)}><ArrowRight size={16} /></IconButton></div>
      <nav className="breadcrumbs" aria-label="当前路径">{path.map((entry, index) => <span key={entry.id}>{index > 0 && <ChevronRight size={12} />}<button onClick={() => navigate(entry.id)} className={entry.id === activeId ? 'current-crumb' : ''}>{entry.name}</button></span>)}</nav>
      <div className="search-wrap">
        <Search size={15} />
        <input ref={searchInput} aria-label="搜索文件" placeholder="搜索文件" value={query} onFocus={() => setSearchOpen(true)} onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setSearchOpen(false); }} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, searchResults.length - 1)); }
          else if (event.key === 'Enter' && searchResults[searchIndex]) selectSearchResult(searchResults[searchIndex]);
        }} />
        {query && <button aria-label="清除搜索" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={13} /></button>}
        {searchOpen && query.trim() && <div className="search-results" role="listbox" aria-label="搜索结果"><div className="search-results-heading">搜索结果 <span>{searching ? <LoaderCircle size={12} className="spin" /> : <>{searchResults.length}{searchResults.length === 100 ? '+' : ''}</>}</span></div>{searchResults.length ? searchResults.map((entry, index) => <button role="option" aria-selected={index === searchIndex} key={entry.id} onMouseDown={event => event.preventDefault()} onClick={() => selectSearchResult(entry)} className={index === searchIndex ? 'search-highlight' : ''}>{entry.kind === 'directory' ? <Folder size={16} /> : <File size={16} />}<span><strong>{entry.name}</strong><small>{ancestors(tree.entries, entry.parentId ?? entry.id).map(item => item.name).join(' / ')}</small></span><ChevronRight size={13} /></button>) : <div className="no-results">{searching ? '正在搜索' : '没有匹配的文件'}</div>}</div>}
      </div>
      <div className="topbar-tools">
        <div className="view-toggle" role="group" aria-label="视图"><IconButton label="目录图" active={view === 'graph'} onClick={() => setView('graph')}><Network size={16} /></IconButton><IconButton label="列表" active={view === 'list'} onClick={() => setView('list')}><List size={17} /></IconButton></div>
        <button className="open-folder" aria-label="打开文件夹" title="打开文件夹" onClick={() => void openFolder()}><FolderOpen size={16} /><span>打开文件夹</span></button>
        <div className="settings-anchor" ref={settingsRef}><IconButton label="显示设置" active={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><Settings2 size={17} /></IconButton>{settingsOpen && <div className="settings-popover"><div className="popover-heading">显示设置</div><div className="settings-view-switch"><span>视图</span><div className="view-toggle" role="group" aria-label="移动端视图"><IconButton label="目录图" active={view === 'graph'} onClick={() => { setView('graph'); setSettingsOpen(false); }}><Network size={16} /></IconButton><IconButton label="列表" active={view === 'list'} onClick={() => { setView('list'); setSettingsOpen(false); }}><List size={17} /></IconButton></div></div><label className="setting-toggle"><span>子目录预览</span><input type="checkbox" checked={settings.previews} onChange={event => setSettings(old => ({ ...old, previews: event.target.checked }))} /><span className="switch" /></label><label className="setting-toggle"><span>显示隐藏文件</span><input type="checkbox" checked={settings.hidden} onChange={event => setSettings(old => ({ ...old, hidden: event.target.checked }))} /><span className="switch" /></label><label className="setting-range"><span>字号 <output>{settings.fontSize}px</output></span><input aria-label="字号" type="range" min="12" max="19" step="1" value={settings.fontSize} onChange={event => { setAutoCenter(true); setSettings(old => ({ ...old, fontSize: Number(event.target.value) })); }} /></label><label className="setting-range"><span>目录间距 <output>{settings.gap}px</output></span><input aria-label="目录间距" type="range" min="70" max="170" step="5" value={settings.gap} onChange={event => { setAutoCenter(true); setSettings(old => ({ ...old, gap: Number(event.target.value) })); }} /></label><button className="demo-command" onClick={() => { resetDemo(); setSettingsOpen(false); }}><Database size={15} />载入示例目录</button></div>}</div>
      </div>
    </header>
    <div className="workspace">
      <main className={`canvas ${dragging ? 'is-dragging' : ''} ${view === 'list' ? 'list-canvas' : ''}`} ref={canvasRef} onPointerDown={view === 'graph' ? pointerDown : undefined} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="文件目录" tabIndex={-1}>
        <div className="workspace-label"><span className={`source-dot ${isDemo ? 'demo-dot' : ''}`} />{isDemo ? '示例目录' : '本地目录'}<span className="workspace-label-divider">/</span><span>{active.name}</span>{busy && <LoaderCircle size={12} className="spin" />}</div>
        {view === 'graph' ? <>
          <div className={`graph-scene ${dragging || wheelZooming ? 'instant' : ''}`} style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, fontSize: settings.fontSize }}>
            <svg className="connections" width={graph.bounds.width} height="1" aria-hidden="true">{graph.connections.map(connection => <path key={connection.id} d={connection.path} style={{ d: `path("${connection.path}")` } as CSSProperties} className={connection.preview ? 'preview-connection' : connection.active ? 'path-connection' : ''} />)}</svg>
            {graph.panels.map(panel => <div className={`directory-panel ${panel.id === activeId ? 'active-panel' : ''}`} key={panel.id} data-panel-id={panel.id} style={{ transform: `translate(${panel.x}px, ${panel.y}px)`, width: panel.width, height: panel.height }} aria-label={`${panel.entry.name} 目录`}>
              {panel.rows.length ? panel.rows.map(entry => <button key={entry.id} data-entry-id={entry.id} className={`entry-row ${entryColor(entry, pathIds.has(entry.id) || (panel.id === activeId && settings.previews && entry.kind === 'directory'), selectedId === entry.id)}`} style={{ height: graph.rowHeight }} title={entry.name} aria-label={entry.name} aria-current={selectedId === entry.id ? 'true' : undefined} onClick={event => entry.kind === 'directory' ? navigate(entry.id) : clickFile(entry, event.detail)} onDoubleClick={() => openEntry(entry)}><span className="selection-caret" /><span className="entry-name">{entry.name}</span>{entry.kind === 'directory' && <ChevronRight className="entry-chevron" size={12} />}</button>) : <span className="empty-directory" style={{ lineHeight: `${graph.rowHeight}px` }}>{panel.entry.children === undefined ? '读取中…' : '空文件夹'}</span>}
            </div>)}
            {graph.preview && <Preview key={graph.preview.id} node={graph.preview} tree={tree} selected={selectedId === graph.preview.id} onClose={closePreview} />}
          </div>
          <div className="minimap" aria-label="目录缩略图"><svg viewBox="0 0 160 94" aria-hidden="true"><g transform={`translate(${mapX} ${mapY}) scale(${mapScale})`}>{graph.connections.map(connection => <path key={connection.id} d={connection.path} className={connection.preview ? 'mini-preview-line' : connection.active ? 'mini-active-line' : ''} />)}{graph.panels.map(panel => <rect key={panel.id} x={panel.x} y={panel.y} width={panel.width * 0.72} height={panel.height} className={panel.id === activeId ? 'mini-active-panel' : ''} />)}{graph.preview && <rect className="mini-preview" x={graph.preview.x} y={graph.preview.y} width={graph.preview.width} height={graph.preview.height} />}<rect className="mini-viewport" x={-camera.x / camera.scale} y={-camera.y / camera.scale} width={viewport.width / camera.scale} height={viewport.height / camera.scale} /></g></svg><button aria-label="缩放到全部目录" onClick={fit} /></div>
          <div className="zoom-control"><IconButton label="缩小" onClick={() => zoom(0.85)}><Minus size={15} /></IconButton><button className="zoom-value" aria-label="重置为 100%" onClick={() => { setAutoCenter(false); setCamera(centeredCamera(1)); }}>{Math.round(camera.scale * 100)}%</button><IconButton label="放大" onClick={() => zoom(1.18)}><Plus size={15} /></IconButton><div className="zoom-divider" /><IconButton label="适应全部目录" onClick={fit}><Maximize size={14} /></IconButton></div>
        </> : <div className="file-list"><div className="list-heading"><h1>{active.name}</h1><span>{currentRows.length} 个项目</span></div><table><thead><tr><th><button onClick={() => setDescending(value => !value)}>名称<ArrowDownAZ size={14} className={descending ? 'descending' : ''} /></button></th><th>修改时间</th><th>类型</th><th>大小</th></tr></thead><tbody>{currentRows.map(entry => <tr key={entry.id} className={selectedId === entry.id ? 'selected-list-row' : ''} onClick={() => selectEntry(entry)} onDoubleClick={() => openEntry(entry)}><td><button onClick={() => openEntry(entry)}>{entry.kind === 'directory' ? <Folder size={16} /> : <File size={16} />}<span>{entry.name}</span>{entry.kind === 'directory' && <ChevronRight size={13} />}</button></td><td>{entry.modified ? new Date(entry.modified).toLocaleDateString('zh-CN') : '--'}</td><td>{fileType(entry)}</td><td>{entry.kind === 'directory' ? '--' : formatSize(entry.size)}</td></tr>)}</tbody></table>{!currentRows.length && <div className="list-empty"><FolderOpen size={30} strokeWidth={1} /><span>{busy ? '正在读取' : '空文件夹'}</span></div>}</div>}
      </main>
    </div>
    <footer className="statusbar"><div className="status-counts"><span>{counts.directories} 个目录</span><span>{counts.files} 个文件</span></div><span className="status-path" title={selectedPath}>{selectedPath}</span><div className="status-tools"><IconButton label={settings.hidden ? '隐藏点文件' : '显示隐藏文件'} onClick={() => setSettings(old => ({ ...old, hidden: !old.hidden }))}>{settings.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</IconButton>{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}<span>{busy ? '读取中' : '就绪'}</span></div></footer>
    <input ref={fileInput} type="file" multiple {...{ webkitdirectory: '', directory: '' }} className="folder-input" aria-label="选择本地文件夹" onChange={importFiles} />
    {toast && <div className="toast" role="alert"><span>{toast}</span><button aria-label="关闭通知" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}
