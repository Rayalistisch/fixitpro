"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function AppBridgeInit() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const host = searchParams.get("host");
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

    if (!host || !apiKey) return;

    import("@shopify/app-bridge").then(({ createApp }) => {
      createApp({ apiKey, host, forceRedirect: false });
    });
  }, [searchParams]);

  return null;
}
