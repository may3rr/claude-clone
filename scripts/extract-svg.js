#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * extract-svg.js
 *
 * Reads ../claude-logo-draw.html and ../index-ai.html, extracts SVG paths
 * for the Claude wordmark and the Claude star icon, and outputs them to stdout
 * (or optionally writes component files).
 *
 * Usage:
 *   node scripts/extract-svg.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  path.join(ROOT, '..', 'claude-logo-draw.html'),
  path.join(ROOT, '..', 'index-ai.html'),
];

function extractSvgBlocks(html) {
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  return html.match(svgRegex) ?? [];
}

function extractPaths(svgBlock) {
  const pathRegex = /d="([^"]+)"/g;
  const paths = [];
  let match;
  while ((match = pathRegex.exec(svgBlock)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

for (const src of SOURCES) {
  if (!fs.existsSync(src)) {
    console.warn(`[extract-svg] File not found: ${src}`);
    continue;
  }

  const html = fs.readFileSync(src, 'utf8');
  const svgBlocks = extractSvgBlocks(html);

  console.log(`\n=== ${path.basename(src)} — found ${svgBlocks.length} SVG block(s) ===\n`);

  svgBlocks.forEach((block, i) => {
    const paths = extractPaths(block);
    console.log(`SVG block ${i + 1}:`);
    console.log(block.slice(0, 200) + (block.length > 200 ? '…' : ''));
    console.log(`  Paths (${paths.length}):`);
    paths.forEach((p, j) => console.log(`    [${j}] ${p.slice(0, 80)}${p.length > 80 ? '…' : ''}`));
    console.log();
  });
}
