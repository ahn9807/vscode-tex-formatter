#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { format } = require('./reflow');

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--column')) {
    process.stderr.write('Usage: node cli.js [--column 80] < input.tex > output.tex\n');
    process.exit(2);
}
const input = fs.readFileSync(0, 'utf8');
try {
    process.stdout.write(format(input, { column: args.length ? Number(args[1]) : 80 }));
} catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 2;
}
