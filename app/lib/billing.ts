export const PLAN = {
  name: "Fixora Pro",
  amount: 19.0,
  currencyCode: "EUR",
  interval: "EVERY_30_DAYS",
  trialDays: 14,
};

const API_VERSION = "2025-01";

async function shopifyGraphQL(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createAppSubscription(
  shop: string,
  accessToken: string,
  returnUrl: string
): Promise<{ confirmationUrl: string; subscriptionId: string }> {
  const isTest = process.env.SHOPIFY_BILLING_TEST === "true";

  const query = `
    mutation appSubscriptionCreate(
      $name: String!
      $returnUrl: URL!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $trialDays: Int
      $test: Boolean
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        trialDays: $trialDays
        test: $test
      ) {
        userErrors { field message }
        confirmationUrl
        appSubscription { id status }
      }
    }
  `;

  const variables = {
    name: PLAN.name,
    returnUrl,
    trialDays: PLAN.trialDays,
    test: isTest,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PLAN.amount, currencyCode: PLAN.currencyCode },
            interval: PLAN.interval,
          },
        },
      },
    ],
  };

  const json = await shopifyGraphQL(shop, accessToken, query, variables);
  const data = json.data?.appSubscriptionCreate;

  if (data?.userErrors?.length) {
    throw new Error(data.userErrors.map((e: any) => e.message).join(", "));
  }
  if (!data?.confirmationUrl) {
    throw new Error("Geen confirmationUrl ontvangen van Shopify Billing API");
  }

  return {
    confirmationUrl: data.confirmationUrl,
    subscriptionId: data.appSubscription.id,
  };
}

export async function getAppSubscription(
  shop: string,
  accessToken: string,
  subscriptionId: string
): Promise<{ status: string; trialDays: number | null; currentPeriodEnd: string | null }> {
  const query = `
    query getSubscription($id: ID!) {
      node(id: $id) {
        ... on AppSubscription {
          id
          status
          trialDays
          currentPeriodEnd
        }
      }
    }
  `;

  const json = await shopifyGraphQL(shop, accessToken, query, { id: subscriptionId });
  const node = json.data?.node;

  return {
    status: node?.status ?? "UNKNOWN",
    trialDays: node?.trialDays ?? null,
    currentPeriodEnd: node?.currentPeriodEnd ?? null,
  };
}

export function isSubscriptionActive(status: string | null): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "ACTIVE" || s === "TRIALING";
}
