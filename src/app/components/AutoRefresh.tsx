'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Client component needed for the same reason PrintButton is: timer APIs
// only exist in the browser. Replaces a raw <meta http-equiv="refresh">
// tag (src/app/pharmacy/page.tsx originally) that turned out to leak
// across client-side navigations -- a later, explicitly reported bug: the
// browser's own refresh timer, once armed by that tag, wasn't reliably
// cancelled when React removed the tag on navigating away client-side
// before it fired, which was silently pulling pharmacists back to Pharmacy
// Queue from wherever else they'd since navigated to (Billing, Counter
// Sale, Inventory), up to `intervalSeconds` later. Reproduced directly:
// load /pharmacy, click to /billing, wait 30s, land back on Pharmacy Queue
// content with no user action.
//
// router.refresh() re-runs the current route's Server Component with
// fresh data, no full page reload -- the same effect the meta tag was
// going for. useEffect's cleanup function reliably clears the interval
// when this component actually unmounts (the pharmacist navigates away),
// unlike the meta tag's browser-scheduled timer.
export function AutoRefresh({ intervalSeconds }: { intervalSeconds: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [router, intervalSeconds]);

  return null;
}
