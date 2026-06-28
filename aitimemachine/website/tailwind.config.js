/** @type {import('tailwindcss').Config} */

/*
 * GitHub dark palette — mirrored from gitgram/web so AITimeMachine's marketing
 * site feels like the same product family.
 *
 * The site was originally built on Tailwind's default `gray`/`blue`/`green`/...
 * scales. Rather than hand-editing hundreds of class names, we remap those
 * scales onto GitHub's restrained dark palette here. Named tokens
 * (background/surface/border/foreground/primary/accent) are also exposed for
 * new, intentional usage.
 */

// GitHub dark neutral ramp. Indices are chosen so the darkest shades (used as
// page/section backgrounds in the original design) land on GitHub's dark
// surfaces and the lightest shades land on GitHub's text colors.
const githubGray = {
  50: '#f0f6fc',
  100: '#c9d1d9', // primary text
  200: '#b1bac4',
  300: '#8b949e', // secondary text
  400: '#6e7681', // muted text
  500: '#484f58', // disabled / faint text
  600: '#30363d', // borders / dividers
  700: '#30363d', // borders
  800: '#21262d', // hover surface / card border
  900: '#161b22', // surface / card background
  950: '#0d1117', // deep surface
};

// GitHub blue (links / accents).
const githubBlue = {
  100: '#cae8ff',
  200: '#a5d6ff',
  300: '#79c0ff',
  400: '#58a6ff', // primary link
  500: '#388bfd',
  600: '#1f6feb',
  700: '#1158c7',
  800: '#0d419d',
  900: '#0c2d6b',
  950: '#051d4d',
};

// GitHub green (primary CTA buttons / success).
const githubGreen = {
  100: '#aff5b4',
  200: '#7ee787',
  300: '#56d364',
  400: '#3fb950',
  500: '#2ea043', // hover
  600: '#238636', // primary
  700: '#196c2e',
  800: '#0f5323',
  900: '#033a16',
  950: '#04260f',
};

// GitHub red (danger / error).
const githubRed = {
  100: '#ffdcd7',
  200: '#ffc1ba',
  300: '#ffa198',
  400: '#ff7b72',
  500: '#f85149',
  600: '#da3633', // primary error
  700: '#b62324',
  800: '#8e1519',
  900: '#67060c',
  950: '#490202',
};

// GitHub yellow/amber (warning).
const githubYellow = {
  100: '#f8e3a1',
  200: '#f2cc60',
  300: '#e3b341',
  400: '#d29922', // warning
  500: '#bb8009',
  600: '#9e6a03',
  700: '#845306',
  800: '#693e00',
  900: '#4b2900',
  950: '#341a00',
};

module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Remap default scales used throughout the site onto GitHub's palette.
        gray: githubGray,
        slate: githubGray,
        zinc: githubGray,
        neutral: githubGray,
        blue: githubBlue,
        indigo: githubBlue,
        // Fold the accent hues onto GitHub blue/green so existing gradients and
        // accent chips stay on-palette instead of introducing off-brand colors.
        purple: githubBlue,
        violet: githubBlue,
        pink: githubBlue,
        green: githubGreen,
        emerald: githubGreen,
        teal: githubGreen,
        red: githubRed,
        rose: githubRed,
        orange: githubYellow,
        amber: githubYellow,
        yellow: githubYellow,

        // Named GitHub tokens (mirrors gitgram/web conventions).
        background: 'var(--background)',
        'background-light': 'var(--background-light)',
        'background-dark': 'var(--background-dark)',
        surface: 'var(--surface)',
        'surface-secondary': 'var(--surface-secondary)',
        'surface-dark': 'var(--surface-dark)',
        border: 'var(--border)',
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        success: 'var(--success)',
        'success-hover': 'var(--success-hover)',
        error: 'var(--error)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: [
          'Space Grotesk',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      borderRadius: {
        // GitHub uses subtle 6px rounding; soften the design's large radii.
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '1rem',
      },
    },
  },
  plugins: [],
};
