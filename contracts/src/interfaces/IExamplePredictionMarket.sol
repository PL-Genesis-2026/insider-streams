// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IExamplePredictionMarket {
    enum Outcome { None, No, Yes, Inconclusive }
    function buyShares(uint256 eventId, Outcome outcome, uint256 usdcAmount) external;
    function nextEventId() external view returns (uint256);
}
