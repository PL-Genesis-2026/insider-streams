import axios, { type AxiosInstance } from "axios";
import { ethers } from "ethers";
import { VAULT_ADDRESS } from "@private-streams/common";
import type {
  GetBalancesResponse,
  ListTransactionsRequest,
  ListTransactionsResponse,
  PrivateTransferRequest,
  PrivateTransferResponse,
  WithdrawRequest,
  WithdrawResponse,
  ShieldedAddressResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://convergence2026-token-api.cldev.cloud";

const EIP712_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: 11155111,
  verifyingContract: VAULT_ADDRESS,
};

export class PrivateTokenApiClient {
  private wallet: ethers.Wallet;
  private http: AxiosInstance;

  constructor(privateKey: string, baseUrl?: string) {
    this.wallet = new ethers.Wallet(privateKey);
    this.http = axios.create({
      baseURL: baseUrl ?? DEFAULT_BASE_URL,
      headers: { "Content-Type": "application/json" },
    });
  }

  /** The public address derived from the private key. */
  get account(): string {
    return this.wallet.address;
  }

  // ── Public API methods ──

  async getBalances(): Promise<GetBalancesResponse> {
    const account = this.account;
    const timestamp = this.timestamp();
    const auth = await this.sign(
      { "Retrieve Balances": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
      ] },
      { account, timestamp },
    );
    return this.post("/balances", { account, timestamp, auth });
  }

  async listTransactions(
    opts?: ListTransactionsRequest,
  ): Promise<ListTransactionsResponse> {
    const account = this.account;
    const timestamp = this.timestamp();
    const limit = opts?.limit ?? 10;
    const cursor = opts?.cursor ?? "";

    const auth = await this.sign(
      { "List Transactions": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
        { name: "cursor", type: "string" },
        { name: "limit", type: "uint256" },
      ] },
      { account, timestamp, cursor, limit },
    );

    const body: Record<string, unknown> = { account, timestamp, auth, limit };
    if (cursor) body.cursor = cursor;
    return this.post("/transactions", body);
  }

  async privateTransfer(
    req: PrivateTransferRequest,
  ): Promise<PrivateTransferResponse> {
    const sender = this.account;
    const timestamp = this.timestamp();
    const flags = req.flags ?? [];

    const auth = await this.sign(
      { "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ] },
      { sender, recipient: req.recipient, token: req.token, amount: req.amount, flags, timestamp },
    );

    return this.post("/private-transfer", {
      account: sender,
      recipient: req.recipient,
      token: req.token,
      amount: req.amount,
      flags,
      timestamp,
      auth,
    });
  }

  async withdraw(req: WithdrawRequest): Promise<WithdrawResponse> {
    const account = this.account;
    const timestamp = this.timestamp();

    const auth = await this.sign(
      { "Withdraw Tokens": [
        { name: "account", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "timestamp", type: "uint256" },
      ] },
      { account, token: req.token, amount: req.amount, timestamp },
    );

    return this.post("/withdraw", {
      account,
      token: req.token,
      amount: req.amount,
      timestamp,
      auth,
    });
  }

  async generateShieldedAddress(): Promise<ShieldedAddressResponse> {
    const account = this.account;
    const timestamp = this.timestamp();

    const auth = await this.sign(
      { "Generate Shielded Address": [
        { name: "account", type: "address" },
        { name: "timestamp", type: "uint256" },
      ] },
      { account, timestamp },
    );

    return this.post("/shielded-address", { account, timestamp, auth });
  }

  // ── Private helpers ──

  private timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  private async sign(
    types: Record<string, ethers.TypedDataField[]>,
    message: Record<string, unknown>,
  ): Promise<string> {
    return this.wallet.signTypedData(EIP712_DOMAIN, types, message);
  }

  private async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.http.post<T>(endpoint, body);
    return response.data;
  }
}
