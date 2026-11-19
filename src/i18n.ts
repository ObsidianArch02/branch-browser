const en = {
  title: 'Branch - File Browser',
  back: 'Back',
  forward: 'Forward',
  currentPath: 'Current path',
  searchFiles: 'Search files',
  clearSearch: 'Clear search',
  searchResults: 'Search results',
  searching: 'Searching…',
  noResults: 'No matching files',
  view: 'View',
  graph: 'Directory graph',
  list: 'List',
  openFolder: 'Open folder',
  settings: 'Display settings',
  language: 'Language',
  previews: 'Preview subfolders',
  showHidden: 'Show hidden files',
  hideHidden: 'Hide hidden files',
  fontSize: 'Font size',
  directoryGap: 'Directory spacing',
  loadDemo: 'Load demo folder',
  fileBrowser: 'File browser',
  demoFolder: 'Demo folder',
  localFolder: 'Local folder',
  ready: 'Ready',
  loading: 'Loading…',
  closeNotification: 'Dismiss notification',
  chooseFolder: 'Choose a local folder',
  folderReadFailed: 'Could not read the folder.',
  fileReadFailed: 'Could not read the file.',
  folder: 'Folder',
  file: 'File',
  fileType: (extension: string) => `${extension} file`,
  emptyFolder: 'Empty folder',
  folderLabel: (name: string) => `${name} folder`,
  minimap: 'Directory minimap',
  fitGraph: 'Fit all directories',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  resetZoom: 'Reset zoom to 100%',
  items: (count: number) => `${count.toLocaleString('en')} ${count === 1 ? 'item' : 'items'}`,
  directories: (count: number) => `${count.toLocaleString('en')} ${count === 1 ? 'directory' : 'directories'}`,
  files: (count: number) => `${count.toLocaleString('en')} ${count === 1 ? 'file' : 'files'}`,
  name: 'Name',
  modified: 'Modified',
  type: 'Type',
  size: 'Size',
  filePreview: 'File preview',
  download: 'Download file',
  closePreview: 'Close preview',
  fileContents: (name: string) => `Contents of ${name}`,
  truncated: 'Showing the first 512 KB',
  unsupportedPreview: 'Preview unavailable for this file',
  emptyFile: 'Empty file',
  demoFileUnavailable: 'This demo file has no preview content',
};

const zh: typeof en = {
  title: 'Branch - 文件目录浏览器',
  back: '后退',
  forward: '前进',
  currentPath: '当前路径',
  searchFiles: '搜索文件',
  clearSearch: '清除搜索',
  searchResults: '搜索结果',
  searching: '正在搜索',
  noResults: '没有匹配的文件',
  view: '视图',
  graph: '目录图',
  list: '列表',
  openFolder: '打开文件夹',
  settings: '显示设置',
  language: '语言',
  previews: '子目录预览',
  showHidden: '显示隐藏文件',
  hideHidden: '隐藏点文件',
  fontSize: '字号',
  directoryGap: '目录间距',
  loadDemo: '载入示例目录',
  fileBrowser: '文件目录',
  demoFolder: '示例目录',
  localFolder: '本地目录',
  ready: '就绪',
  loading: '读取中…',
  closeNotification: '关闭通知',
  chooseFolder: '选择本地文件夹',
  folderReadFailed: '读取文件夹失败。',
  fileReadFailed: '读取文件失败。',
  folder: '文件夹',
  file: '文件',
  fileType: extension => `${extension} 文件`,
  emptyFolder: '空文件夹',
  folderLabel: name => `${name} 目录`,
  minimap: '目录缩略图',
  fitGraph: '适应全部目录',
  zoomOut: '缩小',
  zoomIn: '放大',
  resetZoom: '重置为 100%',
  items: count => `${count.toLocaleString('zh-CN')} 个项目`,
  directories: count => `${count.toLocaleString('zh-CN')} 个目录`,
  files: count => `${count.toLocaleString('zh-CN')} 个文件`,
  name: '名称',
  modified: '修改时间',
  type: '类型',
  size: '大小',
  filePreview: '文件预览',
  download: '下载文件',
  closePreview: '关闭预览',
  fileContents: name => `${name} 内容`,
  truncated: '显示前 512 KB',
  unsupportedPreview: '此文件暂不支持预览',
  emptyFile: '空文件',
  demoFileUnavailable: '示例文件未包含内容',
};

export const messages = { en, 'zh-CN': zh };
export type Locale = keyof typeof messages;

const localeKey = 'branch.locale';

export function readLocale(): Locale {
  try {
    return localStorage.getItem(localeKey) === 'zh-CN' ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(localeKey, locale);
  } catch {
    return;
  }
}

export function errorMessage(error: unknown, summary: string): string {
  return error instanceof Error && error.message ? `${summary} ${error.message}` : summary;
}
