import type { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
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

export enum Aggregation_Interval {
  Day = 'day',
  Hour = 'hour'
}

export type AuctionClosed = {
  __typename?: 'AuctionClosed';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  buyer: Scalars['Bytes']['output'];
  externalMarketId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  seller: Scalars['Bytes']['output'];
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
  externalMarketId?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalMarketId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  seller?: InputMaybe<Scalars['Bytes']['input']>;
  seller_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  seller_lt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_lte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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

export enum AuctionClosed_OrderBy {
  AuctionId = 'auctionId',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Buyer = 'buyer',
  ExternalMarketId = 'externalMarketId',
  Id = 'id',
  Seller = 'seller',
  TransactionHash = 'transactionHash',
  WinningBid = 'winningBid'
}

export type AuctionCreated = {
  __typename?: 'AuctionCreated';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  endTime: Scalars['BigInt']['output'];
  externalMarketId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  reservePrice: Scalars['BigInt']['output'];
  seller: Scalars['Bytes']['output'];
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
  externalMarketId?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalMarketId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  reservePrice?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reservePrice_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_not?: InputMaybe<Scalars['BigInt']['input']>;
  reservePrice_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  seller?: InputMaybe<Scalars['Bytes']['input']>;
  seller_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  seller_lt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_lte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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

export enum AuctionCreated_OrderBy {
  AuctionId = 'auctionId',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  EndTime = 'endTime',
  ExternalMarketId = 'externalMarketId',
  Id = 'id',
  ReservePrice = 'reservePrice',
  Seller = 'seller',
  TransactionHash = 'transactionHash'
}

export type AuctionForceClosed = {
  __typename?: 'AuctionForceClosed';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  externalMarketId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  refundAmount: Scalars['BigInt']['output'];
  refundedBidder: Scalars['Bytes']['output'];
  reputationDelta: Scalars['Int']['output'];
  seller: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type AuctionForceClosed_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<AuctionForceClosed_Filter>>>;
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
  externalMarketId?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalMarketId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  or?: InputMaybe<Array<InputMaybe<AuctionForceClosed_Filter>>>;
  refundAmount?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  refundAmount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_not?: InputMaybe<Scalars['BigInt']['input']>;
  refundAmount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  refundedBidder?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_contains?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_gt?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_gte?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  refundedBidder_lt?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_lte?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_not?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  refundedBidder_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  reputationDelta?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_gt?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_gte?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  reputationDelta_lt?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_lte?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_not?: InputMaybe<Scalars['Int']['input']>;
  reputationDelta_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  seller?: InputMaybe<Scalars['Bytes']['input']>;
  seller_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  seller_lt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_lte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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

export enum AuctionForceClosed_OrderBy {
  AuctionId = 'auctionId',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  ExternalMarketId = 'externalMarketId',
  Id = 'id',
  RefundAmount = 'refundAmount',
  RefundedBidder = 'refundedBidder',
  ReputationDelta = 'reputationDelta',
  Seller = 'seller',
  TransactionHash = 'transactionHash'
}

export type BidPlaced = {
  __typename?: 'BidPlaced';
  amount: Scalars['BigInt']['output'];
  auctionId: Scalars['BigInt']['output'];
  bidder: Scalars['Bytes']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  previousBid: Scalars['BigInt']['output'];
  previousBidder: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type BidPlaced_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  and?: InputMaybe<Array<InputMaybe<BidPlaced_Filter>>>;
  auctionId?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  auctionId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not?: InputMaybe<Scalars['BigInt']['input']>;
  auctionId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  bidder?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_contains?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_gt?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_gte?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  bidder_lt?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_lte?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_not?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  bidder_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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
  previousBidder?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_gt?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_gte?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  previousBidder_lt?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_lte?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_not?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  previousBidder_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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

export enum BidPlaced_OrderBy {
  Amount = 'amount',
  AuctionId = 'auctionId',
  Bidder = 'bidder',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  PreviousBid = 'previousBid',
  PreviousBidder = 'previousBidder',
  TransactionHash = 'transactionHash'
}

export type BlockChangedFilter = {
  number_gte: Scalars['Int']['input'];
};

export type Block_Height = {
  hash?: InputMaybe<Scalars['Bytes']['input']>;
  number?: InputMaybe<Scalars['Int']['input']>;
  number_gte?: InputMaybe<Scalars['Int']['input']>;
};

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

export enum ExpectedAuthorUpdated_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  NewAuthor = 'newAuthor',
  PreviousAuthor = 'previousAuthor',
  TransactionHash = 'transactionHash'
}

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

export enum ExpectedWorkflowIdUpdated_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  NewId = 'newId',
  PreviousId = 'previousId',
  TransactionHash = 'transactionHash'
}

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

export enum ExpectedWorkflowNameUpdated_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  NewName = 'newName',
  PreviousName = 'previousName',
  TransactionHash = 'transactionHash'
}

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

export enum ForwarderAddressUpdated_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  NewForwarder = 'newForwarder',
  PreviousForwarder = 'previousForwarder',
  TransactionHash = 'transactionHash'
}

/** Defines the order direction, either ascending or descending */
export enum OrderDirection {
  Asc = 'asc',
  Desc = 'desc'
}

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

export enum OwnershipTransferred_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  NewOwner = 'newOwner',
  PreviousOwner = 'previousOwner',
  TransactionHash = 'transactionHash'
}

