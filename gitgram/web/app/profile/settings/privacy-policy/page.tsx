'use client'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-6">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Information We Collect</h2>
            <p className="text-foreground/70">
              We collect information you provide directly to us, such as when you create an account, post content, or communicate with us.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. How We Use Your Information</h2>
            <p className="text-foreground/70">
              We use the information we collect to provide, maintain, and improve our services, and to communicate with you.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. Information Sharing</h2>
            <p className="text-foreground/70">
              We do not sell your personal information. We may share your information in certain limited circumstances.
            </p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Your Rights</h2>
            <p className="text-foreground/70">
              You have the right to access, update, or delete your personal information at any time.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

