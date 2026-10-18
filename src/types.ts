export interface ReadonlyDirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<ReadonlyDirectoryHandle | ReadonlyFileHandle>;
}

export interface ReadonlyFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface Entry {
  /** Opaque identifier: unique, stable, and unrelated to the entry's path. */
  id: string;
  name: string;
  kind: 'directory' | 'file';
  parentId?: string;
  children?: string[];
  /** Lowercased name, cached for search filtering. */
  searchName?: string;
  handle?: ReadonlyDirectoryHandle | ReadonlyFileHandle;
  file?: File;
  content?: string;
  asset?: string;
  size?: number;
  modified?: number;
}

export type Entries = Map<string, Entry>;
export interface FileTree { rootId: string; entries: Entries; /** True for the bundled demo tree. */ demo?: boolean; }
export interface Point { x: number; y: number; }
export interface Camera extends Point { scale: number; }
export interface Settings {
  previews: boolean;
  hidden: boolean;
  fontSize: number;
  gap: number;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options: { mode: 'read' }) => Promise<ReadonlyDirectoryHandle>;
  }
}
