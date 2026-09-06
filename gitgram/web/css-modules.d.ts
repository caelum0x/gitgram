// Ambient declarations for side-effect stylesheet imports.
//
// Next.js compiles CSS imports at build time, but a raw `tsc --noEmit` (the
// configured typecheck gate) has no knowledge of `.css` files and errors on
// `import './globals.css'` style side-effect imports (TS2882). Declaring the
// modules here keeps the typecheck gate green without affecting the build.
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
