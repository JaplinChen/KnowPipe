export interface Subscription {
  username: string;
  platform: 'threads';
  addedAt: string;
  lastCheckedAt?: string;
  lastPostUrl?: string;
}

export interface SubscriptionStore {
  version: 1;
  checkIntervalHours: number;
  subscriptions: Subscription[];
}
