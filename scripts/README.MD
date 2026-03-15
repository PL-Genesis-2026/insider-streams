# Insider Streams Scripts


## Tests

### e2e_tests/secret-marketplace-auction-closer-e2e.sh

e2e test for [../cre-workflows/secret-marketplace-auction-closer]

Creates an auction on SecretMarketplace, waits for the auction to close, runs the secret-marketplace-auction-closer CRE workflow, tests that the auction is market close

TODO UPDATE ABOVE TO CHECK SUBGRAPH TOO

### e2e_tests/simple-market-e2e.sh

Tests the [../cre-workflows/external-prediction-market-settler] CRE workflow (the CRE workflow that automatically settles events created on SimpleMarket.sol)

Creates an auction, places a bet as an external user, calls the CRE workflow to identify the outcome of the auction, closes the auction

TODO WE NEED TO RENAME SIMPLEMARKET TO SOMETHING ELSE SINCE ITS NOW SUBSTANTIALLY CUSTOM, UPDATE THIS README + SCRIPTS  + ENVVARS AND OTHER REFERENCES TO SIMPLEMARKET

### e2e_tests/secret-marketplace-e2e.ts



## Other scripts/files

codegen.ts: Generates graphql-request types + SDK so scripts can do typed queries to the subgraph.

`pnpm frontend-api`: CLI for calling `apps/insider-streams-frontend` Next API routes outside the browser. Supports `events`, `secrets`, `snapshot`, `reconcile`, `private-balances`, `private-transfer`, `faucet`, `bid`, and `create-auction`.

Examples:

```bash
pnpm frontend-api events
pnpm frontend-api snapshot --address 0x6B789D957B87c12F30b48E9bFc58678c2f76f1c5
pnpm frontend-api private-balances
pnpm frontend-api bid --auction-id 1 --amount 1000000 --env-key BIDDER_PK
pnpm frontend-api create-auction --event-id 1 --private-leg yes --secret-payload "example secret" --duration 24h --env-key BIDDER_PK
```

`pnpm private-token-api`: lower-level CLI for calling the Chainlink private token REST API directly, without going through the Next API routes. Supports `balances`, `transactions`, `shielded-address`, `transfer`, and `withdraw`.

Examples:

```bash
pnpm private-token-api balances
pnpm private-token-api transactions --limit 20 --env-key BIDDER_PK
pnpm private-token-api shielded-address --env-key BIDDER_PK
pnpm private-token-api transfer --recipient 0xabc... --amount 1000000
pnpm private-token-api withdraw --env-key BIDDER_PK --amount 500000
```
