import { allocateId } from './filesystem';
import type { Entries, Entry, FileTree } from './types';

type Seed = { name: string; children?: Seed[]; content?: string; asset?: string };
const file = (name: string, content = ''): Seed => ({ name, content });
const dir = (name: string, children: Seed[] = []): Seed => ({ name, children });

const source = `import SwiftUI

struct FileBrowserView: View {
    @State private var selection: URL?
    @State private var expandedDirectories: Set<URL> = []

    var body: some View {
        GeometryReader { geometry in
            DirectoryGraph(
                selection: $selection,
                expandedDirectories: $expandedDirectories,
                viewport: geometry.size
            )
            .background(Color.black)
        }
    }
}
`;

const seed = dir('Users', [
  file('.localized'),
  dir('drcode', [
    dir('Desktop', [file('ideas.md', '# Ideas\n\nA file browser with room to think.\n')]),
    dir('Downloads', [file('notes.txt', 'A small collection of notes.\n')]),
    dir('file-browser', [
      dir('.git', [file('COMMIT_EDITMSG', 'Implement directory graph navigation\n'), file('config', '[core]\n  repositoryformatversion = 0\n  bare = false\n'), file('FETCH_HEAD'), file('HEAD', 'ref: refs/heads/main\n'), dir('hooks'), file('index'), dir('logs'), dir('objects'), file('packed-refs'), dir('refs')]),
      file('.gitignore', '.DS_Store\n.build/\nnode_modules/\n'),
      dir('build', [file('ancestor-preview.png'), { name: 'browser-preview.png', asset: './assets/browser-preview.png' }, file('cross-level-spacing.png'), file('file-browser'), dir('file-browser-performance'), dir('file-browser-tests'), file('offscreen-connector-dots.png'), file('orthogonal-connectors.png'), dir('performance-validation'), dir('route-capture')]),
      file('Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n  <dict>\n    <key>CFBundleName</key>\n    <string>File Browser</string>\n  </dict>\n</plist>\n'),
      file('README.md', '# File Browser\n\nA spatial file browser.\n\nDirectories stay connected to their ancestors.\nMultiple child directories can be previewed at once.\n\n## Project\n\nSources/   Swift source files\nTests/     Navigation and layout tests\nscripts/   Build and run scripts\n'),
      dir('scripts', [file('build.sh', '#!/bin/sh\nset -eu\nswift build -c release\n'), file('install.sh', '#!/bin/sh\nset -eu\nmkdir -p ./Applications\n'), file('run.sh', '#!/bin/sh\nswift run FileBrowser\n'), file('test.sh', '#!/bin/sh\nswift test\n')]),
      dir('Sources', ['App.swift', 'ConnectorRounding.swift', 'FileBrowserModel.swift', 'FileBrowserView.swift', 'NameEditor.swift', 'OrthogonalRouter.swift', 'ScreenGeometry.swift'].map(name => file(name, source))),
      file('temp_0.md', '# Working notes\n\n- Keep the current directory in view\n- Round the connector corners\n- Make directory previews feel immediate\n'),
      dir('test-folders', [
        dir('02 Moria', [dir("Balin's Lost and Found", [file('inventory.txt', '1 mithril shirt\n3 misplaced keys\n')]), file('Do not disturb the drums.txt', 'Please keep the drums quiet after 10pm.\n'), file('Size Illusions.md', '# Size Illusions\n\nDistance changes how a place appears.\n'), file('Speak friend and enter.txt', 'mellon\n'), file('This mine passed inspection.pdf'), dir('West Gate', [file('opening-hours.txt', 'Open when the moon is visible.\n')])]),
        dir('03 Rohan', [dir('Edoras', [file('hall-booking.csv', 'date,room\n2026-09-29,Golden Hall\n')]), file('Horse 10.txt', 'Name: Brego\nStable: 10\n'), file('Horse 2.txt', 'Name: Shadowfax\nStable: 2\n'), dir('Horse Parking', [file('spaces.csv', 'space,available\n01,true\n02,false\n')]), file('Eomer attendance.csv', 'name,status\nEomer,present\n')]),
        dir('04 Gondor', [file('Beacons maintenance schedule.csv', 'beacon,date\nAmon Din,2026-10-02\nEilenach,2026-10-05\n'), dir('Minas Tirith', [dir('Level 1', [file('Pippin volunteer.txt', 'Shift begins at sunrise.\n'), file('Tomato etiquette.md', '# Tomato etiquette\n\nKeep the courtyard clean.\n')])]), file('Steward succession plan.md', '# Succession plan\n\nReview at the next council meeting.\n'), file('Where was Gondor?!.txt', 'The answer is still being discussed.\n')]),
        dir('05 Mordor', [file('.eye-is-watching.log', '[06:00] Observation started\n[06:01] All quiet\n'), dir('Mount Doom', [file('Gollum slipped again.txt', 'Incident report pending.\n'), file('Lava temperature.csv', 'time,celsius\n06:00,1200\n'), file('One Ring Returns.pdf'), file('Ring disposal instructions.md', '# Disposal\n\nProceed to the summit.\n')]), file('One does not simply file taxes.md', '# Taxes\n\nThe quarterly return is due.\n'), dir('Orc Human Resources', [file('Benefits (none).xlsx'), file('Complaints to Sauron.txt', 'No new complaints.\n'), file('Mandatory fun day.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n')]), file('Orc shift roster.csv', 'name,shift\nGorbag,night\nShagrat,day\n')]),
        dir('06 Fangorn', [dir('Entmoot Minutes', [file('decision-pending.txt', 'The discussion continues.\n'), file('minute 001.md', '# Minute 001\n\nFirst introductions.\n'), file('minute 002.md', '# Minute 002\n\nFurther introductions.\n'), file('minute 003.md', '# Minute 003\n\nThe agenda is agreed.\n')]), file('Quick decision making.txt', 'Estimated time: three days.\n'), file('Treebeard voice memo.m4a')]),
        dir('07 Isengard', [file('Industrial tree removal plan.md', '# Plan\n\nUnder review.\n'), file('Palantir screen saver.png'), dir("Saruman's Help Desk", [file('ticket-001.txt', 'The connection is unstable.\n')])]),
        dir('08 The Prancing Pony', [file('Room 10 key.txt', 'Room 10\n'), file('Room 2 key.txt', 'Room 2\n'), file('Strider definitely normal.txt', 'Guest checked in.\n')]),
        dir('09 Paths of the Dead', [file('Ghost guestbook.txt', 'Visitors: unknown\n'), file('Oath renewal form.pdf')]),
        dir('10 Eagles (Availability uncertain)', [file('Do not ask about the shortcut.txt', 'No shortcuts available.\n'), file('ETA unknown.txt', 'Arrival time: unknown\n')]),
        dir('99 The Grey Havens', [file('Last boat timetable.csv', 'departure,destination\nSunset,West\n'), file('Packing list - one wizard.txt', 'Staff\nHat\nPipe\n')]),
      ]),
      dir('Tests', ['AsyncConnectorTests.swift', 'AsyncFileBrowserModelTests.swift', 'HierarchyPreviewTests.swift', 'HorizontalCenteringTests.swift', 'OrthogonalRouterTests.swift', 'RecentExpansionTests.swift', 'ResponsivenessTests.swift', 'ScreenGeometryTests.swift', 'TreeNavigationTests.swift'].map(name => file(name, 'import XCTest\n\nfinal class NavigationTests: XCTestCase {\n    func testParentNavigation() {\n        XCTAssertTrue(true)\n    }\n}\n'))),
    ]),
    dir('lupa', [file('main.py', 'def main():\n    print("Hello, world")\n\nmain()\n')]),
    dir('mmacs'), dir('remus'), dir('romulus'),
    file('SECRETS.md', '# Demo file\n\nThis example contains no credentials.\n'),
    dir('uruk'), dir('uruk-game'),
  ]),
  dir('Shared', [file('welcome.txt', 'Welcome to the shared directory.\n')]),
]);

