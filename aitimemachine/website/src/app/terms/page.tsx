import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <Badge className="mb-4">Legal</Badge>
        <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
        <p className="text-gray-400 mb-8">Last updated: February 17, 2026</p>

        <div className="prose prose-invert prose-gray max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300 mb-4">
              By accessing or using Gitgram TimeMachine ("Service"), you agree to be bound by these Terms of Service
              ("Terms"). If you disagree with any part of the terms, you may not access the Service.
            </p>
            <p className="text-gray-300">
              These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-gray-300 mb-4">
              Gitgram TimeMachine provides a development state management tool that allows users to:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Create checkpoints of their development environment</li>
              <li>Restore to previous states</li>
              <li>Track terminal history and AI conversations</li>
              <li>Sync data across devices (paid plans)</li>
              <li>Access the Service via CLI, API, and MCP protocol</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="text-gray-300 mb-4">
              When you create an account with us, you must provide accurate, complete, and current information.
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Maintaining the confidentiality of your account and password</li>
              <li>Restricting access to your computer and account</li>
              <li>All activities that occur under your account</li>
            </ul>
            <p className="text-gray-300 mt-4">
              You must notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="text-gray-300 mb-4">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Violate any laws or regulations</li>
              <li>Store or transmit malicious code or malware</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Attempt to gain unauthorized access to systems</li>
              <li>Store illegal, harmful, or objectionable content</li>
              <li>Impersonate any person or entity</li>
              <li>Engage in any activity that could harm the Service or other users</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">5. API Usage</h2>
            <p className="text-gray-300 mb-4">
              If you use our API, you agree to the following additional terms:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>You will not exceed the rate limits for your plan</li>
              <li>API keys must be kept confidential and not shared</li>
              <li>You will not attempt to circumvent usage limits</li>
              <li>You are responsible for all activity under your API keys</li>
            </ul>
            <p className="text-gray-300 mt-4">
              We reserve the right to suspend API access for any violation of these terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">6. Subscription and Billing</h2>

            <h3 className="text-xl font-medium mb-3 mt-6">Free Plan</h3>
            <p className="text-gray-300 mb-4">
              The free plan provides limited functionality at no cost. We reserve the right to modify
              free plan features at any time.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">Paid Plans</h3>
            <p className="text-gray-300 mb-4">
              Paid subscriptions are billed in advance on a monthly or annual basis. By subscribing,
              you authorize us to charge your payment method.
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Prices are subject to change with 30 days notice</li>
              <li>Refunds are available within 14 days of purchase</li>
              <li>Cancellation takes effect at the end of the billing period</li>
              <li>No prorated refunds for partial months</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-gray-300 mb-4">
              The Service and its original content, features, and functionality are owned by Gitgram TimeMachine
              and are protected by international copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-gray-300">
              Your content remains yours. By using the Service, you grant us a limited license to store
              and process your content solely to provide the Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">8. Data and Privacy</h2>
            <p className="text-gray-300 mb-4">
              Your use of the Service is also governed by our Privacy Policy. By using the Service,
              you consent to our collection and use of data as described in the Privacy Policy.
            </p>
            <p className="text-gray-300">
              You are responsible for maintaining backups of your data. While we implement reasonable
              safeguards, we do not guarantee against data loss.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">9. Service Availability</h2>
            <p className="text-gray-300 mb-4">
              We strive to maintain high availability but do not guarantee uninterrupted service.
              We may:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Perform scheduled maintenance with advance notice</li>
              <li>Experience unplanned outages</li>
              <li>Modify or discontinue features</li>
              <li>Limit access during high-demand periods</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">10. Limitation of Liability</h2>
            <p className="text-gray-300 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, AITIMEMACHINE SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Loss of profits, data, or goodwill</li>
              <li>Service interruption or computer damage</li>
              <li>Cost of substitute services</li>
              <li>Any damages arising from your use of the Service</li>
            </ul>
            <p className="text-gray-300 mt-4">
              Our total liability shall not exceed the amount paid by you in the twelve months preceding the claim.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">11. Disclaimer of Warranties</h2>
            <p className="text-gray-300">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
            <p className="text-gray-300 mb-4">
              We may terminate or suspend your account immediately, without prior notice, for any reason,
              including breach of these Terms. Upon termination:
            </p>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Your right to use the Service ceases immediately</li>
              <li>We may delete your data after 30 days</li>
              <li>You remain liable for any outstanding fees</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">13. Governing Law</h2>
            <p className="text-gray-300">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware,
              United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">14. Changes to Terms</h2>
            <p className="text-gray-300">
              We reserve the right to modify these Terms at any time. We will provide notice of material changes
              by posting the new Terms on this page and updating the "Last updated" date. Your continued use of
              the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Contact Us</h2>
            <p className="text-gray-300 mb-4">
              If you have questions about these Terms, please contact us at:
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-gray-300">
              <p>Gitgram TimeMachine</p>
              <p>Email: legal@gitgram.app</p>
            </div>
          </section>
        </div>
      </article>

      <Footer />
    </div>
  );
}
