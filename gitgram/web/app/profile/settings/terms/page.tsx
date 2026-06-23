'use client'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-6">Terms of Service</h1>
        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
            <p className="text-foreground/70">
              By accessing and using Gitgram, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Use License</h2>
            <p className="text-foreground/70">
              Permission is granted to temporarily use Gitgram for personal, non-commercial transitory viewing only.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. User Content</h2>
            <p className="text-foreground/70">
              You are responsible for all content you post on Gitgram. You grant us a license to use, modify, and display your content.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Prohibited Uses</h2>
            <p className="text-foreground/70">
              You may not use Gitgram in any way that is unlawful, harmful, or violates any applicable laws or regulations.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

