import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigDecimal: { input: string; output: string; }
  BigInt: { input: string; output: string; }
  Bytes: { input: string; output: string; }
  Int8: { input: string; output: string; }
  Timestamp: { input: string; output: string; }
};

export type Aggregation_Interval =
  | 'day'
  | 'hour';

export type Auction = {
  __typename?: 'Auction';
  auctionId: Scalars['BigInt']['output'];
  bidCount: Scalars['Int']['output'];
  bids: Array<BidPlaced>;
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  currentBid: Scalars['BigInt']['output'];
  endTime: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  eventTitle: Scalars['String']['output'];
  id: Scalars['String']['output'];
  predictionOutcome?: Maybe<Scalars['Int']['output']>;
  scoreChange?: Maybe<Scalars['Int']['output']>;
  seller: Seller;
  sellerId: Scalars['String']['output'];
  status: AuctionStatus;
  transactionHash: Scalars['Bytes']['output'];
};


export type AuctionBidsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<BidPlaced_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<BidPlaced_Filter>;
};

export type AuctionAdminExpired = {
  __typename?: 'AuctionAdminExpired';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type AuctionAdminExpired_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<AuctionAdminExpired_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<AuctionAdminExpired_Filter>>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type AuctionAdminExpired_OrderBy =
  | 'auctionId'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'transactionHash';

export type AuctionCancelled = {
  __typename?: 'AuctionCancelled';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  cancelledBidAmount: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  sellerId: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type AuctionCancelled_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<AuctionCancelled_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  cancelledBidAmount?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  cancelledBidAmount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_not?: InputMaybe<Scalars['BigInt']['input']>;
  cancelledBidAmount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<AuctionCancelled_Filter>>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type AuctionCancelled_OrderBy =
  | 'auctionId'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'cancelledBidAmount'
  | 'eventId'
  | 'id'
  | 'sellerId'
  | 'transactionHash';

export type AuctionClosed = {
  __typename?: 'AuctionClosed';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  sellerId: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
  winningBid: Scalars['BigInt']['output'];
};

export type AuctionClosed_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<AuctionClosed_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<AuctionClosed_Filter>>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  winningBid?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_gt?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_gte?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  winningBid_lt?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_lte?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_not?: InputMaybe<Scalars['BigInt']['input']>;
  winningBid_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type AuctionClosed_OrderBy =
  | 'auctionId'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'eventId'
  | 'id'
  | 'sellerId'
  | 'transactionHash'
  | 'winningBid';

export type AuctionCreated = {
  __typename?: 'AuctionCreated';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  endTime: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  eventTitle: Scalars['String']['output'];
  id: Scalars['Bytes']['output'];
  sellerId: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type AuctionCreated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<AuctionCreated_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  endTime?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  endTime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_not?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventTitle?: InputMaybe<Scalars['String']['input']>;
  eventTitle_contains?: InputMaybe<Scalars['String']['input']>;
  eventTitle_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_ends_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_gt?: InputMaybe<Scalars['String']['input']>;
  eventTitle_gte?: InputMaybe<Scalars['String']['input']>;
  eventTitle_in?: InputMaybe<Array<Scalars['String']['input']>>;
  eventTitle_lt?: InputMaybe<Scalars['String']['input']>;
  eventTitle_lte?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_contains?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  eventTitle_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_starts_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<AuctionCreated_Filter>>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type AuctionCreated_OrderBy =
  | 'auctionId'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'endTime'
  | 'eventId'
  | 'eventTitle'
  | 'id'
  | 'sellerId'
  | 'transactionHash';

export type AuctionStatus =
  | 'Cancelled'
  | 'Closed'
  | 'Open';

export type Auction_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Auction_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  bidCount?: InputMaybe<Scalars['Int']['input']>;
  bidCount_gt?: InputMaybe<Scalars['Int']['input']>;
  bidCount_gte?: InputMaybe<Scalars['Int']['input']>;
  bidCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  bidCount_lt?: InputMaybe<Scalars['Int']['input']>;
  bidCount_lte?: InputMaybe<Scalars['Int']['input']>;
  bidCount_not?: InputMaybe<Scalars['Int']['input']>;
  bidCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  bids_?: InputMaybe<BidPlaced_Filter>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  currentBid?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_gt?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_gte?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  currentBid_lt?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_lte?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_not?: InputMaybe<Scalars['BigInt']['input']>;
  currentBid_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  endTime?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  endTime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_not?: InputMaybe<Scalars['BigInt']['input']>;
  endTime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventTitle?: InputMaybe<Scalars['String']['input']>;
  eventTitle_contains?: InputMaybe<Scalars['String']['input']>;
  eventTitle_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_ends_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_gt?: InputMaybe<Scalars['String']['input']>;
  eventTitle_gte?: InputMaybe<Scalars['String']['input']>;
  eventTitle_in?: InputMaybe<Array<Scalars['String']['input']>>;
  eventTitle_lt?: InputMaybe<Scalars['String']['input']>;
  eventTitle_lte?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_contains?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  eventTitle_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  eventTitle_starts_with?: InputMaybe<Scalars['String']['input']>;
  eventTitle_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  id_ends_with?: InputMaybe<Scalars['String']['input']>;
  id_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  id_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  id_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  id_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_starts_with?: InputMaybe<Scalars['String']['input']>;
  id_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  or?: InputMaybe<Array<InputMaybe<Auction_Filter>>>;
  predictionOutcome?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_gt?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_gte?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  predictionOutcome_lt?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_lte?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_not?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  scoreChange?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_gt?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_gte?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  scoreChange_lt?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_lte?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_not?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  seller?: InputMaybe<Scalars['String']['input']>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_?: InputMaybe<Seller_Filter>;
  seller_contains?: InputMaybe<Scalars['String']['input']>;
  seller_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_ends_with?: InputMaybe<Scalars['String']['input']>;
  seller_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_gt?: InputMaybe<Scalars['String']['input']>;
  seller_gte?: InputMaybe<Scalars['String']['input']>;
  seller_in?: InputMaybe<Array<Scalars['String']['input']>>;
  seller_lt?: InputMaybe<Scalars['String']['input']>;
  seller_lte?: InputMaybe<Scalars['String']['input']>;
  seller_not?: InputMaybe<Scalars['String']['input']>;
  seller_not_contains?: InputMaybe<Scalars['String']['input']>;
  seller_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  seller_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  seller_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  seller_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  seller_starts_with?: InputMaybe<Scalars['String']['input']>;
  seller_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<AuctionStatus>;
  status_in?: InputMaybe<Array<AuctionStatus>>;
  status_not?: InputMaybe<AuctionStatus>;
  status_not_in?: InputMaybe<Array<AuctionStatus>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type Auction_OrderBy =
  | 'auctionId'
  | 'bidCount'
  | 'bids'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'currentBid'
  | 'endTime'
  | 'eventId'
  | 'eventTitle'
  | 'id'
  | 'predictionOutcome'
  | 'scoreChange'
  | 'seller'
  | 'sellerId'
  | 'seller__auctionsWithCorrectPredictionsCount'
  | 'seller__auctionsWithWrongPredictionsCount'
  | 'seller__blockNumber'
  | 'seller__blockTimestamp'
  | 'seller__id'
  | 'seller__openAuctionCount'
  | 'seller__reputationScore'
  | 'seller__sellerId'
  | 'seller__totalAuctionCount'
  | 'seller__totalEarnings'
  | 'seller__transactionHash'
  | 'seller__unscorableAuctionCount'
  | 'status'
  | 'transactionHash';

export type BidPlaced = {
  __typename?: 'BidPlaced';
  auction?: Maybe<Auction>;
  auctionId: Scalars['BigInt']['output'];
  bidAmount: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  previousBid: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type BidPlaced_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<BidPlaced_Filter>>>;
  auction?: InputMaybe<Scalars['String']['input']>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auction_?: InputMaybe<Auction_Filter>;
  auction_contains?: InputMaybe<Scalars['String']['input']>;
  auction_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  auction_ends_with?: InputMaybe<Scalars['String']['input']>;
  auction_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  auction_gt?: InputMaybe<Scalars['String']['input']>;
  auction_gte?: InputMaybe<Scalars['String']['input']>;
  auction_in?: InputMaybe<Array<Scalars['String']['input']>>;
  auction_lt?: InputMaybe<Scalars['String']['input']>;
  auction_lte?: InputMaybe<Scalars['String']['input']>;
  auction_not?: InputMaybe<Scalars['String']['input']>;
  auction_not_contains?: InputMaybe<Scalars['String']['input']>;
  auction_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  auction_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  auction_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  auction_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  auction_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  auction_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  auction_starts_with?: InputMaybe<Scalars['String']['input']>;
  auction_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  bidAmount?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  bidAmount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_not?: InputMaybe<Scalars['BigInt']['input']>;
  bidAmount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<BidPlaced_Filter>>>;
  previousBid?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_gt?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_gte?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  previousBid_lt?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_lte?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_not?: InputMaybe<Scalars['BigInt']['input']>;
  previousBid_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type BidPlaced_OrderBy =
  | 'auction'
  | 'auctionId'
  | 'auction__auctionId'
  | 'auction__bidCount'
  | 'auction__blockNumber'
  | 'auction__blockTimestamp'
  | 'auction__currentBid'
  | 'auction__endTime'
  | 'auction__eventId'
  | 'auction__eventTitle'
  | 'auction__id'
  | 'auction__predictionOutcome'
  | 'auction__scoreChange'
  | 'auction__sellerId'
  | 'auction__status'
  | 'auction__transactionHash'
  | 'bidAmount'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'previousBid'
  | 'transactionHash';

export type BlockChangedFilter = {
  number_gte: Scalars['Int']['input'];
};

export type Block_Height = {
  hash?: InputMaybe<Scalars['Bytes']['input']>;
  number?: InputMaybe<Scalars['Int']['input']>;
  number_gte?: InputMaybe<Scalars['Int']['input']>;
};

export type EventAdminClosed = {
  __typename?: 'EventAdminClosed';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type EventAdminClosed_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<EventAdminClosed_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<EventAdminClosed_Filter>>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type EventAdminClosed_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'eventId'
  | 'id'
  | 'transactionHash';

export type EventCreated = {
  __typename?: 'EventCreated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  creator: Scalars['Bytes']['output'];
  duration: Scalars['BigInt']['output'];
  eventClose: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  eventOpen: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  noToken: Scalars['Bytes']['output'];
  question: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
  yesToken: Scalars['Bytes']['output'];
};

export type EventCreated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<EventCreated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  creator?: InputMaybe<Scalars['Bytes']['input']>;
  creator_contains?: InputMaybe<Scalars['Bytes']['input']>;
  creator_gt?: InputMaybe<Scalars['Bytes']['input']>;
  creator_gte?: InputMaybe<Scalars['Bytes']['input']>;
  creator_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  creator_lt?: InputMaybe<Scalars['Bytes']['input']>;
  creator_lte?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  duration?: InputMaybe<Scalars['BigInt']['input']>;
  duration_gt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_gte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  duration_lt?: InputMaybe<Scalars['BigInt']['input']>;
  duration_lte?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not?: InputMaybe<Scalars['BigInt']['input']>;
  duration_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventClose?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventClose_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventClose_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventOpen?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventOpen_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventOpen_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  noToken?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_contains?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_gt?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_gte?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  noToken_lt?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_lte?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_not?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  noToken_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<EventCreated_Filter>>>;
  question?: InputMaybe<Scalars['String']['input']>;
  question_contains?: InputMaybe<Scalars['String']['input']>;
  question_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  question_ends_with?: InputMaybe<Scalars['String']['input']>;
  question_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_gt?: InputMaybe<Scalars['String']['input']>;
  question_gte?: InputMaybe<Scalars['String']['input']>;
  question_in?: InputMaybe<Array<Scalars['String']['input']>>;
  question_lt?: InputMaybe<Scalars['String']['input']>;
  question_lte?: InputMaybe<Scalars['String']['input']>;
  question_not?: InputMaybe<Scalars['String']['input']>;
  question_not_contains?: InputMaybe<Scalars['String']['input']>;
  question_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  question_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  question_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  question_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  question_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_starts_with?: InputMaybe<Scalars['String']['input']>;
  question_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  yesToken?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_contains?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_gt?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_gte?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  yesToken_lt?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_lte?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_not?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  yesToken_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type EventCreated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'creator'
  | 'duration'
  | 'eventClose'
  | 'eventId'
  | 'eventOpen'
  | 'id'
  | 'noToken'
  | 'question'
  | 'transactionHash'
  | 'yesToken';

export type ExpectedAuthorUpdated = {
  __typename?: 'ExpectedAuthorUpdated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newAuthor: Scalars['Bytes']['output'];
  previousAuthor: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ExpectedAuthorUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ExpectedAuthorUpdated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newAuthor?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newAuthor_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_not?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newAuthor_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<ExpectedAuthorUpdated_Filter>>>;
  previousAuthor?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousAuthor_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousAuthor_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type ExpectedAuthorUpdated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newAuthor'
  | 'previousAuthor'
  | 'transactionHash';

export type ExpectedWorkflowIdUpdated = {
  __typename?: 'ExpectedWorkflowIdUpdated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newId: Scalars['Bytes']['output'];
  previousId: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ExpectedWorkflowIdUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ExpectedWorkflowIdUpdated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newId?: InputMaybe<Scalars['Bytes']['input']>;
  newId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newId_not?: InputMaybe<Scalars['Bytes']['input']>;
  newId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<ExpectedWorkflowIdUpdated_Filter>>>;
  previousId?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type ExpectedWorkflowIdUpdated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newId'
  | 'previousId'
  | 'transactionHash';

export type ExpectedWorkflowNameUpdated = {
  __typename?: 'ExpectedWorkflowNameUpdated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newName: Scalars['Bytes']['output'];
  previousName: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ExpectedWorkflowNameUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ExpectedWorkflowNameUpdated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newName?: InputMaybe<Scalars['Bytes']['input']>;
  newName_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newName_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newName_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newName_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newName_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newName_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newName_not?: InputMaybe<Scalars['Bytes']['input']>;
  newName_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newName_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<ExpectedWorkflowNameUpdated_Filter>>>;
  previousName?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousName_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousName_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type ExpectedWorkflowNameUpdated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newName'
  | 'previousName'
  | 'transactionHash';

export type ExternalEventResolved = {
  __typename?: 'ExternalEventResolved';
  auctionsAffected: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  externalEventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  resultsApplied: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ExternalEventResolved_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ExternalEventResolved_Filter>>>;
  auctionsAffected?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionsAffected_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionsAffected_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalEventId?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalEventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  externalEventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<ExternalEventResolved_Filter>>>;
  resultsApplied?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_gt?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_gte?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  resultsApplied_lt?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_lte?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_not?: InputMaybe<Scalars['BigInt']['input']>;
  resultsApplied_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type ExternalEventResolved_OrderBy =
  | 'auctionsAffected'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'externalEventId'
  | 'id'
  | 'resultsApplied'
  | 'transactionHash';

export type ForwarderAddressUpdated = {
  __typename?: 'ForwarderAddressUpdated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newForwarder: Scalars['Bytes']['output'];
  previousForwarder: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ForwarderAddressUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ForwarderAddressUpdated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newForwarder?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newForwarder_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_not?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newForwarder_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<ForwarderAddressUpdated_Filter>>>;
  previousForwarder?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousForwarder_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousForwarder_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type ForwarderAddressUpdated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newForwarder'
  | 'previousForwarder'
  | 'transactionHash';

export type LiquidityWithdrawn = {
  __typename?: 'LiquidityWithdrawn';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  creator: Scalars['Bytes']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
  usdcOut: Scalars['BigInt']['output'];
};

export type LiquidityWithdrawn_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<LiquidityWithdrawn_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  creator?: InputMaybe<Scalars['Bytes']['input']>;
  creator_contains?: InputMaybe<Scalars['Bytes']['input']>;
  creator_gt?: InputMaybe<Scalars['Bytes']['input']>;
  creator_gte?: InputMaybe<Scalars['Bytes']['input']>;
  creator_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  creator_lt?: InputMaybe<Scalars['Bytes']['input']>;
  creator_lte?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  creator_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<LiquidityWithdrawn_Filter>>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  usdcOut?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_gt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_gte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  usdcOut_lt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_lte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_not?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type LiquidityWithdrawn_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'creator'
  | 'eventId'
  | 'id'
  | 'transactionHash'
  | 'usdcOut';

export type MarketplaceUpdated = {
  __typename?: 'MarketplaceUpdated';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newMarketplace: Scalars['Bytes']['output'];
  previousMarketplace: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type MarketplaceUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<MarketplaceUpdated_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newMarketplace?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newMarketplace_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_not?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newMarketplace_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<MarketplaceUpdated_Filter>>>;
  previousMarketplace?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousMarketplace_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousMarketplace_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type MarketplaceUpdated_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newMarketplace'
  | 'previousMarketplace'
  | 'transactionHash';

/** Defines the order direction, either ascending or descending */
export type OrderDirection =
  | 'asc'
  | 'desc';

export type OwnershipTransferred = {
  __typename?: 'OwnershipTransferred';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newOwner: Scalars['Bytes']['output'];
  previousOwner: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type OwnershipTransferred_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<OwnershipTransferred_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newOwner?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newOwner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_not?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newOwner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<OwnershipTransferred_Filter>>>;
  previousOwner?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousOwner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousOwner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type OwnershipTransferred_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newOwner'
  | 'previousOwner'
  | 'transactionHash';

export type Query = {
  __typename?: 'Query';
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  auction?: Maybe<Auction>;
  auctionAdminExpired?: Maybe<AuctionAdminExpired>;
  auctionAdminExpireds: Array<AuctionAdminExpired>;
  auctionCancelled?: Maybe<AuctionCancelled>;
  auctionCancelleds: Array<AuctionCancelled>;
  auctionClosed?: Maybe<AuctionClosed>;
  auctionCloseds: Array<AuctionClosed>;
  auctionCreated?: Maybe<AuctionCreated>;
  auctionCreateds: Array<AuctionCreated>;
  auctions: Array<Auction>;
  bidPlaced?: Maybe<BidPlaced>;
  bidPlaceds: Array<BidPlaced>;
  eventAdminClosed?: Maybe<EventAdminClosed>;
  eventAdminCloseds: Array<EventAdminClosed>;
  eventCreated?: Maybe<EventCreated>;
  eventCreateds: Array<EventCreated>;
  expectedAuthorUpdated?: Maybe<ExpectedAuthorUpdated>;
  expectedAuthorUpdateds: Array<ExpectedAuthorUpdated>;
  expectedWorkflowIdUpdated?: Maybe<ExpectedWorkflowIdUpdated>;
  expectedWorkflowIdUpdateds: Array<ExpectedWorkflowIdUpdated>;
  expectedWorkflowNameUpdated?: Maybe<ExpectedWorkflowNameUpdated>;
  expectedWorkflowNameUpdateds: Array<ExpectedWorkflowNameUpdated>;
  externalEventResolved?: Maybe<ExternalEventResolved>;
  externalEventResolveds: Array<ExternalEventResolved>;
  forwarderAddressUpdated?: Maybe<ForwarderAddressUpdated>;
  forwarderAddressUpdateds: Array<ForwarderAddressUpdated>;
  liquidityWithdrawn?: Maybe<LiquidityWithdrawn>;
  liquidityWithdrawns: Array<LiquidityWithdrawn>;
  marketplaceUpdated?: Maybe<MarketplaceUpdated>;
  marketplaceUpdateds: Array<MarketplaceUpdated>;
  ownershipTransferred?: Maybe<OwnershipTransferred>;
  ownershipTransferreds: Array<OwnershipTransferred>;
  securityWarning?: Maybe<SecurityWarning>;
  securityWarnings: Array<SecurityWarning>;
  seller?: Maybe<Seller>;
  sellerRegistered?: Maybe<SellerRegistered>;
  sellerRegistereds: Array<SellerRegistered>;
  sellerReputationScoreUpdated?: Maybe<SellerReputationScoreUpdated>;
  sellerReputationScoreUpdateds: Array<SellerReputationScoreUpdated>;
  sellers: Array<Seller>;
  settlementRequested?: Maybe<SettlementRequested>;
  settlementRequesteds: Array<SettlementRequested>;
  settlementResponse?: Maybe<SettlementResponse>;
  settlementResponses: Array<SettlementResponse>;
  sharesPurchased?: Maybe<SharesPurchased>;
  sharesPurchaseds: Array<SharesPurchased>;
  sharesRedeemed?: Maybe<SharesRedeemed>;
  sharesRedeemeds: Array<SharesRedeemed>;
};


export type Query_MetaArgs = {
  block?: InputMaybe<Block_Height>;
};


export type QueryAuctionArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionAdminExpiredArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionAdminExpiredsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AuctionAdminExpired_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<AuctionAdminExpired_Filter>;
};


export type QueryAuctionCancelledArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionCancelledsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AuctionCancelled_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<AuctionCancelled_Filter>;
};


export type QueryAuctionClosedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionClosedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AuctionClosed_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<AuctionClosed_Filter>;
};


export type QueryAuctionCreatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionCreatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AuctionCreated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<AuctionCreated_Filter>;
};


export type QueryAuctionsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Auction_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Auction_Filter>;
};


export type QueryBidPlacedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryBidPlacedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<BidPlaced_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<BidPlaced_Filter>;
};


export type QueryEventAdminClosedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryEventAdminClosedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<EventAdminClosed_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<EventAdminClosed_Filter>;
};


export type QueryEventCreatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryEventCreatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<EventCreated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<EventCreated_Filter>;
};


export type QueryExpectedAuthorUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryExpectedAuthorUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ExpectedAuthorUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ExpectedAuthorUpdated_Filter>;
};


export type QueryExpectedWorkflowIdUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryExpectedWorkflowIdUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ExpectedWorkflowIdUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ExpectedWorkflowIdUpdated_Filter>;
};


export type QueryExpectedWorkflowNameUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryExpectedWorkflowNameUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ExpectedWorkflowNameUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ExpectedWorkflowNameUpdated_Filter>;
};


export type QueryExternalEventResolvedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryExternalEventResolvedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ExternalEventResolved_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ExternalEventResolved_Filter>;
};


