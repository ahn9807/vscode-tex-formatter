'use strict';

// This formatter changes prose whitespace only. Unknown environments are left
// alone; opting out is preferable to modifying a table, program, or formula.
const PROSE_ENVIRONMENTS = new Set([
    'document', 'abstract', 'itemize', 'enumerate', 'description',
    'quote', 'quotation', 'center', 'flushleft', 'flushright',
]);
const TEXT_COMMANDS = new Set([
    'emph', 'textbf', 'textit', 'texttt', 'textnormal', 'textrm', 'textsf',
    'textsc', 'textsl', 'textup', 'underline', 'mbox',
]);
const LITERAL_ENVIRONMENTS = new Set([
    'verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted',
    'comment', 'filecontents', 'filecontents*',
]);
const STRUCTURAL_COMMAND = /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph|label|caption|captionof|item|bibitem|title|author|date|thanks|documentclass|usepackage|input|include|includegraphics|bibliography|bibliographystyle|newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|def|gdef|edef|xdef|let|newif|newcounter|setcounter|addtocounter|setlength|addtolength|newlength|newtheorem|newcolumntype|definecolor|colorlet|titlespacing|titleformat|settopmatter|setcopyright|pagestyle|thispagestyle|pagenumbering|maketitle|tableofcontents|centering|raggedright|raggedleft|smallskip|medskip|bigskip|vspace|hspace|noindent|clearpage|newpage|pagebreak|makeatletter|makeatother|else|fi|if\w*|me|jh|todo|pending|todoblock)(?![A-Za-z@])/;

function commentIndex(line) {
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') i++;
        else if (line[i] === '%') return i;
    }
    return -1;
}

function groupDepth(line, depth = 0) {
    const end = commentIndex(line);
    for (let i = 0; i < (end < 0 ? line.length : end); i++) {
        if (line[i] === '\\') i++;
        else if (line[i] === '{') depth++;
        else if (line[i] === '}') depth--;
    }
    return depth;
}

function readGroup(text, start, opening, closing) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === opening) depth++;
        else if (text[i] === closing && --depth === 0) return i + 1;
    }
    return -1;
}

// Keep inline math, grouped arguments, and attached text such as
// latency~\cite{key} together. Never insert a break inside an indivisible token.
function tokenize(text) {
    const tokens = [];
    let i = 0;
    let gap = '';
    while (i < text.length) {
        if (/[ \t\r\n]/.test(text[i])) {
            while (i < text.length && /[ \t\r\n]/.test(text[i])) i++;
            gap = ' ';
            continue;
        }
        const start = i;
        while (i < text.length && !/[ \t\r\n]/.test(text[i])) {
            if (text[i] === '{' || text[i] === '[') {
                const opening = text[i];
                i = readGroup(text, i, opening, opening === '{' ? '}' : ']');
                if (i < 0) return null;
            } else if (text[i] === '$' || text.startsWith('\\(', i)) {
                const closing = text[i] === '$' ? '$' : '\\)';
                const spanStart = i;
                i += closing.length;
                let found = false;
                while (i < text.length) {
                    if (text.startsWith(closing, i)) {
                        i += closing.length;
                        found = true;
                        break;
                    }
                    i += text[i] === '\\' ? 2 : 1;
                }
                if (!found || /[\r\n]/.test(text.slice(spanStart, i))) return null;
            } else if (text[i] === '\\') {
                i++;
                if (/[A-Za-z@]/.test(text[i] || '')) {
                    const commandStart = i;
                    while (i < text.length && /[A-Za-z@]/.test(text[i])) i++;
                    const command = text.slice(commandStart, i);
                    if (text[i] === '*') i++;
                    if (TEXT_COMMANDS.has(command) && text[i] === '{') i++;
                } else if (i < text.length) i++;
            } else i++;
        }
        const word = text.slice(start, i);
        // Multi-line arguments and incomplete edits are preserved verbatim.
        if (/[\r\n]/.test(word)) return null;
        tokens.push({ word, gap: tokens.length ? gap : '' });
        gap = '';
    }
    return tokens;
}

