// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ExamplePredictionMarketShareToken
/// @notice Mintable/burnable ERC-20 representing YES or NO shares in a prediction market.
/// @dev Only the deployer (ExamplePredictionMarket) can mint and burn.
contract ExamplePredictionMarketShareToken is ERC20 {
    address public immutable marketplace;

    error OnlyMarketplace();

    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert OnlyMarketplace();
        _;
    }

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        marketplace = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyMarketplace {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarketplace {
        _burn(from, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
