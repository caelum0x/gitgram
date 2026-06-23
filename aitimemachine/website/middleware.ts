import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/cli-auth',
  '/docs(.*)',
  '/pricing',
  '/blog(.*)',
  '/products(.*)',
  '/security',
  '/privacy',
  '/terms',
  '/api/webhooks(.*)',
  '/api/billing/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
