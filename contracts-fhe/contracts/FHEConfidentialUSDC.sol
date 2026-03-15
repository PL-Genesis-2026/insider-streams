// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, externalEuint64, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title FHEConfidentialUSDC
/// @notice Confidential ERC-7984 token with encrypted balances and onlyOwner minting.
/// @dev Uses Zama fhEVM for FHE operations. 6 decimals (matching USDC).
contract FHEConfidentialUSDC is ZamaEthereumConfig, ERC7984, Ownable {
    constructor(
        address owner
    ) ERC7984("Confidential USDC", "cUSDC", "") Ownable(owner) {}

    /// @notice Mint encrypted tokens to a specified address. Only the owner can mint.
    /// @param to The recipient address
    /// @param encryptedAmount The encrypted amount to mint
    /// @param inputProof The ZKPoK proof for the encrypted input
    function mint(address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner {
        _mint(to, FHE.fromExternal(encryptedAmount, inputProof));
    }

    /// @notice Mint a plaintext amount (convenience for admin minting known amounts).
    /// @param to The recipient address
    /// @param amount The plaintext amount to mint (will be encrypted on-chain)
    function mintPlaintext(address to, uint64 amount) external onlyOwner {
        _mint(to, FHE.asEuint64(amount));
    }

    /// @notice Burn encrypted tokens from a specified address. Only the owner can burn.
    /// @param from The address to burn from
    /// @param encryptedAmount The encrypted amount to burn
    /// @param inputProof The ZKPoK proof for the encrypted input
    function burn(address from, externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner {
        _burn(from, FHE.fromExternal(encryptedAmount, inputProof));
    }
}
