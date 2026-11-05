// Đóng gói Lớp Học Chữ bằng esbuild:
//   - lõi game TypeScript -> core.cjs (CommonJS cho server; index.js tự đóng gói lại khi thiếu / cũ hơn mã nguồn)
//   - màn hình React (stage/main.tsx + GameStage.tsx) -> public/js/lophoc-stage.js + public/css/lophoc-stage.css,
//     Tailwind -> public/css/lophoc-tw.css. Màn hình đóng gói sẵn và đưa lên git (server không cần React / Tailwind).
//   node src/modes/lophoc/build.js          -> đóng gói lõi + màn hình
//   node src/modes/lophoc/build.js --check  -> như trên + chạy bộ kiểm tra gốc quiz.check.ts và bank.check.ts
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const OUT = path.join(DIR, 'core.cjs');
const SRC_DIRS = [path.join(DIR, 'game'), path.join(DIR, 'live')];
const ENTRY = path.join(DIR, 'core-entry.ts');
const ROOT = path.join(DIR, '..', '..', '..');
const PUBLIC = path.join(ROOT, 'public');

function newestSourceMs() {
  let newest = fs.statSync(ENTRY).mtimeMs;
  for (const d of SRC_DIRS) {
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.ts')) newest = Math.max(newest, fs.statSync(path.join(d, f)).mtimeMs);
    }
  }
  return newest;
}

function needsBuild() {
  try {
    return fs.statSync(OUT).mtimeMs < newestSourceMs();
  } catch (_) {
    return true;
  }
}

function build() {
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    logLevel: 'warning',
    banner: { js: '// FILE TỰ SINH từ src/modes/lophoc/core-entry.ts (node src/modes/lophoc/build.js). Đừng sửa tay.' }
  });
}

/** core.cjs thiếu hoặc cũ hơn mã nguồn thì đóng gói lại (máy chưa cài esbuild mà đã có core.cjs thì dùng tạm bản cũ) */
function ensureBuilt() {
  if (!needsBuild()) return;
  try {
    build();
  } catch (err) {
    if (!fs.existsSync(OUT)) throw err;
    console.warn('[lophoc] Không đóng gói lại được lõi game, dùng core.cjs cũ:', err.message);
  }
}

/** Màn hình lớp học: React + motion đóng gói 1 file JS (kèm CSS của stage.css), Tailwind chạy riêng bằng CLI */
function buildStage() {
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(DIR, 'stage', 'main.tsx')],
    outfile: path.join(PUBLIC, 'js', 'lophoc-stage.js'), // CSS import trong TSX ra public/js/lophoc-stage.css
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome100', 'safari15'],
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning'
  });
  // esbuild để CSS cạnh file JS: chuyển sang public/css cho cùng chỗ với các màn hình khác
  fs.renameSync(path.join(PUBLIC, 'js', 'lophoc-stage.css'), path.join(PUBLIC, 'css', 'lophoc-stage.css'));
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'tailwindcss'),
    ['-i', path.join(DIR, 'stage', 'index.css'), '-o', path.join(PUBLIC, 'css', 'lophoc-tw.css'), '--minify'],
    { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT }
  );
}

/** Chạy bộ kiểm tra gốc (viết cho tsx + ESM): đóng gói ra file .mjs tạm cạnh mã nguồn để import.meta.dirname đúng chỗ */
function runChecks() {
  const esbuild = require('esbuild');
  for (const name of ['quiz.check.ts', 'bank.check.ts']) {
    const out = path.join(DIR, 'game', `.${name}.tmp.mjs`);
    esbuild.buildSync({
      entryPoints: [path.join(DIR, 'game', name)],
      outfile: out,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'warning'
    });
    try {
      console.log(`\n▶ ${name}`);
      execFileSync(process.execPath, [out], { stdio: 'inherit', cwd: DIR });
    } finally {
      fs.rmSync(out, { force: true });
    }
  }
  // bộ câu hỏi theo lớp (game/cau-hoi-lop3, -lop4, -lop5)
  console.log('\n▶ check-banks.js');
  execFileSync(process.execPath, [path.join(DIR, 'check-banks.js')], { stdio: 'inherit', cwd: DIR });
}

module.exports = { ensureBuilt, build, buildStage };

if (require.main === module) {
  build();
  console.log(`Đã đóng gói ${path.relative(process.cwd(), OUT)}`);
  if (!process.argv.includes('--core')) {
    buildStage();
    console.log('Đã đóng gói màn hình: public/js/lophoc-stage.js, public/css/lophoc-stage.css, public/css/lophoc-tw.css');
  }
  if (process.argv.includes('--check')) runChecks();
}
