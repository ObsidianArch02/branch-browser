import type { FileTree } from './types';
import { entryAtPath, visibleChildren } from './data';

/**
 * Navigation state: which directory is active, which entry is selected, which
 * file is previewed, and the back/forward history of visited directories.
 */
export interface NavigationState {
  activeId: string;
  selectedId: string;
  previewId?: string;
  history: { items: string[]; index: number };
}

export type NavigationAction =
  | { type: 'navigate'; tree: FileTree; id: string; hidden: boolean; descending: boolean; addHistory?: boolean }
  | { type: 'select'; id: string; kind: 'directory' | 'file' }
  | { type: 'preview'; id: string }
  | { type: 'close-preview' }
  | { type: 'history'; delta: number; tree: FileTree; hidden: boolean; descending: boolean }
  | { type: 'install'; tree: FileTree; focusId: string; selectedId?: string; hidden: boolean; descending: boolean };

function firstChildId(tree: FileTree, id: string, hidden: boolean, descending: boolean): string {
  const entry = tree.entries.get(id);
  if (!entry) return id;
  return visibleChildren(tree.entries, entry, hidden, descending)[0]?.id ?? id;
}

/** Compute the state that navigating to directory `id` produces. */
function navigateState(state: NavigationState, tree: FileTree, id: string, hidden: boolean, descending: boolean, addHistory: boolean): NavigationState {
  const entry = tree.entries.get(id);
  if (!entry || entry.kind !== 'directory') return state;
  const history = addHistory
    ? (state.history.items[state.history.index] === id ? state.history : { items: [...state.history.items.slice(0, state.history.index + 1), id], index: state.history.index + 1 })
    : state.history;
  return {
    activeId: id,
    selectedId: firstChildId(tree, id, hidden, descending),
    previewId: undefined,
    history,
  };
}

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'navigate':
      return navigateState(state, action.tree, action.id, action.hidden, action.descending, action.addHistory !== false);
    case 'history': {
      const index = state.history.index + action.delta;
      if (index < 0 || index >= state.history.items.length) return state;
      const target = state.history.items[index];
      const navigated = navigateState(state, action.tree, target, action.hidden, action.descending, false);
      return { ...navigated, history: { ...navigated.history, index } };
    }
    case 'select':
      return { ...state, selectedId: action.id, previewId: state.previewId ? (action.kind === 'file' ? action.id : undefined) : state.previewId };
    case 'preview':
      return { ...state, selectedId: action.id, previewId: action.id };
    case 'close-preview':
      return { ...state, previewId: undefined };
    case 'install': {
      const { tree, focusId } = action;
      return {
        activeId: focusId,
        selectedId: action.selectedId ?? firstChildId(tree, focusId, action.hidden, action.descending),
        previewId: undefined,
        history: { items: [focusId], index: 0 },
      };
    }
    default:
      return state;
  }
}

/** Initial navigation state: the demo tree focused on DEMO_FOCUS. */
export function initialNavigation(tree: FileTree, focusPath: string, selectedPath: string): NavigationState {
  const focusId = entryAtPath(tree, focusPath)!.id;
  return {
    activeId: focusId,
    selectedId: entryAtPath(tree, selectedPath)!.id,
    previewId: undefined,
    history: { items: [focusId], index: 0 },
  };
}
