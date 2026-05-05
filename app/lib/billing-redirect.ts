/**
 * Navigeert naar de Shopify billing confirmation URL.
 * Gebruikt App Bridge Redirect in embedded context, directe redirect als fallback.
 */
export async function redirectToBilling(confirmationUrl: string, host: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";

  // Probeer App Bridge Redirect (werkt in Shopify iframe)
  if (apiKey && host) {
    try {
      const { default: createApp } = await import("@shopify/app-bridge");
      const { Redirect } = await import("@shopify/app-bridge/actions");
      const app = createApp({ apiKey, host, forceRedirect: false });
      Redirect.create(app).dispatch(Redirect.Action.REMOTE, confirmationUrl);
      return;
    } catch {
      // App Bridge niet beschikbaar of niet in iframe — gebruik fallback
    }
  }

  // Fallback: directe redirect (werkt als full-page, niet in iframe)
  window.location.href = confirmationUrl;
}