export function createDemo(): FileTree {
  const entries: Entries = new Map();
  function add(node: Seed, parentId?: string): string {
    const id = allocateId();
    const entry: Entry = { id, name: node.name, searchName: node.name.toLocaleLowerCase(), kind: node.children ? 'directory' : 'file', parentId, content: node.content, asset: node.asset, size: node.content ? new TextEncoder().encode(node.content).length : undefined, modified: Date.parse('2026-09-29T09:00:00Z') };
    entries.set(id, entry);
    if (node.children) entry.children = node.children.map(child => add(child, id));
    return id;
  }
  return { rootId: add(seed), entries, demo: true };
}

/** Path (by entry names, starting at the root) of the directory the demo opens on. */
export const DEMO_FOCUS = 'Users/drcode/file-browser/test-folders';

/** Resolve a slash-separated path of entry names to an entry, starting at the tree root. */
export function entryAtPath(tree: FileTree, path: string): Entry | undefined {
  const names = path.split('/');
  let entry = tree.entries.get(tree.rootId);
  if (!entry || entry.name !== names[0]) return undefined;
  for (const name of names.slice(1)) {
    entry = entry.children?.map(id => tree.entries.get(id)).find((child): child is Entry => child?.name === name);
    if (!entry) return undefined;
  }
  return entry;
}

export function ancestors(entries: Entries, id: string): Entry[] {
  const path: Entry[] = [];
  let current = entries.get(id);
  while (current) {
    path.unshift(current);
    current = current.parentId ? entries.get(current.parentId) : undefined;
  }
  return path;
}

export function visibleChildren(entries: Entries, entry: Entry, hidden: boolean, descending = false): Entry[] {
  const result = (entry.children ?? []).map(id => entries.get(id)!).filter(Boolean).filter(child => hidden || !child.name.startsWith('.'));
  return result.sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
}

export function formatSize(size?: number): string {
  if (size === undefined) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

export function fileType(entry: Entry): string {
  if (entry.kind === 'directory') return '\u6587\u4ef6\u5939';
  const extension = entry.name.split('.').pop()?.toUpperCase();
  return extension && extension !== entry.name.toUpperCase() ? `${extension} \u6587\u4ef6` : '\u6587\u4ef6';
}
