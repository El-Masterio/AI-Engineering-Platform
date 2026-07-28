/**
 * PostCSS at the workspace root — this exists for Storybook.
 *
 * apps/web has its own config that Next.js picks up. Storybook runs from the
 * repo root through Vite, and Vite looks for a PostCSS config upward from ITS
 * root, never down into apps/. Without this file Vite found no config, ran no
 * plugins, and simply inlined Tailwind's source stylesheets: the output had the
 * `@theme` variables and preflight but not one generated utility, so every
 * story rendered with correct colours and no layout.
 *
 * That shipped in M008 and went unnoticed until knip asked why the root
 * declared `@tailwindcss/postcss` without using it. The gate was right.
 */
export default { plugins: { "@tailwindcss/postcss": {} } };
