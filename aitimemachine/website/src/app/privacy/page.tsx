import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <Badge className="mb-4">Legal</Badge>
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: August 23, 2026</p>

        <div className="prose prose-invert prose-gray max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-gray-300 mb-4">
              Gitgram TimeMachine ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
            <p className="text-gray-300">
              Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy,
              please do not access the service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-medium mb-3 mt-6">Personal Information</h3>
            <p className="text-gray-300 mb-4">We may collect personal information that you voluntarily provide when you:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2 mb-4">
              <li>Register for an account</li>
              <li>Subscribe to our service</li>
              <li>Contact our support team</li>
              <li>Participate in surveys or promotions</li>
            </ul>
            <p className="text-gray-300 mb-4">This may include:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Name and email address</li>
              <li>Billing information and payment details</li>
              <li>Usage data and preferences</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">Checkpoint Data</h3>
            <p className="text-gray-300 mb-4">
              When you use our service, we store checkpoint data that may include:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>File snapshots (for cloud sync users)</li>
              <li>Terminal command history</li>
              <li>AI conversation context</li>
              <li>Project metadata</li>
            </ul>
            <p className="text-gray-300 mt-4">
              <strong>Important:</strong> Free tier users' data stays entirely local on their machines.
              We only store checkpoint data for Pro and Team users who opt into cloud sync.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">Open Source Evidence</h3>
            <p className="text-gray-300 mb-4">
              Maintainers can submit bounded coverage batches for external contributions and first response times.
              The service stores repository, contributor, and contribution references as opaque, secret-keyed HMAC-SHA-256 keys.
            </p>
            <p className="text-gray-300">
              Public adoption reports contain aggregate counts, measurement windows, and status labels. They do not
              include account, repository, project, checkpoint, restore, contributor, or contribution identifiers.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-300 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Monitor and analyze usage trends</li>
              <li>Detect and prevent fraud and abuse</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p className="text-gray-300 mb-4">
              We implement appropriate technical and organizational measures to protect your personal information:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>All data in transit is encrypted using TLS 1.3</li>
              <li>Data at rest is encrypted using AES-256</li>
              <li>API keys are hashed using SHA-256 before storage</li>
              <li>Regular security audits and penetration testing</li>
              <li>SOC 2 Type II compliance (in progress)</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <p className="text-gray-300 mb-4">
              We retain your data for as long as your account is active or as needed to provide you services:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Account data: Until account deletion</li>
              <li>Checkpoint data: Per your plan (30-90 days of history)</li>
              <li>Billing records: 7 years for legal compliance</li>
              <li>Support communications: 3 years</li>
            </ul>
            <p className="text-gray-300 mt-4">
              After account deletion, your data is permanently removed within 30 days.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
            <p className="text-gray-300 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of marketing communications</li>
              <li>Withdraw consent at any time</li>
            </ul>
            <p className="text-gray-300 mt-4">
              To exercise these rights, contact us at privacy@gitgram.app.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">7. Third-Party Services</h2>
            <p className="text-gray-300 mb-4">We use the following third-party services:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li><strong>Clerk</strong> - Authentication and user management</li>
              <li><strong>Polar.sh</strong> - Payment processing</li>
              <li><strong>Vercel</strong> - Hosting and analytics</li>
              <li><strong>AWS S3</strong> - Cloud storage for checkpoint data</li>
            </ul>
            <p className="text-gray-300 mt-4">
              Each service has its own privacy policy governing their use of your data.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">8. Cookies</h2>
            <p className="text-gray-300 mb-4">
              We use essential cookies required for the service to function. We do not use tracking
              or advertising cookies. You can configure your browser to refuse cookies, but some
              features may not work properly.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
            <p className="text-gray-300">
              Our service is not intended for children under 13. We do not knowingly collect personal
              information from children under 13. If we learn we have collected such information,
              we will delete it immediately.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">10. Changes to This Policy</h2>
            <p className="text-gray-300">
              We may update this privacy policy from time to time. We will notify you of any changes
              by posting the new policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Us</h2>
            <p className="text-gray-300 mb-4">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-300">
              <p>Gitgram TimeMachine</p>
              <p>Email: privacy@gitgram.app</p>
            </div>
          </section>
        </div>
      </article>

      <Footer />
    </div>
  );
}
