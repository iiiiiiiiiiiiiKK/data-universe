#!/usr/bin/env node
/**
 * Deploy the production build to GitHub Pages.
 *
 * Publishes `dist/` to the `gh-pages` branch using a throwaway index, so the
 * working tree and history of `main` stay untouched.
 *
 * Usage:
 *   npm run deploy:pages                       # uses `git remote get-url origin`
 *   GH_PAGES_REMOTE=<url> npm run deploy:pages # explicit remote
 *
 * The token, if needed, must come from an environment variable or an existing
 * credential helper — never from a file in this repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist');

if (!existsSync(distDir)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// GitHub Pages runs Jekyll by default; disable it so dot-underscore files survive.
writeFileSync(path.join(distDir, '.nojekyll'), '');

let remote = process.env.GH_PAGES_REMOTE;
if (!remote) {
  try {
    remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    console.error('No git remote "origin". Set GH_PAGES_REMOTE=<url>.');
    process.exit(1);
  }
}

const work = mkdtempSync(path.join(tmpdir(), 'du-pages-'));
try {
  cpSync(distDir, work, { recursive: true });
  run('git', ['init', '-q'], work);
  run('git', ['checkout', '-q', '-b', 'gh-pages'], work);
  run('git', ['config', 'user.name', 'github-actions[bot]'], work);
  run('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], work);
  run('git', ['add', '-A'], work);
  run('git', ['commit', '-q', '-m', `deploy: ${new Date().toISOString()}`], work);
  run('git', ['push', '-q', '-f', remote, 'gh-pages:gh-pages'], work);
  console.log('\n✅ Deployed dist/ → gh-pages');
} finally {
  rmSync(work, { recursive: true, force: true });
}
