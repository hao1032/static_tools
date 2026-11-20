#!/usr/bin/env node
/*
 * pdf-a4 命令行版，与网页版共用 a4-core.js / pdf-lib.min.js
 *
 *   node cli.cjs 输入.pdf -o 输出.pdf [选项]
 *
 * 常用：
 *   # A3 横向三栏试卷 → 每栏一张 A4 竖版，保持原字号
 *   node cli.cjs 试卷.pdf -o 试卷_A4.pdf --mode columns --cuts 0,34,65,100
 *   # 整页等比缩到 A4 横向（版面完整，字缩小到 70%）
 *   node cli.cjs 试卷.pdf -o 试卷_A4横.pdf --mode fit --paper A4-landscape
 *   # A3 横向对开成 2 张 A4 竖版
 *   node cli.cjs 试卷.pdf -o 试卷_对开.pdf --mode columns --cuts 0,50,100
 *
 * 选项：
 *   --mode   auto | columns | grid | fit    默认 auto
 *   --cuts   分栏切线百分比，如 0,34,65,100（可不带 0/100，会自动补）
 *   --cols   网格列数（未提供 --cuts 时按等分）
 *   --rows   行数，默认 1
 *   --paper  A4 | A4-landscape | A5 | B5 | Letter | Letter-landscape
 *   --margin 页边距（pt，1mm ≈ 2.835pt），默认 0
 *   --overlap 相邻块重叠（pt），默认 0
 *   --scale  fit | fill | 1:1 | 数字，默认 fit
 *   --pages  源页范围，如 1-3,5，默认全部
 *   --info   只打印转换信息，不写文件
 */
'use strict';
const fs = require('fs');
const path = require('path');
const PDFLib = require('./pdf-lib.min.js');
const core = require('./a4-core.js');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.includes('--' + name); }

async function main() {
  const argv = process.argv.slice(2);
  let input = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') { i++; continue; }              // -o 的输出路径
    if (a.startsWith('--')) { if (a !== '--info') i++; continue; } // 有值选项
    if (!input) input = a;
  }
  if (!input) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*|^\s*\*/gm, ''));
    process.exit(0);
  }
  if (!fs.existsSync(input)) throw new Error('找不到文件：' + input);

  const bytes = fs.readFileSync(input);
  const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const first = src.getPage(0);
  const box = core.displayBox({ width: first.getWidth(), height: first.getHeight() }, first.getRotation().angle);
  const portrait = box.w <= box.h;

  let mode = arg('mode', 'auto');
  let paper = arg('paper', null);
  let cuts = arg('cuts', null);
  const cols = arg('cols', null);
  const rows = arg('rows', '1');
  const suggestion = core.suggest([box.w, box.h]);

  if (mode === 'auto') {
    mode = suggestion.mode;                       // 横向大页 → 分栏；否则整页缩放
    if (!cuts && mode === 'columns') cuts = '0,34,65,100';
  }
  if (!paper) paper = (mode === 'fit' && !portrait) ? 'A4-landscape' : 'A4';
  if (mode === 'columns' && !cuts && !cols) cuts = suggestion.cuts ? suggestion.cuts.join(',') : null;

  const opts = {
    mode, paper, cuts, cols: cols || undefined, rows,
    margin: arg('margin', '0'), overlap: arg('overlap', '0'),
    scale: arg('scale', 'fit'), pages: arg('pages', null)
  };
  const result = await core.convert(bytes, opts, PDFLib);
  const info = result.info;

  const mm = (pt) => (pt / core.MM).toFixed(0) + 'mm';
  console.log('输入  ：' + path.basename(input) + '  ' + (bytes.length / 1048576).toFixed(2) + ' MB');
  console.log('源页  ：' + info.sourceCount + ' 页，每页 ' + mm(box.w) + ' × ' + mm(box.h) +
    (box.rot ? '（含 /Rotate ' + box.rot + '°）' : ''));
  console.log('方案  ：' + mode + (info.cuts ? '，切线 ' + info.cuts.join('/') + '%' : '') +
    '，纸张 ' + info.paper + '（' + mm(info.paperSize[0]) + ' × ' + mm(info.paperSize[1]) + '）');
  console.log('输出  ：' + info.outputCount + ' 页，缩放 ' +
    info.outputPages.map(p => (p.scale * 100).toFixed(1) + '%').filter((v, i, a) => a.indexOf(v) === i).join(' / ') +
    '，' + (result.bytes.length / 1048576).toFixed(2) + ' MB');

  if (flag('info')) return;
  let output = null;
  const oi = process.argv.indexOf('-o');
  if (oi >= 0 && process.argv[oi + 1]) output = process.argv[oi + 1];
  if (!output) output = path.join(path.dirname(input), path.basename(input, '.pdf') + '_A4.pdf');
  fs.writeFileSync(output, Buffer.from(result.bytes));
  console.log('已写入：' + output);
}

main().catch(e => { console.error('失败：' + e.message); process.exit(1); });