export type QueryForwarderAddressUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryForwarderAddressUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ForwarderAddressUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ForwarderAddressUpdated_Filter>;
};


export type QueryLiquidityWithdrawnArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryLiquidityWithdrawnsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<LiquidityWithdrawn_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<LiquidityWithdrawn_Filter>;
};


export type QueryMarketplaceUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryMarketplaceUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<MarketplaceUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<MarketplaceUpdated_Filter>;
};


export type QueryOwnershipTransferredArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryOwnershipTransferredsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<OwnershipTransferred_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<OwnershipTransferred_Filter>;
};


export type QuerySecurityWarningArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySecurityWarningsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SecurityWarning_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SecurityWarning_Filter>;
};


export type QuerySellerArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySellerRegisteredArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySellerRegisteredsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SellerRegistered_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SellerRegistered_Filter>;
};


export type QuerySellerReputationScoreUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySellerReputationScoreUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SellerReputationScoreUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SellerReputationScoreUpdated_Filter>;
};


export type QuerySellersArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Seller_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<Seller_Filter>;
};


export type QuerySettlementRequestedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySettlementRequestedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SettlementRequested_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SettlementRequested_Filter>;
};


export type QuerySettlementResponseArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySettlementResponsesArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SettlementResponse_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SettlementResponse_Filter>;
};


