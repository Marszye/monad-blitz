export interface EndpointDTO {
  id: string;
  path: string;
  priceMicro: string;
  callCount: string;
}

export interface FeedEntryDTO {
  key: string;
  path: string;
  payer: string;
  priceMicro: string;
  txHash: string;
  observedAt: number;
}

export interface StatsPayload {
  ok: boolean;
  fetchedAt: number;
  globalCalls: string;
  endpoints: EndpointDTO[];
  feed: FeedEntryDTO[];
  error?: string;
}
