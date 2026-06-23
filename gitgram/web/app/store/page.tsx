'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/services/api';

interface StoreItem {
  id: string;
  name: string;
  description: string;
  price: number;
  images?: string[];
}

interface SellFormData {
  name: string;
  description: string;
  price: string;
}

const INITIAL_SELL_FORM: SellFormData = {
  name: '',
  description: '',
  price: '',
};

export default function StorePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();

  const [products, setProducts] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSellForm, setShowSellForm] = useState(false);
  const [sellForm, setSellForm] = useState<SellFormData>(INITIAL_SELL_FORM);
  const [selling, setSelling] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login');
  }, [isAuthenticated, router]);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/v1/store/items');
      setProducts(response.data.products ?? response.data.items ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load store items';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadProducts();
    }
  }, [isAuthenticated, loadProducts]);

  if (!isAuthenticated) return null;

  const handlePurchase = async (itemId: string, itemName: string) => {
    try {
      setPurchasingId(itemId);
      await api.post('/v1/store/purchase', { itemId });
      showToast(`Purchased ${itemName} successfully`, 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to purchase item';
      showToast(message, 'error');
    } finally {
      setPurchasingId(null);
    }
  };

  const handleSellFormChange = (field: keyof SellFormData, value: string) => {
    setSellForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellForm.name.trim() || !sellForm.price.trim()) {
      showToast('Name and price are required', 'warning');
      return;
    }

    try {
      setSelling(true);
      await api.post('/v1/store/items', {
        name: sellForm.name,
        description: sellForm.description,
        price: Number(sellForm.price),
      });
      showToast('Item listed successfully', 'success');
      setSellForm(INITIAL_SELL_FORM);
      setShowSellForm(false);
      await loadProducts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list item';
      showToast(message, 'error');
    } finally {
      setSelling(false);
    }
  };

  const filteredProducts = searchQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : products;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-foreground">Marketplace</h1>
        <Button
          variant="primary"
          onClick={() => setShowSellForm((prev) => !prev)}
        >
          {showSellForm ? 'Cancel' : 'Sell Item'}
        </Button>
      </div>

      {showSellForm && (
        <div className="bg-card p-6 rounded-lg border border-border mb-8">
          <h2 className="text-xl font-bold mb-4 text-foreground">List an Item for Sale</h2>
          <form onSubmit={handleSellSubmit} className="space-y-4">
            <Input
              type="text"
              value={sellForm.name}
              onChange={(e) => handleSellFormChange('name', e.target.value)}
              placeholder="Item name"
              required
            />
            <textarea
              value={sellForm.description}
              onChange={(e) => handleSellFormChange('description', e.target.value)}
              placeholder="Item description"
              className="w-full border border-border rounded px-4 py-2 bg-muted text-foreground"
              rows={3}
            />
            <Input
              type="number"
              value={sellForm.price}
              onChange={(e) => handleSellFormChange('price', e.target.value)}
              placeholder="Price ($)"
              min="0"
              step="0.01"
              required
            />
            <Button type="submit" variant="primary" loading={selling} disabled={selling}>
              {selling ? 'Listing...' : 'List Item'}
            </Button>
          </form>
        </div>
      )}

      <div className="mb-8">
        <Input
          placeholder="Search for items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
              <div className="aspect-square bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-border rounded" />
                <div className="h-4 w-1/3 bg-border rounded" />
              </div>
              <div className="px-4 pb-4">
                <div className="h-3 w-full bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-muted text-center py-16">
          {searchQuery ? 'No items match your search' : 'No items available yet'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="group">
              <Link href={`/store/item/${product.id}`}>
                <Card className="overflow-hidden hover:border-primary transition-colors h-full">
                  <div className="aspect-square relative bg-muted">
                    {product.images?.[0] && (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="object-cover w-full h-full"
                      />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold truncate text-foreground">{product.name}</h3>
                    <p className="text-primary font-bold mt-1">
                      ${product.price.toFixed(2)}
                    </p>
                  </CardContent>
                  <CardFooter className="p-4 pt-0">
                    <p className="text-sm text-muted truncate">
                      {product.description}
                    </p>
                  </CardFooter>
                </Card>
              </Link>
              <Button
                variant="primary"
                size="sm"
                className="w-full mt-2"
                loading={purchasingId === product.id}
                disabled={purchasingId === product.id}
                onClick={() => handlePurchase(product.id, product.name)}
              >
                {purchasingId === product.id ? 'Purchasing...' : 'Buy Now'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
