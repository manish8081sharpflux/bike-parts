"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`/DOM at import time, so it can never run during
// SSR — loaded client-only, with a plain skeleton shown until it mounts.
export const DeliveryMap = dynamic(() => import("@/components/DeliveryMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-zinc-200" />,
});

export default DeliveryMap;
