import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import polar from '@/lib/polar';

export interface Invoice {
  id: string;
  date: string; // ISO timestamp
  amount: number; // major currency units (e.g. dollars)
  currency: string;
  status: string;
  productName: string;
}

const MAX_INVOICES = 24;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const customers = await polar.customers.list({ email });
    const customer = customers.result.items?.[0];

    // No Polar customer yet means no invoices — a genuine empty state.
    if (!customer) {
      return NextResponse.json({ invoices: [] });
    }

    const orders = await polar.orders.list({
      customerId: customer.id,
      limit: MAX_INVOICES,
      sorting: ['-created_at'],
    });

    const invoices: Invoice[] = (orders.result.items ?? []).map((order) => ({
      id: order.id,
      date: order.createdAt.toISOString(),
      // Polar amounts are in minor units (cents); convert to major units.
      amount: order.amount / 100,
      currency: order.currency,
      status: order.status,
      productName: order.product?.name ?? 'Subscription',
    }));

    return NextResponse.json({ invoices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load invoices';
    console.error('Invoice fetch error:', message);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}
