'use client';

import { useState, useEffect } from 'react';
import api from '@/services/api';

export default function AdsPage() {
  const [ads, setAds] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'post',
    content: '',
    budget: 100,
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchAds();
  }, []);

  const fetchAds = async () => {
    try {
      const res = await api.get('/v1/advertisements');
      setAds(res.data);
    } catch (error) {
      console.error('Failed to fetch ads:', error);
      setAds([]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/v1/advertisements', form);
      setShowForm(false);
      fetchAds();
    } catch (error) {
      console.error('Failed to create ad:', error);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/v1/advertisements/${id}`, { status });
      fetchAds();
    } catch (error) {
      console.error('Failed to update ad status:', error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Advertisements</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-500 text-white px-6 py-2 rounded">
          Create Ad
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-8">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border rounded p-3 mb-4">
            <option value="post">Post Ad</option>
            <option value="story">Story Ad</option>
            <option value="reel">Reel Ad</option>
          </select>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="Ad content"
            className="w-full border rounded p-3 mb-4"
            rows={4}
            required
          />
          <input
            type="number"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
            placeholder="Budget ($)"
            className="w-full border rounded p-3 mb-4"
            required
          />
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="border rounded p-3"
              required
            />
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="border rounded p-3"
              required
            />
          </div>
          <button type="submit" className="bg-blue-500 text-white px-6 py-2 rounded">Create</button>
        </form>
      )}

      <div className="grid gap-6">
        {ads.map((ad) => (
          <div key={ad.id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">{ad.type.toUpperCase()}</div>
                <p>{ad.content}</p>
              </div>
              <select
                value={ad.status}
                onChange={(e) => handleStatusChange(ad.id, e.target.value)}
                className="border rounded px-3 py-1"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">Budget</div>
                <div className="font-bold">${ad.budget}</div>
              </div>
              <div>
                <div className="text-gray-500">Spent</div>
                <div className="font-bold">${ad.spent}</div>
              </div>
              <div>
                <div className="text-gray-500">Impressions</div>
                <div className="font-bold">{ad.impressions.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">Clicks</div>
                <div className="font-bold">{ad.clicks.toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
        {ads.length === 0 && (
          <div className="text-center text-gray-500 py-8">No advertisements</div>
        )}
      </div>
    </div>
  );
}
