"""Install the reviewed VSIX and change only the global LaTeX formatter.

Without --install this only creates a reviewable settings preview in this
directory. Existing JSONC comments, other settings, and formatOnSave survive.
"""
from dataclasses import dataclass, field
from pathlib import Path
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess


@dataclass
class Node:
    start: int
    end: int
    close: int = 0
    properties: dict = field(default_factory=dict)
    members: list = field(default_factory=list)
    trailing_comma: bool = False
    kind: str = 'value'


def parse_jsonc(text):
    pattern = re.compile(r'\s+|//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]')
    tokens = []
    position = 0
    while position < len(text):
        match = pattern.match(text, position)
        if not match:
            raise ValueError(f'Invalid JSONC at character {position}; settings were not changed')
        value = match[0]
        if not value.isspace() and not value.startswith(('//', '/*')):
            tokens.append((value, match.start(), match.end()))
        position = match.end()

    def parse(index):
        value, start, end = tokens[index]
        if value not in ('{', '['):
            if value in ('}', ']', ',', ':'):
                raise ValueError('Invalid JSONC value')
            return Node(start, end), index + 1
        node = Node(start, end, kind='object' if value == '{' else 'array')
        closing = '}' if value == '{' else ']'
        index += 1
        while tokens[index][0] != closing:
            if value == '{':
                key = json.loads(tokens[index][0])
                if not isinstance(key, str) or tokens[index + 1][0] != ':':
                    raise ValueError('Invalid JSONC property')
                index += 2
                child, index = parse(index)
                node.properties[key] = child
            else:
                child, index = parse(index)
            node.members.append(child)
            if tokens[index][0] == ',':
                index += 1
                node.trailing_comma = tokens[index][0] == closing
            elif tokens[index][0] != closing:
                raise ValueError('Missing JSONC comma')
        node.close = tokens[index][1]
        node.end = tokens[index][2]
        return node, index + 1

    root, end = parse(0)
    if end != len(tokens) or root.kind != 'object':
        raise ValueError('Settings must contain a JSONC object')
    return root


def patch_settings(text):
    root = parse_jsonc(text)
    edits = []

    def insert(node, properties):
        line_start = text.rfind('\n', 0, node.start) + 1
        indent = re.match(r'[ \t]*', text[line_start:])[0]
        child_indent = indent + '  '
        items = []
        for key, value in properties:
            formatted = json.dumps(value, indent=2, ensure_ascii=False).replace('\n', '\n' + child_indent)
            items.append(child_indent + json.dumps(key) + ': ' + formatted)
        edits.append((node.close, node.close, '\n' + ',\n'.join(items) + '\n' + indent))
        if node.members and not node.trailing_comma:
            last = node.members[-1]
            edits.append((last.end, last.end, ','))

    missing = []
    for language in ('[latex]', '[tex]'):
        node = root.properties.get(language)
        if node is None:
            missing.append((language, {'editor.defaultFormatter': 'local.latex-prose-wrap'}))
        elif node.kind != 'object':
            raise ValueError(f'{language} must be an object; settings were not changed')
        elif 'editor.defaultFormatter' in node.properties:
            value = node.properties['editor.defaultFormatter']
            edits.append((value.start, value.end, json.dumps('local.latex-prose-wrap')))
        else:
            insert(node, [('editor.defaultFormatter', 'local.latex-prose-wrap')])
    if missing:
        insert(root, missing)
    for start, end, replacement in sorted(edits, key=lambda edit: edit[0], reverse=True):
        text = text[:start] + replacement + text[end:]
    parse_jsonc(text)
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', help='Install into this SSH server and update its global settings')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    metadata = json.loads((root / 'package.json').read_text())
    vsix = root / f"{metadata['name']}-{metadata['version']}.vsix"
    settings = Path.home() / '.vscode-server/data/Machine/settings.json'
    original = settings.read_text() if settings.exists() else '{}\n'
    updated = patch_settings(original)
    preview = root / 'global-settings.preview.jsonc'
    preview.write_text(updated)
    print('VSIX:', vsix, flush=True)
    print('Settings:', settings, flush=True)
    print('Settings preview:', preview, flush=True)
    code = shutil.which('code')
    if not code:
        raise SystemExit('The VS Code command-line launcher was not found')
    server = Path(code).resolve().parent.parent / 'code-server'
    # Remote `code` can retain a dead GUI IPC socket. The server CLI installs
    # into the same extension folder without needing a connected window.
    installer = [str(server), '--user-data-dir', str(Path.home() / '.vscode-server/data'),
                 '--extensions-dir', str(Path.home() / '.vscode-server/extensions')] if server.is_file() else [code]
    print('Installer:', installer[0], flush=True)
    if not args.install:
        return
    if not vsix.is_file():
        raise SystemExit('Build the VSIX with python3 package_vsix.py first')
    subprocess.run(installer + ['--install-extension', str(vsix), '--force'], check=True)
    # Avoid overwriting settings changed while VS Code was installing the VSIX.
    current = settings.read_text() if settings.exists() else '{}\n'
    updated = patch_settings(current)
    settings.parent.mkdir(parents=True, exist_ok=True)
    if settings.exists() and updated != current:
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup = settings.with_name(settings.name + f'.latex-prose-wrap-{stamp}.bak')
        shutil.copy2(settings, backup)
        print('Backup:', backup, flush=True)
    temporary = settings.with_name(settings.name + '.latex-prose-wrap.tmp')
    temporary.write_text(updated)
    if settings.exists():
        os.chmod(temporary, settings.stat().st_mode)
    os.replace(temporary, settings)
    print('Installed. formatOnSave and keybindings were not changed.', flush=True)


if __name__ == '__main__':
    main()
