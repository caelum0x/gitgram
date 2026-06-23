'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import api from '@/services/api';

interface PartnerStats {
  totalReach: number;
  engagementRate: number;
  avgCampaignValue: number;
}

const INITIAL_FORM = {
  brandName: '',
  contactEmail: '',
  budget: '',
  description: '',
};

function formatNumber(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  }
  return String(n);
}

export default function PartnershipsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();

  const [form, setForm] = useState(INITIAL_FORM);
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const response = await api.get('/v1/partnerships/stats');
      setStats(response.data.stats ?? response.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load partnership stats';
      showToast(message, 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
    }
  }, [isAuthenticated, loadStats]);

  if (!isAuthenticated) return null;

  const handleFieldChange = (field: keyof typeof INITIAL_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await api.post('/v1/partnerships/apply', {
        brandName: form.brandName,
        contactEmail: form.contactEmail,
        budget: Number(form.budget),
        description: form.description,
      });
      showToast('Partnership application submitted successfully', 'success');
      setForm(INITIAL_FORM);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit partnership application';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalReach = stats?.totalReach ?? 0;
  const engagementRate = stats?.engagementRate ?? 0;
  const avgCampaignValue = stats?.avgCampaignValue ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8 text-foreground">Brand Partnerships</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {loadingStats ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="bg-card p-6 rounded-lg border border-border text-center animate-pulse">
              <div className="h-8 w-20 mx-auto bg-border rounded mb-2" />
              <div className="h-4 w-24 mx-auto bg-border rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">
                {formatNumber(totalReach)}+
              </div>
              <div className="text-muted">Total Reach</div>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">
                {engagementRate.toFixed(1)}%
              </div>
              <div className="text-muted">Engagement Rate</div>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">
                ${formatNumber(avgCampaignValue)}+
              </div>
              <div className="text-muted">Avg Campaign Value</div>
            </div>
          </>
        )}
      </div>

      <div className="bg-card p-6 rounded-lg border border-border">
        <h2 className="text-xl font-bold mb-4 text-foreground">Request Partnership</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={form.brandName}
            onChange={(e) => handleFieldChange('brandName', e.target.value)}
            placeholder="Brand Name"
            className="w-full border border-border rounded px-4 py-2 bg-muted text-foreground"
            required
          />
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => handleFieldChange('contactEmail', e.target.value)}
            placeholder="Contact Email"
            className="w-full border border-border rounded px-4 py-2 bg-muted text-foreground"
            required
          />
          <input
            type="number"
            value={form.budget}
            onChange={(e) => handleFieldChange('budget', e.target.value)}
            placeholder="Budget ($)"
            className="w-full border border-border rounded px-4 py-2 bg-muted text-foreground"
            required
          />
          <textarea
            value={form.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Campaign Description"
            className="w-full border border-border rounded px-4 py-2 bg-muted text-foreground"
            rows={4}
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