export type QuerySharesPurchasedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySharesPurchasedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SharesPurchased_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SharesPurchased_Filter>;
};


export type QuerySharesRedeemedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerySharesRedeemedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SharesRedeemed_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<SharesRedeemed_Filter>;
};

export type SecurityWarning = {
  __typename?: 'SecurityWarning';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  message: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type SecurityWarning_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SecurityWarning_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  message?: InputMaybe<Scalars['String']['input']>;
  message_contains?: InputMaybe<Scalars['String']['input']>;
  message_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  message_ends_with?: InputMaybe<Scalars['String']['input']>;
  message_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  message_gt?: InputMaybe<Scalars['String']['input']>;
  message_gte?: InputMaybe<Scalars['String']['input']>;
  message_in?: InputMaybe<Array<Scalars['String']['input']>>;
  message_lt?: InputMaybe<Scalars['String']['input']>;
  message_lte?: InputMaybe<Scalars['String']['input']>;
  message_not?: InputMaybe<Scalars['String']['input']>;
  message_not_contains?: InputMaybe<Scalars['String']['input']>;
  message_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  message_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  message_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  message_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  message_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  message_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  message_starts_with?: InputMaybe<Scalars['String']['input']>;
  message_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  or?: InputMaybe<Array<InputMaybe<SecurityWarning_Filter>>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type SecurityWarning_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'message'
  | 'transactionHash';

export type Seller = {
  __typename?: 'Seller';
  auctions: Array<Auction>;
  auctionsWithCorrectPredictionsCount: Scalars['Int']['output'];
  auctionsWithWrongPredictionsCount: Scalars['Int']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  openAuctionCount: Scalars['Int']['output'];
  reputationScore: Scalars['BigInt']['output'];
  sellerId: Scalars['String']['output'];
  totalAuctionCount: Scalars['Int']['output'];
  totalEarnings: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
  unscorableAuctionCount: Scalars['Int']['output'];
};


export type SellerAuctionsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Auction_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Auction_Filter>;
};

