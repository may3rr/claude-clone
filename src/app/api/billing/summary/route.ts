import { getApiKeyForUser } from '@/lib/auth';
import { buildBillingSummary } from '@/lib/billing';
import { getUserFromRequest } from '@/lib/jwt';

function getDashboardBaseUrl() {
  const configuredApiUrl = process.env.GPT_GE_API_URL;

  if (!configuredApiUrl) {
    return 'https://api.gpt.ge';
  }

  return new URL(configuredApiUrl).origin;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // Prefer JWT auth, fall back to query param
    const jwtUser = await getUserFromRequest(req);
    const userShortname = jwtUser?.shortname ?? searchParams.get('user')?.trim().toLowerCase();

    if (!userShortname) {
      return Response.json({ error: 'Missing user' }, { status: 400 });
    }

    const displayName = jwtUser?.displayName ?? userShortname;

    const apiKey = getApiKeyForUser(userShortname);
    if (!apiKey) {
      return Response.json({ error: 'API key not found' }, { status: 500 });
    }

    const baseUrl = getDashboardBaseUrl();
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };

    const [usageResponse, subscriptionResponse] = await Promise.all([
      fetch(`${baseUrl}/v1/dashboard/billing/usage`, {
        headers,
        cache: 'no-store',
      }),
      fetch(`${baseUrl}/v1/dashboard/billing/subscription`, {
        headers,
        cache: 'no-store',
      }),
    ]);

    if (!usageResponse.ok || !subscriptionResponse.ok) {
      const [usageErrorText, subscriptionErrorText] = await Promise.all([
        usageResponse.ok ? Promise.resolve('') : usageResponse.text(),
        subscriptionResponse.ok
          ? Promise.resolve('')
          : subscriptionResponse.text(),
      ]);

      return Response.json(
        {
          error: 'Billing API error',
          usageStatus: usageResponse.status,
          usageError: usageErrorText,
          subscriptionStatus: subscriptionResponse.status,
          subscriptionError: subscriptionErrorText,
        },
        { status: 502 }
      );
    }

    const [usage, subscription] = await Promise.all([
      usageResponse.json(),
      subscriptionResponse.json(),
    ]);

    return Response.json(
      buildBillingSummary({
        displayName,
        shortname: userShortname,
        usage,
        subscription,
      })
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
