import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { buildLayout, focusBounds } from './layout';
import type { Camera, FileTree, Point, Settings } from './types';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

interface GraphCameraOptions {
  tree: FileTree;
  activeId: string;
  selectedId: string;
  previewId: string | undefined;
  settings: Settings;
  descending: boolean;
  graphVisible: boolean;
  cancelSelection: () => void;
}

export function useGraphCamera({ tree, activeId, selectedId, previewId, settings, descending, graphVisible, cancelSelection }: GraphCameraOptions) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ width: 1200, height: 760 });
  const [autoCenter, setAutoCenter] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [wheelZooming, setWheelZooming] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  const viewportRef = useRef(viewport);
  const pointerPositions = useRef(new Map<number, Point>());
  const panOrigin = useRef<{ point: Point; camera: Camera; distance?: number } | undefined>(undefined);
  const wheelTimer = useRef<number | undefined>(undefined);
  const framedPreview = useRef<string | undefined>(undefined);

  const previewWidth = viewport.width < 700 ? Math.max(280, viewport.width - 68) : 560;
  const graph = useMemo(() => buildLayout(tree, activeId, settings, descending, previewId ? { id: previewId, width: previewWidth, height: 420 } : undefined), [tree, activeId, settings, descending, previewId, previewWidth]);
  const focus = useMemo(() => focusBounds(graph, selectedId), [graph, selectedId]);
  const centeredCamera = useCallback((scale: number): Camera => ({ scale, x: viewport.width / 2 - (focus.x + focus.width / 2) * scale, y: viewport.height / 2 - (focus.y + focus.height / 2) * scale }), [focus, viewport]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [graphVisible]);

  useLayoutEffect(() => { cameraRef.current = camera; }, [camera]);

  useLayoutEffect(() => {
    const resized = viewportRef.current.width !== viewport.width || viewportRef.current.height !== viewport.height;
    viewportRef.current = viewport;
    if (!graphVisible || dragging) return;
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
  }, [graph, viewport, selectedId, graphVisible, dragging, autoCenter, focus, centeredCamera]);

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

  function resetZoom() {
    setAutoCenter(false);
    setCamera(centeredCamera(1));
  }

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || !graphVisible) return;
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
  }, [zoom, graphVisible]);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, .preview-content, .preview-meta, .preview-path, .minimap, .zoom-control')) return;
    cancelSelection();
    event.currentTarget.focus({ preventScroll: true });
    const point = { x: event.clientX, y: event.clientY };
    pointerPositions.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const surface = event.currentTarget.querySelector('.graph-surface');
    let visibleCamera = cameraRef.current;
    if (surface) {
      const bounds = surface.getBoundingClientRect();
      const canvas = event.currentTarget.getBoundingClientRect();
      visibleCamera = { x: bounds.left - canvas.left, y: bounds.top - canvas.top, scale: Number(getComputedStyle(surface).zoom) };
    }
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

  return { graph, camera, viewport, canvasRef, dragging, wheelZooming, setAutoCenter, fit, zoom, resetZoom, pointerDown, pointerMove, pointerUp };
}
