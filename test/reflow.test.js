'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { format, formattingEdits, displayWidth } = require('../reflow');

test('reflows prose, preserving heading, label, and paragraph boundaries', () => {
    const source = '\\subsection{Serverless Computing}\n\\label{sec:serverless}\n' +
        'The platform manages the execution environments, or instances.  It routes requests to available instances and starts more as demand grows.\n\n' +
        '\\paragraph{Efficient instance provisioning.}\nA request that needs a new instance waits for its runtime and application to initialize.\n';
    const result = format(source);
    assert.match(result, /^\\subsection\{Serverless Computing\}\n\\label\{sec:serverless\}\n/);
    assert.ok(result.includes('\n\n\\paragraph{Efficient instance provisioning.}\n'));
    assert.equal(result.replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
    assert.ok(result.split('\n').every(line => displayWidth(line) <= 80));
    assert.equal(format(result), result);
});

test('wraps inline text commands, including arguments split across lines', () => {
    const source = 'We call this \\emph{private\nmemory} because its contents belong to the guest and must remain protected from the host.\n';
    const result = format(source, { column: 45 });
    assert.equal(result.replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
    assert.ok(result.split('\n').every(line => line.length <= 45));
    assert.equal(format(result, { column: 45 }), result);
});

test('keeps math and attached citations intact, allowing oversized atoms', () => {
    const source = String.raw`An instance uses \(a + b = c\) in the formula and cites latency~\cite{one, two, three} before continuing with the explanation.`;
    const result = format(source, { column: 35 });
    assert.ok(result.includes(String.raw`\(a + b = c\)`));
    assert.ok(result.includes(String.raw`latency~\cite{one, two, three}`));
    assert.equal(result.replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
    assert.equal(format(result, { column: 35 }), result);
});

test('preserves comments, escaped percent signs, and percent-suppressed newlines', () => {
    const preserved = 'word% the newline is intentionally suppressed\nnextword\n% A long comment is left exactly as written instead of wrapped.\n';
    assert.equal(format(preserved, { column: 30 }), preserved);
    const source = String.raw`The application uses 20\% of its memory for private state and retains the rest for future requests.`;
    assert.equal(format(source, { column: 35 }).replace(/\s+/g, ' '), source);
});

test('preserves multiline review macros and blank lines inside their arguments', () => {
    const note = '\\jh{A very long review note that must not be reflowed.\n\nThe second paragraph includes nested {braces} and \\{escaped braces\\}.}\n';
    assert.equal(format(note, { column: 25 }), note);
});

test('preserves figures, tables, unknown environments, and display math', () => {
    const protectedBlocks = String.raw`\begin{figure}[h!]
  \caption{A long caption with many words that must remain untouched.}
  \begin{tabular}{ll}
    first & second \\
  \end{tabular}
\end{figure}
\begin{customcode}
an exceptionally long line of unknown content that must not be modified
\end{customcode}
\[
a + b + c + d + e + f = 10
\]
$$
another + long + equation = 0
$$
`;
    assert.equal(format(protectedBlocks, { column: 20 }), protectedBlocks);
    const trailing = 'Prose after the display equation should be wrapped to the configured column.\n';
    const result = format(protectedBlocks + trailing, { column: 35 });
    assert.ok(result.startsWith(protectedBlocks));
    assert.ok(result.slice(protectedBlocks.length).includes('\n'));
    assert.equal(format(result, { column: 35 }), result);
});

test('preserves preamble and formats prose inside the document environment', () => {
    const preamble = String.raw`\documentclass{acmart}
\newcommand{\longmacro}[1]{
  This is deliberately long macro content containing several spaces and #1.
}
\begin{document}
`;
    const result = format(preamble + 'Normal document prose should now wrap at the configured width.\n\\end{document}\n', { column: 30 });
    assert.ok(result.startsWith(preamble));
    assert.ok(result.includes('Normal document prose should\nnow wrap'));
});

test('keeps indentation inside lists and respects different paragraph indentation', () => {
    const source = '\\begin{itemize}\n  \\item\n    A CVM must prevent unauthorized access to its private state by other CVMs.\n  \\item\n    Another requirement uses the same indentation and must not merge with the first.\n\\end{itemize}\n';
    const result = format(source, { column: 40 });
    assert.ok(result.includes('  \\item\n    A CVM must prevent unauthorized\n'));
    assert.equal((result.match(/\\item/g) || []).length, 2);
    assert.equal(result.replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
    assert.equal(format(result, { column: 40 }), result);
});

test('leaves explicit breaks and inline verbatim alone', () => {
    const source = String.raw`First line with an explicit break \\
\verb|a b  c| and some other content that is deliberately not reflowed.
Next paragraph contains a \mintinline{python}|a  +  b| expression.
`;
    assert.equal(format(source, { column: 20 }), source);
});

test('formats only paragraphs touched by the selected range', () => {
    const first = 'This is the first long paragraph and it should stay exactly as it is.';
    const second = 'This is the second long paragraph and it should be formatted in its entirety.';
    const source = first + '\n\n' + second + '\n';
    const result = format(source, { column: 30, range: { startLine: 2, endLine: 2 } });
    assert.ok(result.startsWith(first + '\n\n'));
    assert.equal(formattingEdits(source, { column: 30, range: { startLine: 0, endLine: 0 } }).length, 1);
    assert.equal(result.replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
});

test('preserves CRLF, EOF newline, Unicode, and repeated formatting stability', () => {
    const source = 'This text contains 한글 and e\u0301 and should wrap consistently at the chosen display width.\r\n';
    const result = format(source, { column: 35 });
    assert.ok(result.endsWith('\r\n'));
    assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
    assert.ok(result.split('\r\n').every(line => displayWidth(line) <= 35));
    assert.equal(format(result, { column: 35 }), result);
    const noNewline = source.trimEnd();
    assert.ok(!format(noNewline, { column: 35 }).endsWith('\n'));
});

test('never loses or reorders prose over many widths', () => {
    const source = 'The host supplies physical pages and requests mappings. ' +
        'At launch, it can also supply the initial image and vCPU configuration. ' +
        'The monitor enforces page ownership by rejecting unauthorized mappings.';
    for (let column = 20; column <= 100; column++) {
        const result = format(source, { column });
        assert.equal(result.replace(/\s+/g, ' '), source);
        assert.ok(result.split('\n').every(line => line.length <= column));
        assert.equal(format(result, { column }), result);
    }
});

test('literal environment contents cannot end the outer document', () => {
    const literal = String.raw`\begin{document}
\begin{verbatim}
\end{document}
\end{fake}
\end{verbatim}
`;
    const prose = 'Prose after the literal block should still be formatted correctly.\n';
    const result = format(literal + prose + '\\end{document}\n', { column: 25 });
    assert.ok(result.startsWith(literal));
    assert.ok(result.includes('Prose after the literal\nblock should still be'));
});

test('VS Code adapter uses scoped width and respects selection end and cancellation', () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    let provider;
    const api = {
        workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'column' ? 30 : fallback }) },
        languages: { registerDocumentRangeFormattingEditProvider: (selector, value) => {
            assert.deepEqual(selector.map(item => item.language), ['latex', 'tex']);
            provider = value;
            return { dispose() {} };
        } },
        Range: class Range { constructor(...positions) { this.positions = positions; } },
        TextEdit: { replace: (range, newText) => ({ range, newText }) },
    };
    Module._load = function(request, ...args) {
        return request === 'vscode' ? api : originalLoad.call(this, request, ...args);
    };
    try { require('../extension').activate({ subscriptions: [] }); }
    finally { Module._load = originalLoad; }
    const text = 'This first paragraph should be wrapped by the selected formatter.\n\n' +
        'The other paragraph should not be touched by the same selection.\n';
    const document = { uri: {}, getText: () => text, lineAt: line => ({ text: text.split('\n')[line] }) };
    const range = { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } };
    const edits = provider.provideDocumentRangeFormattingEdits(document, range, { tabSize: 4 }, {});
    assert.equal(edits.length, 1);
    assert.deepEqual(edits[0].range.positions.slice(0, 3), [0, 0, 0]);
    assert.ok(edits[0].newText.split('\n').every(line => line.length <= 30));
    assert.deepEqual(provider.provideDocumentRangeFormattingEdits(document, range, {}, { isCancellationRequested: true }), []);
});
