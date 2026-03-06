# Insider Streams Scripts


## Tests

### auction-closer-e2e.sh

e2e test for [../cre-workflows/auction-closer]

Creates an auction on SecretMarketplace, waits for the auction to close, runs the auction-closer CRE workflow, tests that the auction is market close

TODO UPDATE ABOVE TO CHECK SUBGRAPH TOO

### simple-market-e2e.sh

Tests the [../cre-workflows/prediction-market-demo] CRE workflow (the CRE workflow that automatically settles events created on SimpleMarket.sol)

Creates an auction, places a bet as an external user, calls the CRE workflow to identify the outcome of the auction, closes the auction

TODO WE NEED TO RENAME SIMPLEMARKET TO SOMETHING ELSE SINCE ITS NOW SUBSTANTIALLY CUSTOM, UPDATE THIS README + SCRIPTS  + ENVVARS AND OTHER REFERENCES TO SIMPLEMARKET

### secret-marketplace-e2e.ts



## Other scripts/files

codegen.ts: Generates graphql-request types + SDK so scripts can do typed queries to the subgraph.

demo-query.ts & demo.graphql: Demo query to verify graphql-codegen setup is working for use as initial reference code. Delete these once any script is added that uses the subgraph