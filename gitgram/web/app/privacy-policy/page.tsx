'use client'

import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted mb-8">Effective Date: February 16, 2026</p>
      <div className="space-y-8 text-muted">
        <p>This Privacy Policy describes how Gitgram (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and shares your personal information when you use our platform and services (&quot;Service&quot;). We are committed to protecting your privacy and handling your data transparently.</p>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">1. Information We Collect</h2>
          <p className="mb-2"><strong className="text-foreground">Information you provide directly:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4 mb-4">
            <li>Account information: name, email address, username, password</li>
            <li>Profile information: bio, avatar, full name, links</li>
            <li>Content you post: text, code snippets, images, comments</li>
            <li>Communications: messages sent to other users or to our support team</li>
            <li>Payment information: billing details (processed securely by Polar)</li>
          </ul>
          <p className="mb-2"><strong className="text-foreground">Information collected automatically:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4 mb-4">
            <li>Device information: browser type, operating system, device identifiers</li>
            <li>Usage data: pages visited, features used, time spent on the Service</li>
            <li>Log data: IP address, access times, referring URLs</li>
            <li>Performance data: page load times, errors encountered</li>
          </ul>
          <p className="mb-2"><strong className="text-foreground">Information from third parties:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>GitHub: public profile data, repository information, contribution activity (when you connect your GitHub account)</li>
            <li>Authentication providers: basic profile data from OAuth login</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">2. How We Use Your Information</h2>
          <p className="mb-2">We use your information to:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide, maintain, and improve the Service</li>
            <li>Create and manage your account</li>
            <li>Display your profile and content to other users</li>
            <li>Send notifications about activity relevant to you</li>
            <li>Process payments and manage subscriptions</li>
            <li>Respond to your requests and provide support</li>
            <li>Analyze usage patterns to improve the user experience</li>
            <li>Detect and prevent fraud, abuse, and security incidents</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">3. Legal Basis for Processing (GDPR)</h2>
          <p className="mb-2">If you are in the European Economic Area (EEA), we process your personal data based on the following legal grounds:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong className="text-foreground">Contract:</strong> Processing necessary to provide the Service you requested</li>
            <li><strong className="text-foreground">Consent:</strong> Where you have given explicit consent (e.g., marketing emails)</li>
            <li><strong className="text-foreground">Legitimate Interests:</strong> Processing necessary for our legitimate business interests, such as improving the Service and preventing fraud</li>
            <li><strong className="text-foreground">Legal Obligation:</strong> Processing necessary to comply with applicable laws</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">4. Information Sharing</h2>
          <p className="mb-2">We do not sell your personal information. We may share your information with:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong className="text-foreground">Service Providers:</strong> Third-party vendors who assist in operating the Service (hosting, analytics, payment processing)</li>
            <li><strong className="text-foreground">Other Users:</strong> Your public profile, posts, and comments are visible to other users</li>
            <li><strong className="text-foreground">Legal Requirements:</strong> When required by law, legal process, or government request</li>
            <li><strong className="text-foreground">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            <li><strong className="text-foreground">With Your Consent:</strong> When you explicitly authorize sharing</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">5. Data Retention</h2>
          <p className="mb-2">We retain your personal information for as long as your account is active or as needed to provide the Service. Specifically:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Account data: retained until you delete your account</li>
            <li>User Content: retained until you delete it or your account</li>
            <li>Usage logs: retained for up to 12 months</li>
            <li>Payment records: retained for 7 years as required by financial regulations</li>
          </ul>
          <p className="mt-2">After account deletion, we may retain certain data in anonymized form for analytics purposes, and as required by law.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">6. Your Rights</h2>
          <p className="mb-2">Depending on your jurisdiction, you may have the following rights:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong className="text-foreground">Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong className="text-foreground">Correction:</strong> Request correction of inaccurate or incomplete data</li>
            <li><strong className="text-foreground">Deletion:</strong> Request deletion of your personal data</li>
            <li><strong className="text-foreground">Portability:</strong> Request your data in a structured, machine-readable format</li>
            <li><strong className="text-foreground">Objection:</strong> Object to processing based on legitimate interests</li>
            <li><strong className="text-foreground">Restriction:</strong> Request restriction of processing under certain conditions</li>
            <li><strong className="text-foreground">Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
          </ul>
          <p className="mt-2"><strong className="text-foreground">California Residents (CCPA):</strong> You have the right to know what personal information is collected, request deletion, and opt out of the sale of personal information. We do not sell personal information. To exercise these rights, contact us at <a href="mailto:privacy@gitgram.app" className="text-primary hover:underline">privacy@gitgram.app</a>.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">7. International Data Transfers</h2>
          <p>Your information may be transferred to and processed in countries other than your country of residence, including the United States. These countries may have different data protection laws. We ensure appropriate safeguards are in place for such transfers, including Standard Contractual Clauses approved by the European Commission where applicable.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">8. Cookies and Tracking Technologies</h2>
          <p className="mb-2">We use the following types of cookies and similar technologies:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong className="text-foreground">Essential Cookies:</strong> Required for the Service to function (authentication, security)</li>
            <li><strong className="text-foreground">Analytics Cookies:</strong> Help us understand how users interact with the Service</li>
            <li><strong className="text-foreground">Preference Cookies:</strong> Remember your settings and preferences (theme, language)</li>
          </ul>
          <p className="mt-2">You can manage cookie preferences through your browser settings. Disabling certain cookies may affect Service functionality.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">9. Children&apos;s Privacy</h2>
          <p>The Service is not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13, we will promptly delete that information. If you believe a child under 13 has provided us with personal information, please contact us at <a href="mailto:privacy@gitgram.app" className="text-primary hover:underline">privacy@gitgram.app</a>.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">10. Data Security</h2>
          <p className="mb-2">We implement industry-standard security measures to protect your information, including:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Encryption of data in transit (TLS/SSL) and at rest</li>
            <li>Regular security assessments and penetration testing</li>
            <li>Access controls and authentication for internal systems</li>
            <li>Monitoring for suspicious activity and unauthorized access</li>
          </ul>
          <p className="mt-2">However, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security of your data.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">11. Third-Party Links</h2>
          <p>The Service may contain links to third-party websites or services (including GitHub). We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party services you access through our Service.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">12. Do Not Track</h2>
          <p>Some browsers offer a &quot;Do Not Track&quot; (DNT) setting. We currently do not respond to DNT signals, as there is no industry-standard protocol for compliance. We will update this policy if a standard is established.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">13. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the effective date. For significant changes, we will provide additional notice via email or an in-app notification. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">14. Contact Us</h2>
          <p className="mb-2">If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us at:</p>
          <p>Email: <a href="mailto:privacy@gitgram.app" className="text-primary hover:underline">privacy@gitgram.app</a></p>
          <p className="mt-4">For GDPR-related inquiries, you also have the right to lodge a complaint with your local data protection authority.</p>
        </section>
      </div>
    </div>
  )
}
