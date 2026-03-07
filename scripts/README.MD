# Insider Streams Scripts


## Tests

### e2e_tests/secret-marketplace-auction-closer-e2e.sh

e2e test for [../cre-workflows/secret-marketplace-auction-closer]

Creates an auction on SecretMarketplace, waits for the auction to close, runs the secret-marketplace-auction-closer CRE workflow, tests that the auction is market close

TODO UPDATE ABOVE TO CHECK SUBGRAPH TOO

### e2e_tests/simple-market-e2e.sh

Tests the [../cre-workflows/reputation-score-manager] CRE workflow (the CRE workflow that automatically settles events created on SimpleMarket.sol)

Creates an auction, places a bet as an external user, calls the CRE workflow to identify the outcome of the auction, closes the auction

TODO WE NEED TO RENAME SIMPLEMARKET TO SOMETHING ELSE SINCE ITS NOW SUBSTANTIALLY CUSTOM, UPDATE THIS README + SCRIPTS  + ENVVARS AND OTHER REFERENCES TO SIMPLEMARKET

### e2e_tests/secret-marketplace-e2e.ts



## Other scripts/files

codegen.ts: Generates graphql-request types + SDK so scripts can do typed queries to the subgraph.

demo-query.ts & demo.graphql: Demo query to verify graphql-codegen setup is working for use as initial reference code. Delete these once any script is added that uses the subgraph