export type Query = {
  __typename?: 'Query';
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
  auctionClosed?: Maybe<AuctionClosed>;
  auctionCloseds: Array<AuctionClosed>;
  auctionCreated?: Maybe<AuctionCreated>;
  auctionCreateds: Array<AuctionCreated>;
  auctionForceClosed?: Maybe<AuctionForceClosed>;
  auctionForceCloseds: Array<AuctionForceClosed>;
  bidPlaced?: Maybe<BidPlaced>;
  bidPlaceds: Array<BidPlaced>;
  expectedAuthorUpdated?: Maybe<ExpectedAuthorUpdated>;
  expectedAuthorUpdateds: Array<ExpectedAuthorUpdated>;
  expectedWorkflowIdUpdated?: Maybe<ExpectedWorkflowIdUpdated>;
  expectedWorkflowIdUpdateds: Array<ExpectedWorkflowIdUpdated>;
  expectedWorkflowNameUpdated?: Maybe<ExpectedWorkflowNameUpdated>;
  expectedWorkflowNameUpdateds: Array<ExpectedWorkflowNameUpdated>;
  forwarderAddressUpdated?: Maybe<ForwarderAddressUpdated>;
  forwarderAddressUpdateds: Array<ForwarderAddressUpdated>;
  ownershipTransferred?: Maybe<OwnershipTransferred>;
  ownershipTransferreds: Array<OwnershipTransferred>;
  reputationUpdated?: Maybe<ReputationUpdated>;
  reputationUpdateds: Array<ReputationUpdated>;
  securityWarning?: Maybe<SecurityWarning>;
  securityWarnings: Array<SecurityWarning>;
  tradeExecuted?: Maybe<TradeExecuted>;
  tradeExecuteds: Array<TradeExecuted>;
};


