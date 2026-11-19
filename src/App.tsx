import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Database, Eye, EyeOff, File, Folder, FolderOpen, GitBranch, List, LoaderCircle, Network, Search, Settings2, X } from 'lucide-react';
import { ancestors, createDemo, DEMO_FOCUS, visibleChildren } from './data';
import { useDirectoryLoading, useDirectorySearch } from './directory-loading';
import { FileList } from './file-list';
import { createDirectorySource, sourceFromHandle, treeFromFiles } from './filesystem';
import type { DirectorySource } from './filesystem';
import { GraphView } from './graph-view';
import { errorMessage, messages, readLocale, saveLocale } from './i18n';
import { IconButton } from './icon-button';
import { initialNavigation, navigationReducer } from './navigation';
import { useGraphCamera } from './use-graph-camera';
import type { Entry, Settings } from './types';

const initialSettings: Settings = { previews: true, hidden: true, fontSize: 15, gap: 110 };
const demoSelection = `${DEMO_FOCUS}/02 Moria`;

export default function App() {
  const [source, setSource] = useState(() => createDirectorySource(createDemo()));
  const tree = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [nav, dispatch] = useReducer(navigationReducer, tree, t => initialNavigation(t, DEMO_FOCUS, demoSelection));
  const { activeId, selectedId, previewId, history: navigation } = nav;
  const [locale, setLocale] = useState(readLocale);
  const text = messages[locale];
  const [settings, setSettings] = useState(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [descending, setDescending] = useState(false);

  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [toast, setToast] = useState<{ error: unknown }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const importVersion = useRef(0);
  const selectionTimer = useRef<number | undefined>(undefined);

  const cancelSelection = useCallback(() => { window.clearTimeout(selectionTimer.current); selectionTimer.current = undefined; }, []);
  useEffect(() => cancelSelection, [source, activeId, view, settingsOpen, cancelSelection]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = text.title;
    saveLocale(locale);
  }, [locale, text.title]);

  const { graph, camera, viewport, canvasRef, dragging, wheelZooming, setAutoCenter, fit, zoom, resetZoom, pointerDown, pointerMove, pointerUp } = useGraphCamera({ tree, activeId, selectedId, previewId, settings, descending, graphVisible: view === 'graph', cancelSelection });
  const reportError = useCallback((error: unknown) => setToast({ error }), []);
  const loading = useDirectoryLoading(source, activeId, settings.previews, settings.hidden, reportError);
  const { results: searchResults, searching } = useDirectorySearch(source, tree, query, settings.hidden, reportError);
  const busy = importing || loading;

  const active = tree.entries.get(activeId)!;
  const selected = tree.entries.get(selectedId);
  const path = useMemo(() => ancestors(tree.entries, activeId), [tree, activeId]);
  const pathIds = useMemo(() => new Set(path.map(entry => entry.id)), [path]);
  const currentRows = useMemo(() => visibleChildren(tree.entries, active, settings.hidden, descending), [tree, active, settings.hidden, descending]);
  const isDemo = tree.demo === true;
  const counts = useMemo(() => {
    let directories = 0, files = 0;
    for (const entry of tree.entries.values()) if (entry.kind === 'directory') directories++; else files++;
    return { directories, files };
  }, [tree]);
  const navigate = useCallback((id: string) => {
    const entry = tree.entries.get(id);
    if (!entry || entry.kind !== 'directory') return;
    cancelSelection();
    dispatch({ type: 'navigate', tree, id, hidden: settings.hidden, descending });
    setAutoCenter(true);
    setSearchOpen(false);
    setQuery('');
  }, [tree, settings.hidden, descending, cancelSelection, setAutoCenter]);

  useEffect(() => {
    if (settings.hidden) return;
    const hiddenAncestor = path.findIndex(entry => entry.parentId && entry.name.startsWith('.'));
    if (hiddenAncestor > 0) navigate(path[hiddenAncestor - 1].id);
    else if (selected?.name.startsWith('.') && selected.parentId === activeId) { const id = currentRows[0]?.id ?? activeId; dispatch({ type: 'select', id, kind: tree.entries.get(id)?.kind ?? 'directory' }); }
    if (previewId && ancestors(tree.entries, previewId).some(entry => entry.parentId && entry.name.startsWith('.'))) dispatch({ type: 'close-preview' });
  }, [settings.hidden]);

  function goHistory(delta: number) {
    const index = navigation.index + delta;
    if (index < 0 || index >= navigation.items.length) return;
    cancelSelection();
    dispatch({ type: 'history', delta, tree, hidden: settings.hidden, descending });
    setAutoCenter(true);
    setSearchOpen(false);
    setQuery('');
  }

  const selectEntry = useCallback((entry: Entry) => {
    cancelSelection();
    dispatch({ type: 'select', id: entry.id, kind: entry.kind });
    setAutoCenter(false);
  }, [cancelSelection, setAutoCenter]);

  function clickFile(entry: Entry, clickCount: number) {
    cancelSelection();
    // Keep the target stationary until the browser has a chance to register a double click.
    if (clickCount === 1) selectionTimer.current = window.setTimeout(() => selectEntry(entry), 350);
    else if (clickCount === 0) selectEntry(entry);
  }

  const showPreview = useCallback((entry: Entry) => {
    cancelSelection();
    dispatch({ type: 'preview', id: entry.id });
    setView('graph');
    setAutoCenter(false);
    canvasRef.current?.focus({ preventScroll: true });
  }, [cancelSelection, setAutoCenter, canvasRef]);

  const closePreview = useCallback(() => {
    cancelSelection();
    dispatch({ type: 'close-preview' });
    setAutoCenter(false);
    canvasRef.current?.focus({ preventScroll: true });
  }, [cancelSelection, setAutoCenter, canvasRef]);

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
    const timer = setTimeout(() => setToast(undefined), 6000);
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
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1 : Math.max(0, Math.min(siblings.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
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
  }, [tree, activeId, selected, selectedId, settings.hidden, descending, currentRows, previewId, settingsOpen, view, fit, zoom, navigate, pathIds, selectEntry, showPreview, closePreview]);

  function installSource(nextSource: DirectorySource, focusId = nextSource.getSnapshot().rootId, selectedId?: string) {
    setSource(nextSource);
    dispatch({ type: 'install', tree: nextSource.getSnapshot(), focusId, selectedId, hidden: settings.hidden, descending });
    setQuery('');
    setAutoCenter(true);
  }

  async function openFolder() {
    const version = ++importVersion.current;
    if (!window.showDirectoryPicker) { fileInput.current?.click(); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      if (version !== importVersion.current) return;
      setImporting(true);
      const nextSource = await sourceFromHandle(handle);
      if (version === importVersion.current) installSource(nextSource);
    } catch (error) {
      if (version !== importVersion.current || (error instanceof Error && error.name === 'AbortError')) return;
      if (error instanceof Error && ['SecurityError', 'NotAllowedError'].includes(error.name)) fileInput.current?.click();
      else reportError(error);
    } finally { if (version === importVersion.current) setImporting(false); }
  }

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length) {
      importVersion.current++;
      setImporting(false);
      installSource(createDirectorySource(treeFromFiles(files, text.localFolder)));
    }
    event.target.value = '';
  }

  function resetDemo() {
    importVersion.current++;
    setImporting(false);
    const demo = createDemo();
    const { activeId, selectedId } = initialNavigation(demo, DEMO_FOCUS, demoSelection);
    installSource(createDirectorySource(demo), activeId, selectedId);
  }

  const selectedPath = selected ? ancestors(tree.entries, selected.id).map(entry => entry.name).join(' / ') : active.name;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><GitBranch size={19} strokeWidth={1.6} /><span>branch<span className="brand-dot">.</span></span></div>
      <div className="history-controls"><IconButton label={text.back} disabled={navigation.index === 0} onClick={() => goHistory(-1)}><ArrowLeft size={16} /></IconButton><IconButton label={text.forward} disabled={navigation.index === navigation.items.length - 1} onClick={() => goHistory(1)}><ArrowRight size={16} /></IconButton></div>
      <nav className="breadcrumbs" aria-label={text.currentPath}>{path.map((entry, index) => <span key={entry.id}>{index > 0 && <ChevronRight size={12} />}<button onClick={() => navigate(entry.id)} className={entry.id === activeId ? 'current-crumb' : ''}>{entry.name}</button></span>)}</nav>
      <div className="search-wrap">
        <Search size={15} />
        <input ref={searchInput} aria-label={text.searchFiles} placeholder={text.searchFiles} value={query} onFocus={() => setSearchOpen(true)} onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setSearchOpen(false); }} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => Math.max(0, Math.min(searchResults.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
          else if (event.key === 'Enter' && searchResults[searchIndex]) selectSearchResult(searchResults[searchIndex]);
        }} />
        {query && <button aria-label={text.clearSearch} onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={13} /></button>}
        {searchOpen && query.trim() && <div className="search-results" role="listbox" aria-label={text.searchResults}><div className="search-results-heading">{text.searchResults} <span>{searching ? <LoaderCircle size={12} className="spin" /> : <>{searchResults.length}{searchResults.length === 100 ? '+' : ''}</>}</span></div>{searchResults.length ? searchResults.map((entry, index) => <button role="option" aria-selected={index === searchIndex} key={entry.id} onMouseDown={event => event.preventDefault()} onClick={() => selectSearchResult(entry)} className={index === searchIndex ? 'search-highlight' : ''}>{entry.kind === 'directory' ? <Folder size={16} /> : <File size={16} />}<span><strong>{entry.name}</strong><small>{ancestors(tree.entries, entry.parentId ?? entry.id).map(item => item.name).join(' / ')}</small></span><ChevronRight size={13} /></button>) : <div className="no-results">{searching ? text.searching : text.noResults}</div>}</div>}
      </div>
      <div className="topbar-tools">
        <div className="view-toggle" role="group" aria-label={text.view}><IconButton label={text.graph} active={view === 'graph'} onClick={() => setView('graph')}><Network size={16} /></IconButton><IconButton label={text.list} active={view === 'list'} onClick={() => setView('list')}><List size={17} /></IconButton></div>
        <button className="open-folder" aria-label={text.openFolder} title={text.openFolder} onClick={() => void openFolder()}><FolderOpen size={16} /><span>{text.openFolder}</span></button>
        <div className="settings-anchor" ref={settingsRef}>
          <IconButton label={text.settings} active={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><Settings2 size={17} /></IconButton>
          {settingsOpen && <div className="settings-popover">
            <div className="popover-heading">{text.settings}</div>
            <div className="settings-view-switch"><span>{text.view}</span><div className="view-toggle" role="group" aria-label={text.view}><IconButton label={text.graph} active={view === 'graph'} onClick={() => { setView('graph'); setSettingsOpen(false); }}><Network size={16} /></IconButton><IconButton label={text.list} active={view === 'list'} onClick={() => { setView('list'); setSettingsOpen(false); }}><List size={17} /></IconButton></div></div>
            <label className="setting-language"><span>{text.language}</span><select value={locale} onChange={event => setLocale(event.target.value === 'zh-CN' ? 'zh-CN' : 'en')}><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">简体中文</option></select></label>
            <label className="setting-toggle"><span>{text.previews}</span><input type="checkbox" checked={settings.previews} onChange={event => setSettings(old => ({ ...old, previews: event.target.checked }))} /><span className="switch" /></label>
            <label className="setting-toggle"><span>{text.showHidden}</span><input type="checkbox" checked={settings.hidden} onChange={event => setSettings(old => ({ ...old, hidden: event.target.checked }))} /><span className="switch" /></label>
            <label className="setting-range"><span>{text.fontSize} <output>{settings.fontSize}px</output></span><input aria-label={text.fontSize} type="range" min="12" max="19" step="1" value={settings.fontSize} onChange={event => { setAutoCenter(true); setSettings(old => ({ ...old, fontSize: Number(event.target.value) })); }} /></label>
            <label className="setting-range"><span>{text.directoryGap} <output>{settings.gap}px</output></span><input aria-label={text.directoryGap} type="range" min="70" max="170" step="5" value={settings.gap} onChange={event => { setAutoCenter(true); setSettings(old => ({ ...old, gap: Number(event.target.value) })); }} /></label>
            <button className="demo-command" onClick={() => { resetDemo(); setSettingsOpen(false); }}><Database size={15} />{text.loadDemo}</button>
          </div>}
        </div>
      </div>
    </header>
    <div className="workspace">
      <main className={`canvas ${dragging ? 'is-dragging' : ''} ${view === 'list' ? 'list-canvas' : ''}`} ref={canvasRef} onPointerDown={view === 'graph' ? pointerDown : undefined} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label={text.fileBrowser} tabIndex={-1}>
        <div className="workspace-label"><span className={`source-dot ${isDemo ? 'demo-dot' : ''}`} />{isDemo ? text.demoFolder : text.localFolder}<span className="workspace-label-divider">/</span><span>{active.name}</span>{busy && <LoaderCircle size={12} className="spin" />}</div>
        {view === 'graph' ? <GraphView locale={locale} graph={graph} tree={tree} camera={camera} viewport={viewport} activeId={activeId} selectedId={selectedId} pathIds={pathIds} previews={settings.previews} fontSize={settings.fontSize} instant={dragging || wheelZooming} onNavigate={navigate} onClickFile={clickFile} onOpen={openEntry} onClosePreview={closePreview} onFit={fit} onZoom={zoom} onResetZoom={resetZoom} />
          : <FileList locale={locale} directoryName={active.name} rows={currentRows} selectedId={selectedId} descending={descending} busy={busy} onToggleSort={() => setDescending(value => !value)} onSelect={selectEntry} onOpen={openEntry} />}
      </main>
    </div>
    <footer className="statusbar"><div className="status-counts"><span>{text.directories(counts.directories)}</span><span>{text.files(counts.files)}</span></div><span className="status-path" title={selectedPath}>{selectedPath}</span><div className="status-tools"><IconButton label={settings.hidden ? text.hideHidden : text.showHidden} onClick={() => setSettings(old => ({ ...old, hidden: !old.hidden }))}>{settings.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</IconButton>{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}<span>{busy ? text.loading : text.ready}</span></div></footer>
    <input ref={fileInput} type="file" multiple {...{ webkitdirectory: '', directory: '' }} className="folder-input" aria-label={text.chooseFolder} onChange={importFiles} />
    {toast && <div className="toast" role="alert"><span>{errorMessage(toast.error, text.folderReadFailed)}</span><button aria-label={text.closeNotification} onClick={() => setToast(undefined)}><X size={14} /></button></div>}
  </div>;
}
