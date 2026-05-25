export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trial', 'trialing'] as const;
export type ActiveSubscriptionStatus = typeof ACTIVE_SUBSCRIPTION_STATUSES[number];
