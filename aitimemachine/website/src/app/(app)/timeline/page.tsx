import { redirect } from 'next/navigation';

/**
 * The legacy standalone timeline (which talked to a non-existent local
 * socket.io API) has been superseded by the authenticated dashboard timeline,
 * which uses the real /api proxy contract. Redirect to it so the route stays
 * reachable and consistent.
 */
export default function TimelineRedirectPage() {
  redirect('/dashboard/timeline');
}
