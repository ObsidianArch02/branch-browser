import { ArrowDownAZ, ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { fileType, formatSize } from './data';
import type { Entry } from './types';

interface FileListProps {
  directoryName: string;
  rows: Entry[];
  selectedId: string;
  descending: boolean;
  busy: boolean;
  onToggleSort: () => void;
  onSelect: (entry: Entry) => void;
  onOpen: (entry: Entry) => void;
}

export function FileList({ directoryName, rows, selectedId, descending, busy, onToggleSort, onSelect, onOpen }: FileListProps) {
  return <div className="file-list">
    <div className="list-heading"><h1>{directoryName}</h1><span>{rows.length} 个项目</span></div>
    <table>
      <thead><tr><th><button onClick={onToggleSort}>名称<ArrowDownAZ size={14} className={descending ? 'descending' : ''} /></button></th><th>修改时间</th><th>类型</th><th>大小</th></tr></thead>
      <tbody>{rows.map(entry => <tr key={entry.id} className={selectedId === entry.id ? 'selected-list-row' : ''} onClick={() => onSelect(entry)} onDoubleClick={() => onOpen(entry)}>
        <td><button onClick={() => onOpen(entry)}>{entry.kind === 'directory' ? <Folder size={16} /> : <File size={16} />}<span>{entry.name}</span>{entry.kind === 'directory' && <ChevronRight size={13} />}</button></td>
        <td>{entry.modified ? new Date(entry.modified).toLocaleDateString('zh-CN') : '--'}</td>
        <td>{fileType(entry)}</td>
        <td>{entry.kind === 'directory' ? '--' : formatSize(entry.size)}</td>
      </tr>)}</tbody>
    </table>
    {!rows.length && <div className="list-empty"><FolderOpen size={30} strokeWidth={1} /><span>{busy ? '正在读取' : '空文件夹'}</span></div>}
  </div>;
}