export type SellerRegistered = {
  __typename?: 'SellerRegistered';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  sellerId: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type SellerRegistered_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SellerRegistered_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SellerRegistered_Filter>>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type SellerRegistered_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'sellerId'
  | 'transactionHash';

export type SellerReputationScoreUpdated = {
  __typename?: 'SellerReputationScoreUpdated';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  newScore: Scalars['BigInt']['output'];
  predictionOutcome: Scalars['Int']['output'];
  scoreChange: Scalars['Int']['output'];
  sellerId: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type SellerReputationScoreUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SellerReputationScoreUpdated_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  newScore?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_gt?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_gte?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  newScore_lt?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_lte?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_not?: InputMaybe<Scalars['BigInt']['input']>;
  newScore_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SellerReputationScoreUpdated_Filter>>>;
  predictionOutcome?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_gt?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_gte?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  predictionOutcome_lt?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_lte?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_not?: InputMaybe<Scalars['Int']['input']>;
  predictionOutcome_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  scoreChange?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_gt?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_gte?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  scoreChange_lt?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_lte?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_not?: InputMaybe<Scalars['Int']['input']>;
  scoreChange_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type SellerReputationScoreUpdated_OrderBy =
  | 'auctionId'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'newScore'
  | 'predictionOutcome'
  | 'scoreChange'
  | 'sellerId'
  | 'transactionHash';

export type Seller_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Seller_Filter>>>;
  auctionsWithCorrectPredictionsCount?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_gt?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_gte?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  auctionsWithCorrectPredictionsCount_lt?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_lte?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_not?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithCorrectPredictionsCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  auctionsWithWrongPredictionsCount?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_gt?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_gte?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  auctionsWithWrongPredictionsCount_lt?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_lte?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_not?: InputMaybe<Scalars['Int']['input']>;
  auctionsWithWrongPredictionsCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  auctions_?: InputMaybe<Auction_Filter>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  id_ends_with?: InputMaybe<Scalars['String']['input']>;
  id_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  id_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  id_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  id_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  id_starts_with?: InputMaybe<Scalars['String']['input']>;
  id_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  openAuctionCount?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_gt?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_gte?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  openAuctionCount_lt?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_lte?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_not?: InputMaybe<Scalars['Int']['input']>;
  openAuctionCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  or?: InputMaybe<Array<InputMaybe<Seller_Filter>>>;
  reputationScore?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reputationScore_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_not?: InputMaybe<Scalars['BigInt']['input']>;
  reputationScore_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  sellerId?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_gt?: InputMaybe<Scalars['String']['input']>;
  sellerId_gte?: InputMaybe<Scalars['String']['input']>;
  sellerId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_lt?: InputMaybe<Scalars['String']['input']>;
  sellerId_lte?: InputMaybe<Scalars['String']['input']>;
  sellerId_not?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sellerId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with?: InputMaybe<Scalars['String']['input']>;
  sellerId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  totalAuctionCount?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_gt?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_gte?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  totalAuctionCount_lt?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_lte?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_not?: InputMaybe<Scalars['Int']['input']>;
  totalAuctionCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  totalEarnings?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_gt?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_gte?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  totalEarnings_lt?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_lte?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_not?: InputMaybe<Scalars['BigInt']['input']>;
  totalEarnings_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  unscorableAuctionCount?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_gt?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_gte?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  unscorableAuctionCount_lt?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_lte?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_not?: InputMaybe<Scalars['Int']['input']>;
  unscorableAuctionCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type Seller_OrderBy =
  | 'auctions'
  | 'auctionsWithCorrectPredictionsCount'
  | 'auctionsWithWrongPredictionsCount'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'id'
  | 'openAuctionCount'
  | 'reputationScore'
  | 'sellerId'
  | 'totalAuctionCount'
  | 'totalEarnings'
  | 'transactionHash'
  | 'unscorableAuctionCount';

export type SettlementRequested = {
  __typename?: 'SettlementRequested';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  question: Scalars['String']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type SettlementRequested_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SettlementRequested_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SettlementRequested_Filter>>>;
  question?: InputMaybe<Scalars['String']['input']>;
  question_contains?: InputMaybe<Scalars['String']['input']>;
  question_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  question_ends_with?: InputMaybe<Scalars['String']['input']>;
  question_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_gt?: InputMaybe<Scalars['String']['input']>;
  question_gte?: InputMaybe<Scalars['String']['input']>;
  question_in?: InputMaybe<Array<Scalars['String']['input']>>;
  question_lt?: InputMaybe<Scalars['String']['input']>;
  question_lte?: InputMaybe<Scalars['String']['input']>;
  question_not?: InputMaybe<Scalars['String']['input']>;
  question_not_contains?: InputMaybe<Scalars['String']['input']>;
  question_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  question_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  question_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  question_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  question_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  question_starts_with?: InputMaybe<Scalars['String']['input']>;
  question_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type SettlementRequested_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'eventId'
  | 'id'
  | 'question'
  | 'transactionHash';

export type SettlementResponse = {
  __typename?: 'SettlementResponse';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  outcome: Scalars['Int']['output'];
  status: Scalars['Int']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type SettlementResponse_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SettlementResponse_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SettlementResponse_Filter>>>;
  outcome?: InputMaybe<Scalars['Int']['input']>;
  outcome_gt?: InputMaybe<Scalars['Int']['input']>;
  outcome_gte?: InputMaybe<Scalars['Int']['input']>;
  outcome_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  outcome_lt?: InputMaybe<Scalars['Int']['input']>;
  outcome_lte?: InputMaybe<Scalars['Int']['input']>;
  outcome_not?: InputMaybe<Scalars['Int']['input']>;
  outcome_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  status?: InputMaybe<Scalars['Int']['input']>;
  status_gt?: InputMaybe<Scalars['Int']['input']>;
  status_gte?: InputMaybe<Scalars['Int']['input']>;
  status_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  status_lt?: InputMaybe<Scalars['Int']['input']>;
  status_lte?: InputMaybe<Scalars['Int']['input']>;
  status_not?: InputMaybe<Scalars['Int']['input']>;
  status_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
};

export type SettlementResponse_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'eventId'
  | 'id'
  | 'outcome'
  | 'status'
  | 'transactionHash';

export type SharesPurchased = {
  __typename?: 'SharesPurchased';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  buyer: Scalars['Bytes']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  outcome: Scalars['Int']['output'];
  sharesOut: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
  usdcIn: Scalars['BigInt']['output'];
};

export type SharesPurchased_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SharesPurchased_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  buyer?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_contains?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_gt?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_gte?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  buyer_lt?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_lte?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_not?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SharesPurchased_Filter>>>;
  outcome?: InputMaybe<Scalars['Int']['input']>;
  outcome_gt?: InputMaybe<Scalars['Int']['input']>;
  outcome_gte?: InputMaybe<Scalars['Int']['input']>;
  outcome_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  outcome_lt?: InputMaybe<Scalars['Int']['input']>;
  outcome_lte?: InputMaybe<Scalars['Int']['input']>;
  outcome_not?: InputMaybe<Scalars['Int']['input']>;
  outcome_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  sharesOut?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_gt?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_gte?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  sharesOut_lt?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_lte?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_not?: InputMaybe<Scalars['BigInt']['input']>;
  sharesOut_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  usdcIn?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  usdcIn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_not?: InputMaybe<Scalars['BigInt']['input']>;
  usdcIn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type SharesPurchased_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'buyer'
  | 'eventId'
  | 'id'
  | 'outcome'
  | 'sharesOut'
  | 'transactionHash'
  | 'usdcIn';

export type SharesRedeemed = {
  __typename?: 'SharesRedeemed';
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  eventId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  redeemer: Scalars['Bytes']['output'];
  sharesIn: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
  usdcOut: Scalars['BigInt']['output'];
};

export type SharesRedeemed_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SharesRedeemed_Filter>>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  eventId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not?: InputMaybe<Scalars['BigInt']['input']>;
  eventId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  or?: InputMaybe<Array<InputMaybe<SharesRedeemed_Filter>>>;
  redeemer?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_contains?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_gt?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_gte?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  redeemer_lt?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_lte?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_not?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  redeemer_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  sharesIn?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  sharesIn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_not?: InputMaybe<Scalars['BigInt']['input']>;
  sharesIn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  usdcOut?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_gt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_gte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  usdcOut_lt?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_lte?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_not?: InputMaybe<Scalars['BigInt']['input']>;
  usdcOut_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type SharesRedeemed_OrderBy =
  | 'blockNumber'
  | 'blockTimestamp'
  | 'eventId'
  | 'id'
  | 'redeemer'
  | 'sharesIn'
  | 'transactionHash'
  | 'usdcOut';

export type _Block_ = {
  __typename?: '_Block_';
  /** The hash of the block */
  hash?: Maybe<Scalars['Bytes']['output']>;
  /** The block number */
  number: Scalars['Int']['output'];
  /** The hash of the parent block */
  parentHash?: Maybe<Scalars['Bytes']['output']>;
  /** Integer representation of the timestamp stored in blocks for the chain */
  timestamp?: Maybe<Scalars['Int']['output']>;
};

/** The type for the top-level _meta field */
export type _Meta_ = {
  __typename?: '_Meta_';
  /**
   * Information about a specific subgraph block. The hash of the block
   * will be null if the _meta field has a block constraint that asks for
   * a block number. It will be filled if the _meta field has no block constraint
   * and therefore asks for the latest  block
   */
  block: _Block_;
  /** The deployment ID */
  deployment: Scalars['String']['output'];
  /** If `true`, the subgraph encountered indexing errors at some past block */
  hasIndexingErrors: Scalars['Boolean']['output'];
};

export type _SubgraphErrorPolicy_ =
  /** Data will be returned even if the subgraph has indexing errors */
  | 'allow'
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  | 'deny';

export type PredictionEventsQueryVariables = Exact<{
  limit: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type PredictionEventsQuery = { __typename?: 'Query', eventCreateds: Array<{ __typename?: 'EventCreated', id: string, eventId: string, creator: string, question: string, eventOpen: string, eventClose: string, duration: string, yesToken: string, noToken: string, blockTimestamp: string, transactionHash: string }>, settlementResponses: Array<{ __typename?: 'SettlementResponse', eventId: string, status: number, outcome: number, blockTimestamp: string, transactionHash: string }>, settlementRequesteds: Array<{ __typename?: 'SettlementRequested', eventId: string, blockTimestamp: string, transactionHash: string }>, sharesPurchaseds: Array<{ __typename?: 'SharesPurchased', eventId: string, buyer: string, outcome: number, usdcIn: string, sharesOut: string, blockTimestamp: string, transactionHash: string }> };

export type EventDetailQueryVariables = Exact<{
  eventId: Scalars['BigInt']['input'];
}>;


export type EventDetailQuery = { __typename?: 'Query', eventCreateds: Array<{ __typename?: 'EventCreated', id: string, eventId: string, creator: string, question: string, eventOpen: string, eventClose: string, duration: string, yesToken: string, noToken: string, blockTimestamp: string, transactionHash: string }>, settlementResponses: Array<{ __typename?: 'SettlementResponse', eventId: string, status: number, outcome: number, blockTimestamp: string, transactionHash: string }>, settlementRequesteds: Array<{ __typename?: 'SettlementRequested', eventId: string, question: string, blockTimestamp: string, transactionHash: string }>, sharesPurchaseds: Array<{ __typename?: 'SharesPurchased', id: string, eventId: string, buyer: string, outcome: number, usdcIn: string, sharesOut: string, blockTimestamp: string, transactionHash: string }>, sharesRedeemeds: Array<{ __typename?: 'SharesRedeemed', id: string, eventId: string, redeemer: string, sharesIn: string, usdcOut: string, blockTimestamp: string, transactionHash: string }> };


export const PredictionEventsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PredictionEvents"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"skip"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventCreateds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"skip"},"value":{"kind":"Variable","name":{"kind":"Name","value":"skip"}}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"creator"}},{"kind":"Field","name":{"kind":"Name","value":"question"}},{"kind":"Field","name":{"kind":"Name","value":"eventOpen"}},{"kind":"Field","name":{"kind":"Name","value":"eventClose"}},{"kind":"Field","name":{"kind":"Name","value":"duration"}},{"kind":"Field","name":{"kind":"Name","value":"yesToken"}},{"kind":"Field","name":{"kind":"Name","value":"noToken"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"settlementResponses"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"settlementRequesteds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"sharesPurchaseds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1000"}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"buyer"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"usdcIn"}},{"kind":"Field","name":{"kind":"Name","value":"sharesOut"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}}]}}]} as unknown as DocumentNode<PredictionEventsQuery, PredictionEventsQueryVariables>;
export const EventDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EventDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventCreateds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"creator"}},{"kind":"Field","name":{"kind":"Name","value":"question"}},{"kind":"Field","name":{"kind":"Name","value":"eventOpen"}},{"kind":"Field","name":{"kind":"Name","value":"eventClose"}},{"kind":"Field","name":{"kind":"Name","value":"duration"}},{"kind":"Field","name":{"kind":"Name","value":"yesToken"}},{"kind":"Field","name":{"kind":"Name","value":"noToken"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"settlementResponses"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"settlementRequesteds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"1"}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"question"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"sharesPurchaseds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"100"}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"buyer"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"usdcIn"}},{"kind":"Field","name":{"kind":"Name","value":"sharesOut"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"sharesRedeemeds"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"IntValue","value":"100"}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"eventId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"eventId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"blockTimestamp"}},{"kind":"Argument","name":{"kind":"Name","value":"orderDirection"},"value":{"kind":"EnumValue","value":"desc"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"redeemer"}},{"kind":"Field","name":{"kind":"Name","value":"sharesIn"}},{"kind":"Field","name":{"kind":"Name","value":"usdcOut"}},{"kind":"Field","name":{"kind":"Name","value":"blockTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"transactionHash"}}]}}]}}]} as unknown as DocumentNode<EventDetailQuery, EventDetailQueryVariables>;