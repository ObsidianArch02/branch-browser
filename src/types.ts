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
  id: string;
  name: string;
  kind: 'directory' | 'file';
  parentId?: string;
  children?: string[];
  handle?: ReadonlyDirectoryHandle | ReadonlyFileHandle;
  file?: File;
  content?: string;
  asset?: string;
  size?: number;
  modified?: number;
}

export type Entries = Map<string, Entry>;
export interface FileTree { rootId: string; entries: Entries; }
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
