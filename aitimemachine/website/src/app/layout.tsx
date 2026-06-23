import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';

// Many routes depend on Clerk (UserButton, SignedOut, useUser) and cannot be safely
// prerendered without runtime auth configuration. Force dynamic rendering to keep
// `next build` resilient in environments with placeholder keys.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Gitgram TimeMachine - Time Travel for AI-Assisted Development',
    template: '%s | Gitgram TimeMachine',
  },
  description: 'Capture and restore your complete workspace state. Undo AI mistakes, checkpoint before risky changes, and time-travel through your development history. Works with Claude Code, Cursor, and Windsurf.',
  keywords: ['AI development tools', 'code backup', 'checkpoint', 'restore', 'Claude Code', 'Cursor', 'MCP', 'time machine', 'undo AI changes'],
  authors: [{ name: 'Gitgram TimeMachine' }],
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://timemachine.gitgram.app',
    siteName: 'Gitgram TimeMachine',
    title: 'Gitgram TimeMachine - Time Travel for AI-Assisted Development',
    description: 'Capture and restore your complete workspace state. Undo AI mistakes, checkpoint before risky changes, and time-travel through your development history.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gitgram TimeMachine - Time Travel for AI-Assisted Development',
    description: 'Undo AI mistakes, checkpoint before risky changes, and time-travel through your development history. Works with Claude, Cursor, and Windsurf.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
