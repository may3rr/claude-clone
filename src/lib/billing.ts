export const CNY_PER_USD = 2.5;

interface UsageResponse {
  object: string;
  total_usage: number;
}

interface SubscriptionResponse {
  object: string;
  has_payment_method: boolean;
  soft_limit_usd: number;
  hard_limit_usd: number;
  system_hard_limit_usd: number;
  access_until: number;
}

export interface BillingSummary {
  displayName: string;
  shortname: string;
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  spentCny: number;
  limitCny: number;
  remainingCny: number;
  refreshedAt: string;
}

export function usageToUsd(totalUsage: number): number {
  return totalUsage / 100;
}

export function usdToCny(usd: number): number {
  return usd * CNY_PER_USD;
}

export function buildBillingSummary(params: {
  displayName: string;
  shortname: string;
  usage: UsageResponse;
  subscription: SubscriptionResponse;
}): BillingSummary {
  const spentUsd = usageToUsd(params.usage.total_usage);
  const limitUsd = params.subscription.hard_limit_usd;
  const remainingUsd = Math.max(limitUsd - spentUsd, 0);

  return {
    displayName: params.displayName,
    shortname: params.shortname,
    spentUsd,
    limitUsd,
    remainingUsd,
    spentCny: usdToCny(spentUsd),
    limitCny: usdToCny(limitUsd),
    remainingCny: usdToCny(remainingUsd),
    refreshedAt: new Date().toISOString(),
  };
}
