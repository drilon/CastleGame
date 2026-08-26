import { defineConfig } from 'vite';

// GitHub Pages serves a project repo (like this one) from /<repo-name>/,
// but a user/org page repo (<user>.github.io) from /. Override via the
// VITE_BASE_PATH env var (set as a repo variable in CI) rather than
// hardcoding either — see README's Deployment section.
const base = process.env.VITE_BASE_PATH ?? '/castlegame/';

export default defineConfig({
  base,
});
