import { ArrowDownAZ, ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { fileType, formatSize } from './data';
import { messages } from './i18n';
import type { Locale } from './i18n';
import type { Entry } from './types';

interface FileListProps {
  locale: Locale;
  directoryName: string;
  rows: Entry[];
  selectedId: string;
  descending: boolean;
  busy: boolean;
  onToggleSort: () => void;
  onSelect: (entry: Entry) => void;
  onOpen: (entry: Entry) => void;
}

export function FileList({ locale, directoryName, rows, selectedId, descending, busy, onToggleSort, onSelect, onOpen }: FileListProps) {
  const text = messages[locale];
  return <div className="file-list">
    <div className="list-heading"><h1>{directoryName}</h1><span>{text.items(rows.length)}</span></div>
    <table>
      <thead><tr><th><button onClick={onToggleSort}>{text.name}<ArrowDownAZ size={14} className={descending ? 'descending' : ''} /></button></th><th>{text.modified}</th><th>{text.type}</th><th>{text.size}</th></tr></thead>
      <tbody>{rows.map(entry => <tr key={entry.id} className={selectedId === entry.id ? 'selected-list-row' : ''} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)}>
        <td><button onClick={() => onOpen(entry)}>{entry.kind === 'directory' ? <Folder size={16} /> : <File size={16} />}<span>{entry.name}</span>{entry.kind === 'directory' && <ChevronRight size={13} />}</button></td>
        <td>{entry.modified !== undefined ? new Date(entry.modified).toLocaleDateString(locale) : '--'}</td>
        <td>{fileType(entry, locale)}</td>
        <td>{entry.kind === 'directory' ? '--' : formatSize(entry.size, locale)}</td>
      </tr>)}</tbody>
    </table>
    {!rows.length && <div className="list-empty"><FolderOpen size={30} strokeWidth={1} /><span>{busy ? text.loading : text.emptyFolder}</span></div>}
  </div>;
}
