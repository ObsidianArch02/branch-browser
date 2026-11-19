import { useEffect, useState } from 'react';
import { Download, File, FileCode2, LoaderCircle, X } from 'lucide-react';
import { ancestors, fileType, formatSize } from './data';
import { readFile } from './filesystem';
import { errorMessage, messages } from './i18n';
import type { Locale } from './i18n';
import { IconButton } from './icon-button';
import type { PreviewNode } from './layout';
import type { FileTree } from './types';

export function FilePreview({ locale, node, tree, selected, onClose }: { locale: Locale; node: PreviewNode; tree: FileTree; selected: boolean; onClose: () => void }) {
  const { entry } = node;
  const text = messages[locale];
  const [state, setState] = useState<{ loading: boolean; file?: File; text?: string; url?: string; failure?: { error: unknown }; binary?: boolean; size?: number; modified?: number }>({ loading: true });
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
        if (!disposed) setState({ loading: false, failure: { error } });
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
  const modified = state.modified ?? entry.modified;
  return <section className="preview" aria-label={text.filePreview} aria-current={selected ? 'true' : undefined} data-preview-id={entry.id} style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.width, height: node.height }}>
    <header className="preview-toolbar"><FileCode2 size={17} strokeWidth={1.5} /><h2 title={entry.name}>{entry.name}</h2><div className="button-group"><IconButton label={text.download} disabled={!state.file} onClick={download}><Download size={16} /></IconButton><IconButton label={text.closePreview} onClick={onClose}><X size={17} /></IconButton></div></header>
    <div className="preview-meta"><span>{fileType(entry, locale)}</span><span>{formatSize(state.file?.size ?? state.size ?? entry.size, locale)}</span><time>{modified !== undefined ? new Date(modified).toLocaleString(locale, { hour12: false }) : '--'}</time></div>
    <div className="preview-content" tabIndex={0} aria-label={text.fileContents(entry.name)}>
      {state.loading ? <div className="preview-empty"><LoaderCircle className="spin" size={24} /><span>{text.loading}</span></div>
        : state.failure ? <div className="preview-empty error-text">{errorMessage(state.failure.error, text.fileReadFailed)}</div>
          : state.url && image ? <img className="image-preview" src={state.url} alt={entry.name} />
            : state.url && video ? <video className="media-preview" src={state.url} controls />
              : state.url && audio ? <audio className="audio-preview" src={state.url} controls />
                : state.url && /\.pdf$/i.test(entry.name) ? <iframe className="pdf-preview" title={entry.name} src={state.url} />
                  : state.text !== undefined ? <><div className="code-preview">{state.text.split('\n').map((line, index) => <div className="code-line" key={index}><span>{index + 1}</span><code>{line || ' '}</code></div>)}</div>{state.file && state.file.size > 512 * 1024 && <div className="truncated-notice">{text.truncated}</div>}</>
                    : <div className="preview-empty"><File size={32} strokeWidth={1} /><span>{state.binary ? text.unsupportedPreview : entry.content === '' ? text.emptyFile : text.demoFileUnavailable}</span></div>}
    </div>
    <div className="preview-path">{ancestors(tree.entries, entry.id).map(item => item.name).join('/')}</div>
  </section>;
}
