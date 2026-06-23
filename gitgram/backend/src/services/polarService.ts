import { Polar } from '@polar-sh/sdk';

const polarConfig = {
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  ...(process.env.POLAR_SERVER_URL
    ? { serverURL: process.env.POLAR_SERVER_URL }
    : { server: (process.env.POLAR_MODE as 'sandbox' | 'production') || 'sandbox' }),
};

const polar = process.env.POLAR_ACCESS_TOKEN
  ? new Polar(polarConfig)
  : null;

export const createCheckoutSession = async (
  productId: string,
  customerEmail: string,
  userId: string,
  successUrl: string,
) => {
  if (!polar) throw new Error('Polar not configured');
  const result = await polar.checkouts.create({
    products: [productId],
    customerEmail,
    successUrl,
    metadata: { userId },
  });
  return result;
};

export const getSubscription = async (subscriptionId: string) => {
  if (!polar) throw new Error('Polar not configured');
  return await polar.subscriptions.get({ id: subscriptionId });
};

export const cancelSubscription = async (subscriptionId: string) => {
  if (!polar) throw new Error('Polar not configured');
  return await polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: { cancelAtPeriodEnd: true },
  });
};

export { polar };
export default polar;
