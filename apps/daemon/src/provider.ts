import { ethers } from "ethers";
import { config } from "./config.js";

let _provider: ethers.JsonRpcProvider | null = null;
let _wallet: ethers.Wallet | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  }
  return _provider;
}

export function getWallet(): ethers.Wallet {
  if (!_wallet) {
    _wallet = new ethers.Wallet(config.privateKey, getProvider());
  }
  return _wallet;
}
