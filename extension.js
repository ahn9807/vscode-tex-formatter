'use strict';

const vscode = require('vscode');
const { formattingEdits } = require('./reflow');

function activate(context) {
    const provider = {
        provideDocumentRangeFormattingEdits(document, range, options, cancellation) {
            if (cancellation.isCancellationRequested) return [];
            const configuration = vscode.workspace.getConfiguration('latexProseWrap', document.uri);
            const lastLine = range.end.character === 0 && range.end.line > range.start.line
                ? range.end.line - 1 : range.end.line;
            return formattingEdits(document.getText(), {
                column: configuration.get('column', 80),
                tabSize: options.tabSize,
                range: { startLine: range.start.line, endLine: lastLine },
            }).map(edit => vscode.TextEdit.replace(
                new vscode.Range(edit.startLine, 0, edit.endLine, document.lineAt(edit.endLine).text.length),
                edit.newText,
            ));
        },
    };
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(
        [{ language: 'latex' }, { language: 'tex' }], provider,
    ));
}

module.exports = { activate };
