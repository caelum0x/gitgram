import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Clock, Shield, Zap } from 'lucide-react';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900/50 to-purple-900/50 p-12 flex-col justify-between">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white">
              A
            </div>
            <span className="text-2xl font-bold text-white">Gitgram TimeMachine</span>
          </Link>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Time travel for your
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              development workflow
            </span>
          </h1>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Point-in-Time Recovery</h3>
                <p className="text-gray-400 text-sm">
                  Restore your entire project to any previous state instantly.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">AI Context Preservation</h3>
                <p className="text-gray-400 text-sm">
                  Save and restore AI conversation history with your project state.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">MCP Integration</h3>
                <p className="text-gray-400 text-sm">
                  Works with Claude Code, Cursor, and any MCP-compatible tool.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-sm">
          Trusted by thousands of developers worldwide
        </p>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white">
                A
              </div>
              <span className="text-2xl font-bold text-white">Gitgram TimeMachine</span>
            </Link>
          </div>
          <SignIn
            appearance={{
              elements: {
                rootBox: 'mx-auto',
                card: 'bg-gray-900 border border-gray-800 shadow-xl',
                headerTitle: 'text-white',
                headerSubtitle: 'text-gray-400',
                socialButtonsBlockButton: 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700',
                socialButtonsBlockButtonText: 'text-white',
                dividerLine: 'bg-gray-700',
                dividerText: 'text-gray-500',
                formFieldLabel: 'text-gray-300',
                formFieldInput: 'bg-gray-800 border-gray-700 text-white',
                formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
                footerActionLink: 'text-blue-400 hover:text-blue-300',
                identityPreviewText: 'text-white',
                identityPreviewEditButton: 'text-blue-400',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
