'use client'

import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted mb-8">Effective Date: February 16, 2026</p>
      <div className="space-y-8 text-muted">
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using Gitgram (&quot;Service&quot;), operated by Gitgram (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service. We reserve the right to update these Terms at any time, and your continued use of the Service constitutes acceptance of any modifications.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">2. Description of Service</h2>
          <p>Gitgram is a social platform for developers that integrates with GitHub. The Service allows users to share code, projects, and updates; connect with other developers; discover repositories and trending projects; and build a developer portfolio. We may modify, suspend, or discontinue any aspect of the Service at any time without prior notice.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">3. User Accounts</h2>
          <p className="mb-2">To use certain features of the Service, you must create an account. You agree to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide accurate, current, and complete registration information</li>
            <li>Maintain the security of your password and account</li>
            <li>Promptly update your account information if it changes</li>
            <li>Accept responsibility for all activities under your account</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
          </ul>
          <p className="mt-2">You must be at least 13 years of age to create an account. If you are under 18, you represent that your parent or legal guardian has reviewed and agreed to these Terms.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">4. User Content</h2>
          <p className="mb-2">You retain ownership of all content you submit, post, or display on or through the Service (&quot;User Content&quot;). By posting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display, and distribute such content in connection with operating and providing the Service.</p>
          <p>You represent and warrant that you own or have the necessary rights to post your User Content and that it does not violate any third party&apos;s intellectual property rights, privacy rights, or any applicable law.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">5. GitHub Integration</h2>
          <p className="mb-2">The Service integrates with GitHub&apos;s API to provide repository information, code sharing, and developer profile features. By connecting your GitHub account:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>You authorize us to access your public GitHub profile and repository data</li>
            <li>You acknowledge that your use of GitHub is subject to GitHub&apos;s own Terms of Service</li>
            <li>We do not store your GitHub access tokens beyond your active session</li>
            <li>You may disconnect your GitHub account at any time through your account settings</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">6. Acceptable Use</h2>
          <p className="mb-2">You agree not to use the Service to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Violate any applicable law, regulation, or third-party rights</li>
            <li>Post content that is defamatory, obscene, harassing, or threatening</li>
            <li>Impersonate any person or entity, or misrepresent your affiliation</li>
            <li>Distribute malware, viruses, or other harmful code</li>
            <li>Scrape, crawl, or use automated means to access the Service without permission</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Use the Service for spam, phishing, or unsolicited commercial messages</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">7. Subscriptions and Billing</h2>
          <p className="mb-2">Gitgram offers free and paid subscription plans. For paid plans:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Fees are billed in advance on a monthly basis</li>
            <li>All fees are non-refundable except as required by law or as stated in our refund policy</li>
            <li>We offer a 14-day refund window for new subscriptions</li>
            <li>You may cancel your subscription at any time; access continues until the end of the billing period</li>
            <li>We reserve the right to change pricing with 30 days&apos; advance notice</li>
            <li>Payment processing is handled by Polar; your payment information is subject to Polar&apos;s terms</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">8. Intellectual Property</h2>
          <p>The Service, including its original content (excluding User Content), features, and functionality, is owned by Gitgram and is protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">9. Privacy</h2>
          <p>Your use of the Service is also governed by our <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>, which describes how we collect, use, and share your personal information. By using the Service, you consent to our collection and use of data as described in the Privacy Policy.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">10. Service Availability</h2>
          <p>We strive to maintain high availability of the Service but do not guarantee uninterrupted or error-free operation. We may perform scheduled maintenance, during which the Service may be temporarily unavailable. We are not liable for any downtime, data loss, or service interruptions, whether planned or unplanned.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">11. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law, Gitgram and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of (or inability to access or use) the Service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">12. Disclaimer of Warranties</h2>
          <p>The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance. We do not warrant that the Service will be secure, error-free, or available at all times.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">13. Termination</h2>
          <p className="mb-2">We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Your right to use the Service will immediately cease</li>
            <li>We may delete your account and User Content</li>
            <li>Any provisions of these Terms that by their nature should survive termination will survive</li>
          </ul>
          <p className="mt-2">You may delete your account at any time through your account settings.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">14. Governing Law</h2>
          <p>These Terms shall be governed and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved in the state or federal courts located in Delaware, and you consent to the personal jurisdiction of such courts.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">15. Changes to Terms</h2>
          <p>We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days&apos; notice prior to any new terms taking effect, either through email notification or a prominent notice on the Service. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">16. Contact Information</h2>
          <p>If you have any questions about these Terms of Service, please contact us at:</p>
          <p className="mt-2">Email: <a href="mailto:legal@gitgram.app" className="text-primary hover:underline">legal@gitgram.app</a></p>
        </section>
      </div>
    </div>
  )
}
