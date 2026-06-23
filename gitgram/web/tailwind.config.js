/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core colors
        background: 'var(--background)',
        'background-light': 'var(--background-light)',
        'background-dark': 'var(--background-dark)',
        surface: 'var(--surface)',
        'surface-secondary': 'var(--surface-secondary)',
        'surface-dark': 'var(--surface-dark)',
        border: 'var(--border)',

        // Text colors
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        'text-primary-light': 'var(--text-primary-light)',
        'text-primary-dark': 'var(--text-primary-dark)',
        'text-secondary-light': 'var(--text-secondary-light)',
        'text-secondary-dark': 'var(--text-secondary-dark)',

        // Accent colors
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        info: 'var(--info)',

        // Semantic colors
        success: 'var(--success)',
        'success-hover': 'var(--success-hover)',
        error: 'var(--error)',
        warning: 'var(--warning)',

        // Interactive states
        hover: 'var(--hover)',
        active: 'var(--active)',
        disabled: 'var(--disabled)',

        // Button colors
        'button-primary': 'var(--button-primary)',
        'button-primary-hover': 'var(--button-primary-hover)',
        'button-secondary': 'var(--button-secondary)',
        'button-secondary-hover': 'var(--button-secondary-hover)',

        // Content backgrounds
        'content-light': 'var(--content-light)',
        'content-dark': 'var(--content-dark)',
      },
      fontFamily: {
        sans: ['Space Grotesk', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}

