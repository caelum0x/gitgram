'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

interface Gif {
    id: string;
    title: string;
    url: string;
    webp: string;
    mp4: string;
    width: number;
    height: number;
    preview: string;
}

interface GifPickerProps {
    onSelect: (gifUrl: string) => void;
    onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [gifs, setGifs] = useState<Gif[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'trending' | 'search'>('trending');

    // Load trending GIFs on mount
    useEffect(() => {
        loadTrendingGifs();
    }, []);

    const loadTrendingGifs = async () => {
        setLoading(true);
        try {
            const response = await api.get('/giphy/trending?limit=30');
            setGifs(response.data.gifs);
        } catch (error) {
            console.error('Failed to load trending GIFs:', error);
        } finally {
            setLoading(false);
        }
    };

    const searchGifs = useCallback(async (query: string) => {
        if (!query.trim()) {
            loadTrendingGifs();
            return;
        }

        setLoading(true);
        try {
            const response = await api.get(`/giphy/search?q=${encodeURIComponent(query)}&limit=30`);
            setGifs(response.data.gifs);
            setActiveTab('search');
        } catch (error) {
            console.error('Failed to search GIFs:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery) {
                searchGifs(searchQuery);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, searchGifs]);

    const handleGifSelect = (gif: Gif) => {
        onSelect(gif.url);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Choose a GIF</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-secondary rounded-full transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-border">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search for GIFs..."
                            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-4 pt-4 flex space-x-4 border-b border-border">
                    <button
                        onClick={() => {
                            setActiveTab('trending');
                            setSearchQuery('');
                            loadTrendingGifs();
                        }}
                        className={`pb-2 px-2 font-medium transition-colors ${activeTab === 'trending'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <div className="flex items-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <span>Trending</span>
                        </div>
                    </button>
                    {searchQuery && (
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`pb-2 px-2 font-medium transition-colors ${activeTab === 'search'
                                ? 'text-primary border-b-2 border-primary'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <div className="flex items-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <span>Search Results</span>
                            </div>
                        </button>
                    )}
                </div>

                {/* GIF Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : gifs.length === 0 ? (
                        <div className="flex items-center justify-center h-64 text-muted-foreground">
                            No GIFs found
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {gifs.map((gif) => (
                                <button
                                    key={gif.id}
                                    onClick={() => handleGifSelect(gif)}
                                    className="relative aspect-square rounded-lg overflow-hidden hover:opacity-75 transition-opacity group"
                                >
                                    <img
                                        src={gif.preview}
                                        alt={gif.title}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-white text-sm font-medium">Select</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border text-center text-xs text-muted-foreground">
                    Powered by GIPHY
                </div>
            </div>
        </div>
    );
}
