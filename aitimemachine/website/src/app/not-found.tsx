import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full text-center">
          <div className="mx-auto w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
            <FileQuestion className="w-10 h-10 text-blue-400" />
          </div>

          <h1 className="text-6xl font-bold text-gray-200 mb-2">404</h1>
          <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
          <p className="text-gray-400 mb-8">
            The page you're looking for doesn't exist or has been moved.
            Let's get you back on track.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild>
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/docs">
                <ArrowLeft className="w-4 h-4 mr-2" />
                View Docs
              </Link>
            </Button>
          </div>

          <div className="mt-12 p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="font-semibold mb-3">Looking for something?</h3>
            <div className="flex flex-wrap gap-2 justify-center">
              <Link href="/docs" className="text-sm text-blue-400 hover:underline">Documentation</Link>
              <span className="text-gray-600">|</span>
              <Link href="/pricing" className="text-sm text-blue-400 hover:underline">Pricing</Link>
              <span className="text-gray-600">|</span>
              <Link href="/blog" className="text-sm text-blue-400 hover:underline">Blog</Link>
              <span className="text-gray-600">|</span>
              <Link href="/dashboard" className="text-sm text-blue-400 hover:underline">Dashboard</Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
