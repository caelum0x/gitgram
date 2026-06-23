'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { postService } from '@/services/postService';
import { useAuthStore } from '@/store/authStore';
import { locationService } from '@/services/locationService';

interface Account {
  id: string;
  type: string;
  username: string;
}

interface LocationData {
  name: string;
  latitude: number;
  longitude: number;
}

export default function CreatePost({ onPostCreated }: { onPostCreated?: () => void }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locationResults, setLocationResults] = useState<LocationData[]>([]);
  const [gettingCurrentLocation, setGettingCurrentLocation] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/v1/switch/accounts');
      setAccounts(res.data.accounts || []);
      if (res.data.accounts?.length > 0) {
        setSelectedAccount(res.data.accounts[0]);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const searchLocation = async (query: string) => {
    if (!query.trim()) {
      setLocationResults([]);
      return;
    }
    setSearchingLocation(true);
    try {
      const response = await locationService.geocodeAddress(query);
      if (response.location) {
        setLocationResults([{
          name: response.location.name || query,
          latitude: response.location.latitude,
          longitude: response.location.longitude,
        }]);
      }
    } catch (error) {
      console.error('Location search error:', error);
      setLocationResults([]);
    } finally {
      setSearchingLocation(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    setGettingCurrentLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          setSelectedLocation({
            name: 'Current Location',
            latitude,
            longitude,
          });
          setShowLocationPicker(false);
        } catch (error) {
          console.error('Failed to get location name:', error);
        } finally {
          setGettingCurrentLocation(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your location. Please check your permissions.');
        setGettingCurrentLocation(false);
      }
    );
  };

  const selectLocation = (location: LocationData) => {
    setSelectedLocation(location);
    setShowLocationPicker(false);
    setLocationSearch('');
    setLocationResults([]);
  };

  const removeLocation = () => {
    setSelectedLocation(null);
  };

  // Media handling
  const handleFilesSelected = (files: File[]) => {
    const maxFiles = 10;
    const maxSize = 10 * 1024 * 1024; // 10MB

    const validFiles = files.filter(f => {
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return false;
      if (f.size > maxSize) return false;
      return true;
    });

    const total = [...mediaFiles, ...validFiles].slice(0, maxFiles);
    const previews = total.map(f => URL.createObjectURL(f));

    // Clean up old previews
    mediaPreviews.forEach(p => URL.revokeObjectURL(p));

    setMediaFiles(total);
    setMediaPreviews(previews);
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreviews[index]);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    handleFilesSelected(files);
  };

  const createPost = async () => {
    if (!content.trim() && mediaFiles.length === 0) return;

    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (selectedAccount) formData.append('accountId', selectedAccount.id);
      mediaFiles.forEach(file => {
        formData.append('media', file);
      });
      if (mediaFiles.length > 0) {
        formData.append('mediaType', mediaFiles[0].type.startsWith('video/') ? 'video' : 'image');
      }
      if (selectedLocation) {
        formData.append('location', JSON.stringify({
          name: selectedLocation.name,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        }));
      }

      await postService.createPost(formData);
      setContent('');
      setSelectedLocation(null);
      setMediaFiles([]);
      setMediaPreviews([]);
      onPostCreated?.();
    } catch (error) {
      console.error('Failed to create post:', error);
    } finally {
      setPosting(false);
    }
  };

  const navigateToFullComposer = () => {
    router.push('/create');
  };

  const displayName = user?.username || selectedAccount?.username || '?';

  return (
    <div
      className="bg-surface rounded-xl p-4 border border-border"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto mb-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-semibold text-primary">Drop files here</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 relative">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
          {user?.avatar ? (
            <img src={user.avatar} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            displayName[0]?.toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          {accounts.length > 1 && (
            <div className="mb-2">
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const account = accounts.find(a => a.id === e.target.value);
                  setSelectedAccount(account || null);
                }}
                className="text-xs px-2 py-1 rounded-lg border border-border bg-background text-foreground"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username} ({account.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your code, progress, or thoughts..."
            className="w-full p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground text-sm"
            rows={3}
          />

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {mediaPreviews.map((src, i) => (
                <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden">
                  {mediaFiles[i]?.type.startsWith('video/') ? (
                    <video src={src} className="w-full h-full object-cover" />
                  ) : (
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Location Display */}
          {selectedLocation && (
            <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-primary/5 rounded-lg text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-primary flex-1">{selectedLocation.name}</span>
              <button onClick={removeLocation} className="text-primary hover:text-error">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Location Picker */}
          {showLocationPicker && (
            <div className="mt-2 p-3 border border-border rounded-lg bg-surface-secondary text-sm">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={locationSearch}
                  onChange={(e) => {
                    setLocationSearch(e.target.value);
                    searchLocation(e.target.value);
                  }}
                  placeholder="Search for a location..."
                  className="flex-1 px-3 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={getCurrentLocation}
                  disabled={gettingCurrentLocation}
                  className="px-2 py-1.5 bg-surface-secondary border border-border rounded-lg hover:bg-surface"
                  title="Use current location"
                >
                  {gettingCurrentLocation ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-foreground-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {searchingLocation && (
                <div className="text-xs text-foreground-secondary py-1">Searching...</div>
              )}
              {locationResults.length > 0 && (
                <div className="space-y-1">
                  {locationResults.map((loc, index) => (
                    <button
                      key={index}
                      onClick={() => selectLocation(loc)}
                      className="w-full text-left px-3 py-1.5 hover:bg-surface rounded text-xs"
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowLocationPicker(false)}
                className="mt-1 text-xs text-foreground-secondary hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1">
              {/* Photo */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-lg text-foreground-secondary hover:bg-surface-secondary transition-colors"
                title="Add photo"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => handleFilesSelected(Array.from(e.target.files || []))}
                className="hidden"
              />

              {/* Location */}
              <button
                onClick={() => setShowLocationPicker(!showLocationPicker)}
                className={`p-2 rounded-lg transition-colors ${
                  selectedLocation
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground-secondary hover:bg-surface-secondary'
                }`}
                title="Add location"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* More options - navigate to full composer */}
              <button
                onClick={navigateToFullComposer}
                className="p-2 rounded-lg text-foreground-secondary hover:bg-surface-secondary transition-colors"
                title="More options (code, video, repo link, schedule)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>

            <button
              onClick={createPost}
              disabled={(!content.trim() && mediaFiles.length === 0) || posting}
              className="px-5 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
            >
              {posting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Posting...
                </div>
              ) : (
                'Post'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