function displayWidth(text, tabSize = 4) {
    let width = 0;
    for (const char of text) {
        const code = char.codePointAt(0);
        if (char === '\t') width += tabSize - width % tabSize;
        else if (/\p{Mark}/u.test(char)) continue;
        else if (code >= 0x1100 && (
            code <= 0x115f || code === 0x2329 || code === 0x232a ||
            (code >= 0x2e80 && code <= 0xa4cf) ||
            (code >= 0xac00 && code <= 0xd7a3) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xfe10 && code <= 0xfe6f) ||
            (code >= 0xff01 && code <= 0xff60) ||
            (code >= 0xffe0 && code <= 0xffe6) || code >= 0x1f300
        )) width += 2;
        else width++;
    }
    return width;
}

function wrapBlock(lines, column, tabSize, eol) {
    const indent = lines[0].match(/^\s*/)[0];
    const tokens = tokenize(lines.map(line => line.slice(indent.length)).join('\n'));
    if (!tokens) return lines.join(eol);
    const output = [];
    let line = indent;
    for (const { word, gap } of tokens) {
        const separator = line === indent ? '' : gap;
        if (line !== indent && displayWidth(line + separator + word, tabSize) > column) {
            output.push(line);
            line = indent + word;
        } else line += separator + word;
    }
    if (line !== indent) output.push(line);
    return output.join(eol);
}

function formattingEdits(text, { column = 80, tabSize = 4, range } = {}) {
    if (!Number.isInteger(column) || column < 20 || column > 500) {
        throw new RangeError('column must be an integer between 20 and 500');
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const edits = [];
    const environments = [];
    let start = -1;
    let pendingDepth = 0;
    let displayMath = null;
    let inPreamble = /^\s*\\documentclass\b/m.test(text);
    let documentEnded = false;

    function flush(end) {
        if (start < 0) return;
        if (!range || (start <= range.endLine && end >= range.startLine)) {
            const block = lines.slice(start, end + 1);
            const newText = wrapBlock(block, column, tabSize, eol);
            if (newText !== block.join(eol)) {
                edits.push({ startLine: start, endLine: end, newText });
            }
        }
        start = -1;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const comment = commentIndex(line);
        const code = comment < 0 ? line : line.slice(0, comment);
        if (pendingDepth > 0) {
            flush(i - 1);
            pendingDepth = groupDepth(line, pendingDepth);
            continue;
        }
        const literal = environments.at(-1);
        if (LITERAL_ENVIRONMENTS.has(literal)) {
            flush(i - 1);
            if (line.trimStart().startsWith(`\\end{${literal}}`)) environments.pop();
            continue;
        }
        if (displayMath) {
            flush(i - 1);
            if (code.includes(displayMath)) displayMath = null;
            continue;
        }
        const events = [...code.matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)];
        const protectedEnvironment = environments.some(name => !PROSE_ENVIRONMENTS.has(name));
        if (events.length) {
            flush(i - 1);
            for (const [, kind, name] of events) {
                if (kind === 'begin') environments.push(name);
                else {
                    const found = environments.lastIndexOf(name);
                    if (found >= 0) environments.splice(found);
                }
                if (name === 'document') {
                    inPreamble = false;
                    if (kind === 'end') documentEnded = true;
                }
            }
            continue;
        }
        if (protectedEnvironment || inPreamble || documentEnded) { flush(i - 1); continue; }
        if (code.includes('\\[') || code.includes('$$')) {
            flush(i - 1);
            const marker = code.includes('\\[') ? '\\]' : '$$';
            const after = code.slice(code.indexOf(marker === '$$' ? '$$' : '\\[') + 2);
            if (!after.includes(marker)) displayMath = marker;
            continue;
        }
        const special = STRUCTURAL_COMMAND.test(line) ||
            /\\(?:verb\*?|lstinline\*?|mintinline)(?![A-Za-z@])/.test(code) ||
            /\\\\|\\(?:par|newline|linebreak)\b/.test(code) ||
            /^\s*\\[^\s{}]+(?:\{[^{}]*\})*\s*$/.test(code);
        if (!line.trim() || comment >= 0 || special) {
            flush(i - 1);
            if (special || comment >= 0) pendingDepth = Math.max(0, groupDepth(line));
            continue;
        }
        if (start >= 0 && line.match(/^\s*/)[0] !== lines[start].match(/^\s*/)[0]) flush(i - 1);
        if (start < 0) start = i;
    }
    flush(lines.length - 1);
    return edits;
}

function format(text, options) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    for (const edit of formattingEdits(text, options).reverse()) {
        lines.splice(edit.startLine, edit.endLine - edit.startLine + 1, ...edit.newText.split(eol));
    }
    return lines.join(eol);
}

module.exports = { format, formattingEdits, displayWidth };