export type Query_MetaArgs = {
  block?: InputMaybe<Block_Height>;
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


export type QueryAuctionForceClosedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryAuctionForceClosedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<AuctionForceClosed_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<AuctionForceClosed_Filter>;
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


export type QueryReputationUpdatedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryReputationUpdatedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ReputationUpdated_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<ReputationUpdated_Filter>;
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


export type QueryTradeExecutedArgs = {
  block?: InputMaybe<Block_Height>;
  id: Scalars['ID']['input'];
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryTradeExecutedsArgs = {
  block?: InputMaybe<Block_Height>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<TradeExecuted_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  subgraphError?: _SubgraphErrorPolicy_;
  where?: InputMaybe<TradeExecuted_Filter>;
};

export type ReputationUpdated = {
  __typename?: 'ReputationUpdated';
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  delta: Scalars['Int']['output'];
  id: Scalars['Bytes']['output'];
  newScore: Scalars['BigInt']['output'];
  seller: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ReputationUpdated_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ReputationUpdated_Filter>>>;
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
  delta?: InputMaybe<Scalars['Int']['input']>;
  delta_gt?: InputMaybe<Scalars['Int']['input']>;
  delta_gte?: InputMaybe<Scalars['Int']['input']>;
  delta_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  delta_lt?: InputMaybe<Scalars['Int']['input']>;
  delta_lte?: InputMaybe<Scalars['Int']['input']>;
  delta_not?: InputMaybe<Scalars['Int']['input']>;
  delta_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
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
  or?: InputMaybe<Array<InputMaybe<ReputationUpdated_Filter>>>;
  seller?: InputMaybe<Scalars['Bytes']['input']>;
  seller_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_gte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  seller_lt?: InputMaybe<Scalars['Bytes']['input']>;
  seller_lte?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  seller_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
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

export enum ReputationUpdated_OrderBy {
  AuctionId = 'auctionId',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Delta = 'delta',
  Id = 'id',
  NewScore = 'newScore',
  Seller = 'seller',
  TransactionHash = 'transactionHash'
}

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

export enum SecurityWarning_OrderBy {
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Id = 'id',
  Message = 'message',
  TransactionHash = 'transactionHash'
}

export type TradeExecuted = {
  __typename?: 'TradeExecuted';
  amount: Scalars['BigInt']['output'];
  auctionId: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  buyer: Scalars['Bytes']['output'];
  externalMarketId: Scalars['BigInt']['output'];
  id: Scalars['Bytes']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type TradeExecuted_Filter = {
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  amount?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  and?: InputMaybe<Array<InputMaybe<TradeExecuted_Filter>>>;
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
  externalMarketId?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  externalMarketId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not?: InputMaybe<Scalars['BigInt']['input']>;
  externalMarketId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  or?: InputMaybe<Array<InputMaybe<TradeExecuted_Filter>>>;
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

export enum TradeExecuted_OrderBy {
  Amount = 'amount',
  AuctionId = 'auctionId',
  BlockNumber = 'blockNumber',
  BlockTimestamp = 'blockTimestamp',
  Buyer = 'buyer',
  ExternalMarketId = 'externalMarketId',
  Id = 'id',
  TransactionHash = 'transactionHash'
}

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

export enum _SubgraphErrorPolicy_ {
  /** Data will be returned even if the subgraph has indexing errors */
  Allow = 'allow',
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  Deny = 'deny'
}

export type AuctionDetailSubgraphQueryVariables = Exact<{
  auctionId: Scalars['BigInt']['input'];
  bidLimit: Scalars['Int']['input'];
}>;


export type AuctionDetailSubgraphQuery = { __typename?: 'Query', createdAuction: Array<{ __typename?: 'AuctionCreated', auctionId: string, seller: string, reservePrice: string, endTime: string, externalMarketId: string, blockTimestamp: string }>, bids: Array<{ __typename?: 'BidPlaced', bidder: string, amount: string, blockTimestamp: string, transactionHash: string }>, closedAuction: Array<{ __typename?: 'AuctionClosed', seller: string, buyer: string, winningBid: string, externalMarketId: string, blockTimestamp: string }>, forceClosedAuction: Array<{ __typename?: 'AuctionForceClosed', seller: string, refundedBidder: string, refundAmount: string, externalMarketId: string, reputationDelta: number, blockTimestamp: string }>, tradeExecuted: Array<{ __typename?: 'TradeExecuted', buyer: string, amount: string, blockTimestamp: string }>, reputationUpdates: Array<{ __typename?: 'ReputationUpdated', delta: number, newScore: string, blockTimestamp: string }> };

export type RecentAuctionsQueryVariables = Exact<{ [key: string]: never; }>;


export type RecentAuctionsQuery = { __typename?: 'Query', auctionCreateds: Array<{ __typename?: 'AuctionCreated', id: string, auctionId: string, seller: string, reservePrice: string, endTime: string, blockTimestamp: string, transactionHash: string }>, bidPlaceds: Array<{ __typename?: 'BidPlaced', id: string, auctionId: string, bidder: string, amount: string, blockTimestamp: string }> };

export type HomepageAuctionListsQueryVariables = Exact<{
  currentTimestamp: Scalars['BigInt']['input'];
  openLimit: Scalars['Int']['input'];
  closedLimit: Scalars['Int']['input'];
}>;


export type HomepageAuctionListsQuery = { __typename?: 'Query', openAuctions: Array<{ __typename?: 'AuctionCreated', id: string, auctionId: string, seller: string, reservePrice: string, endTime: string, externalMarketId: string, blockTimestamp: string, transactionHash: string }>, closedAuctions: Array<{ __typename?: 'AuctionClosed', id: string, auctionId: string, seller: string, buyer: string, winningBid: string, externalMarketId: string, blockTimestamp: string, transactionHash: string }> };

export type HomepageClosedAuctionReferencesQueryVariables = Exact<{
  auctionIds?: InputMaybe<Array<Scalars['BigInt']['input']> | Scalars['BigInt']['input']>;
}>;


export type HomepageClosedAuctionReferencesQuery = { __typename?: 'Query', referenceAuctions: Array<{ __typename?: 'AuctionCreated', id: string, auctionId: string, seller: string, reservePrice: string, endTime: string, externalMarketId: string, blockTimestamp: string, transactionHash: string }> };

export type HomepageLatestBidQueryVariables = Exact<{
  auctionId: Scalars['BigInt']['input'];
}>;


export type HomepageLatestBidQuery = { __typename?: 'Query', bidPlaceds: Array<{ __typename?: 'BidPlaced', id: string, auctionId: string, amount: string }> };


export const AuctionDetailSubgraphDocument = gql`
    query AuctionDetailSubgraph($auctionId: BigInt!, $bidLimit: Int!) {
  createdAuction: auctionCreateds(
    first: 1
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    auctionId
    seller
    reservePrice
    endTime
    externalMarketId
    blockTimestamp
  }
  bids: bidPlaceds(
    first: $bidLimit
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    bidder
    amount
    blockTimestamp
    transactionHash
  }
  closedAuction: auctionCloseds(
    first: 1
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    seller
    buyer
    winningBid
    externalMarketId
    blockTimestamp
  }
  forceClosedAuction: auctionForceCloseds(
    first: 1
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    seller
    refundedBidder
    refundAmount
    externalMarketId
    reputationDelta
    blockTimestamp
  }
  tradeExecuted: tradeExecuteds(
    first: 1
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    buyer
    amount
    blockTimestamp
  }
  reputationUpdates: reputationUpdateds(
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    delta
    newScore
    blockTimestamp
  }
}
    `;
export const RecentAuctionsDocument = gql`
    query RecentAuctions {
  auctionCreateds(first: 5, orderBy: blockTimestamp, orderDirection: desc) {
    id
    auctionId
    seller
    reservePrice
    endTime
    blockTimestamp
    transactionHash
  }
  bidPlaceds(first: 5, orderBy: blockTimestamp, orderDirection: desc) {
    id
    auctionId
    bidder
    amount
    blockTimestamp
  }
}
    `;
export const HomepageAuctionListsDocument = gql`
    query HomepageAuctionLists($currentTimestamp: BigInt!, $openLimit: Int!, $closedLimit: Int!) {
  openAuctions: auctionCreateds(
    first: $openLimit
    orderBy: endTime
    orderDirection: asc
    where: {endTime_gt: $currentTimestamp}
  ) {
    id
    auctionId
    seller
    reservePrice
    endTime
    externalMarketId
    blockTimestamp
    transactionHash
  }
  closedAuctions: auctionCloseds(
    first: $closedLimit
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    auctionId
    seller
    buyer
    winningBid
    externalMarketId
    blockTimestamp
    transactionHash
  }
}
    `;
export const HomepageClosedAuctionReferencesDocument = gql`
    query HomepageClosedAuctionReferences($auctionIds: [BigInt!]) {
  referenceAuctions: auctionCreateds(where: {auctionId_in: $auctionIds}) {
    id
    auctionId
    seller
    reservePrice
    endTime
    externalMarketId
    blockTimestamp
    transactionHash
  }
}
    `;
export const HomepageLatestBidDocument = gql`
    query HomepageLatestBid($auctionId: BigInt!) {
  bidPlaceds(
    first: 1
    orderBy: blockTimestamp
    orderDirection: desc
    where: {auctionId: $auctionId}
  ) {
    id
    auctionId
    amount
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    AuctionDetailSubgraph(variables: AuctionDetailSubgraphQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<AuctionDetailSubgraphQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<AuctionDetailSubgraphQuery>({ document: AuctionDetailSubgraphDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'AuctionDetailSubgraph', 'query', variables);
    },
    RecentAuctions(variables?: RecentAuctionsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<RecentAuctionsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<RecentAuctionsQuery>({ document: RecentAuctionsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'RecentAuctions', 'query', variables);
    },
    HomepageAuctionLists(variables: HomepageAuctionListsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<HomepageAuctionListsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<HomepageAuctionListsQuery>({ document: HomepageAuctionListsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'HomepageAuctionLists', 'query', variables);
    },
    HomepageClosedAuctionReferences(variables?: HomepageClosedAuctionReferencesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<HomepageClosedAuctionReferencesQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<HomepageClosedAuctionReferencesQuery>({ document: HomepageClosedAuctionReferencesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'HomepageClosedAuctionReferences', 'query', variables);
    },
    HomepageLatestBid(variables: HomepageLatestBidQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<HomepageLatestBidQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<HomepageLatestBidQuery>({ document: HomepageLatestBidDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'HomepageLatestBid', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;