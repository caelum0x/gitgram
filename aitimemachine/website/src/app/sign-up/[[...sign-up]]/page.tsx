import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Check } from 'lucide-react';

const benefits = [
  'Unlimited local checkpoints',
  'CLI & MCP tools included',
  'Cloud sync for projects',
  'Community support',
  'No credit card required',
];

export default function SignUpPage() {
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
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Start protecting your
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                development state
              </span>
            </h1>
            <p className="text-gray-400 text-lg">
              Create your free account and start using Gitgram TimeMachine in minutes.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Free plan includes
            </h3>
            <ul className="space-y-3">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-gray-300">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <p className="text-gray-300 italic">
              "Gitgram TimeMachine has saved my project countless times. When Claude breaks something,
              I just undo and try again. Game changer."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
              <div>
                <p className="text-white font-medium">Alex Chen</p>
                <p className="text-gray-500 text-sm">Senior Developer at TechCorp</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-sm">
          Join 10,000+ developers using Gitgram TimeMachine
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
          <SignUp
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
