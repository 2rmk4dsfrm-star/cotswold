import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the build can be hosted at any path (product page embed, CDN folder, etc).
export default defineConfig({ base: './', plugins: [preact()] });
