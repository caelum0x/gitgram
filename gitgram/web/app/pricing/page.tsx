'use client'

import { useState } from 'react'
import Link from 'next/link'

interface PlanFeature {
  name: string
  free: boolean | string
  premium: boolean | string
  creator: boolean | string
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started with Gitgram',
    features: [
      'Basic profile',
      'Post updates & code snippets',
      'Follow developers',
      'View public repositories',
      'Basic analytics',
    ],
    highlighted: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$9.99',
    period: 'per month',
    description: 'For developers who want more visibility',
    features: [
      'Everything in Free',
      'Verified badge',
      'Priority support',
      'Advanced analytics',
      'Custom profile themes',
      'Hide ads',
      'Early access to features',
    ],
    highlighted: true,
  },
  {
    id: 'creator',
    name: 'Creator',
    price: '$19.99',
    period: 'per month',
    description: 'For content creators and open source maintainers',
    features: [
      'Everything in Premium',
      'Gold verified badge',
      'Monetization features',
      'Sponsorship dashboard',
      'API access',
      'Dedicated support',
      'Team collaboration tools',
      'Custom domain support',
    ],
    highlighted: false,
  },
]

const featureComparison: PlanFeature[] = [
  { name: 'Posts per day', free: '10', premium: 'Unlimited', creator: 'Unlimited' },
  { name: 'File uploads', free: '100 MB/month', premium: '10 GB/month', creator: '100 GB/month' },
  { name: 'Video uploads', free: false, premium: true, creator: true },
  { name: 'Verified badge', free: false, premium: true, creator: 'Gold' },
  { name: 'Analytics dashboard', free: 'Basic', premium: 'Advanced', creator: 'Advanced' },
  { name: 'Custom themes', free: false, premium: true, creator: true },
  { name: 'Hide advertisements', free: false, premium: true, creator: true },
  { name: 'Priority support', free: false, premium: true, creator: 'Dedicated' },
  { name: 'API access', free: 'Read-only', premium: 'Full', creator: 'Full + Webhooks' },
  { name: 'Monetization', free: false, premium: false, creator: true },
  { name: 'Team collaboration', free: false, premium: false, creator: true },
  { name: 'Custom domain', free: false, premium: false, creator: true },
]

const faqs = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes! You can cancel your subscription at any time. You will continue to have access to premium features until the end of your current billing period.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards and popular payment methods through our secure payment provider, Polar.',
  },
  {
    question: 'Is there a free trial?',
    answer: 'Yes! All paid plans come with a 7-day free trial. You will not be charged until the trial period ends, and you can cancel anytime during the trial.',
  },
  {
    question: 'Can I switch plans?',
    answer: 'Absolutely! You can upgrade or downgrade your plan at any time. When upgrading, you will be charged the prorated difference. When downgrading, the change takes effect at the start of your next billing cycle.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'We offer a full refund within the first 14 days of your subscription if you are not satisfied. After that, you can cancel anytime but refunds are not available.',
  },
  {
    question: 'Do you offer discounts for open source maintainers?',
    answer: 'Yes! If you maintain an open source project with more than 100 stars, contact us for a special discount on Premium and Creator plans. We believe in supporting the open source community.',
  },
]

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5 text-accent'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className || 'w-5 h-5 text-muted'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function FeatureCell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckIcon className={`w-5 h-5 mx-auto ${highlight ? 'text-primary' : 'text-accent'}`} />
    ) : (
      <XIcon className="w-5 h-5 mx-auto text-muted" />
    )
  }
  return (
    <span className={`text-sm ${highlight ? 'font-medium text-primary' : 'text-muted'}`}>
      {value}
    </span>
  )
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="max-w-6xl mx-auto py-16 px-4">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-lg text-muted max-w-2xl mx-auto">
          Unlock premium features and take your developer presence to the next level.
          All paid plans include a 7-day free trial.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-20">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative p-6 bg-card border rounded-xl transition-all ${
              plan.highlighted
                ? 'border-primary shadow-lg shadow-primary/10 scale-105'
                : 'border-border hover:border-muted-foreground/30'
            }`}
          >
            {plan.highlighted && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-white text-sm font-semibold rounded-full">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted">/{plan.period}</span>
              </div>
              <p className="text-sm text-muted mt-2">{plan.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${plan.highlighted ? 'text-primary' : 'text-accent'}`} />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className={`block text-center w-full py-3 rounded-lg font-semibold transition-colors ${
                plan.highlighted
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'border border-border hover:bg-muted'
              }`}
            >
              {plan.id === 'free' ? 'Get Started Free' : 'Start Free Trial'}
            </Link>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4 font-semibold">Free</th>
                <th className="text-center py-4 px-4 font-semibold text-primary">Premium</th>
                <th className="text-center py-4 px-4 font-semibold">Creator</th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((feature, index) => (
                <tr key={index} className="border-b border-border hover:bg-muted/50">
                  <td className="py-4 px-4 text-sm">{feature.name}</td>
                  <td className="text-center py-4 px-4">
                    <FeatureCell value={feature.free} />
                  </td>
                  <td className="text-center py-4 px-4 bg-primary/5">
                    <FeatureCell value={feature.premium} highlight />
                  </td>
                  <td className="text-center py-4 px-4">
                    <FeatureCell value={feature.creator} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold pr-4">{faq.question}</h3>
                <svg
                  className={`w-5 h-5 flex-shrink-0 text-muted transition-transform ${openFaq === index ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === index && (
                <div className="px-6 pb-6">
                  <p className="text-sm text-muted">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20">
        <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-muted mb-6 max-w-xl mx-auto">
          Join thousands of developers who are already using Gitgram to showcase their work and connect with the community.
        </p>
        <Link
          href="/register"
          className="inline-block px-8 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Create Free Account
        </Link>
      </div>
    </div>
  )
}
