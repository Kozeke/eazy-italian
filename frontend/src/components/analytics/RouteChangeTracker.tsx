/**
 * Tracks SPA route changes as GA4 pageviews inside react-router-dom.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../../utils/analytics';

/**
 * Renders nothing; sends a pageview whenever the router location changes.
 */
export default function RouteChangeTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}
