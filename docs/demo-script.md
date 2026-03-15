# Insider Streams - Demo Script

**Target length:** ~4-5 minutes (edited video, wait times cut)
**Hackathon:** PL_Genesis: Frontiers of Collaboration
**Track:** Existing Code
**Sponsor Bounty:** Zama (Confidential DeFi / fhEVM)

---

## INTRO - THE COORDINATION PROBLEM (0:00-0:30)

> Prediction markets are powerful coordination tools — they aggregate public opinion into price signals. But they have a blind spot: private information. If someone has genuine insight — an industry source, early data, on-the-ground knowledge — there's no structured way to share that signal without destroying its value.
>
> Insider Streams is a coordination primitive for private knowledge. It's an encrypted auction marketplace where sellers list what they know, buyers bid on the edge, and the entire process — bids, balances, predictions — stays encrypted on-chain using Zama's Fully Homomorphic Encryption. Private information can flow into public markets without anyone losing their privacy.

---

## THE HOMEPAGE (0:30-0:50)

*[Show the landing page — "Trade on what others know" hero, scroll down to the auction grid]*

> This is the Insider Streams marketplace. Each auction is tied to a prediction market event. You can see live status, countdown timers, current bid amounts, and each seller's reputation score — earned on-chain through an encrypted accountability system we'll walk through.
>
> Let's go through the full lifecycle.

---

## CREATING AN AUCTION - THE SELLER FLOW (0:50-1:35)

*[Navigate to the Create Auction page]*

> Say I have information about an upcoming event. I go to the Create page, select the prediction market I have insight on, choose my predicted outcome — yes or no — and enter my secret as the payload. I'll set the duration to five minutes so we can see the full lifecycle play out.

*[Fill out form: select event, choose outcome, type secret text, select "5m" from duration dropdown, click submit, sign with wallet]*

*[CUT — edit out the on-chain confirmation wait]*

> When I submit and sign, several things happen. My prediction gets encrypted as an FHE boolean directly in the smart contract. The secret payload gets encrypted with an AES-256 key, stored on IPFS, and that key itself is encrypted as an FHE uint256 on-chain. Nobody can read my prediction or my secret — not other users, not observers, not even someone reading contract storage.

*[Show the success screen with auction ID and Etherscan tx link]*

> The auction is live. If I click into it, I can see the lifecycle timeline showing when it was created, the countdown, and because I'm the seller, I can reveal my own secret.

*[Click into auction detail, click "Reveal secret", show the secret text unblurring with the outcome badge]*

---

## FUNDING AN ACCOUNT - THE BUYER FLOW (1:35-2:00)

*[Switch to a different wallet account]*

> Now let's switch to a buyer. Before I can bid, I need funds. I'll go to the dashboard.

*[Navigate to Dashboard > Wallet tab, click "Unlock wallet"]*

> When I unlock my wallet, the daemon decrypts my on-chain balance — stored as an encrypted integer, an `euint64`, in Zama's FHE system. Nobody browsing the blockchain can see how much anyone has deposited.

*[Show the balance display — $0 or whatever it is]*

> I'll deposit some cUSDC. This is a real on-chain deposit — the tokens get transferred and the balance gets encrypted with FHE before it's stored in the contract.

*[Enter deposit amount, click "Deposit", sign — CUT — show updated balance]*

> My balance is now funded and encrypted on-chain. I'm ready to bid.

---

## PLACING A BID (2:00-2:35)

*[Navigate to the open auction from earlier, click "Place bid"]*

> The bid modal shows my available balance and the minimum bid. I enter my amount and sign.

*[Enter bid amount, sign — CUT — show "Bid placed successfully" confirmation]*

> Behind the scenes, the daemon encrypted my bid using Zama's relayer SDK — generating a zero-knowledge proof — and submitted it on-chain. The smart contract compared my encrypted bid against the current encrypted bid, all without decrypting either value. If mine is higher, it becomes the leading bid and the previous bidder gets refunded. All in encrypted arithmetic.

*[Show updated auction detail — new bid in the timeline, updated current bid amount]*

*[CUT TO: Etherscan showing the BidPlaced event]*

> If we look at this transaction on Etherscan, you can see the `BidPlaced` event. Notice what's missing — there's no bidder address in the event. That's by design. The bid amount, the bidder's identity, and their balance are all private.

---

## THE OUTBID (2:35-2:55)

*[Switch to a third wallet account, navigate to the same auction]*

> Let's see what happens when someone outbids. I'll switch to another account, deposit some funds, and place a higher bid.

*[Quick deposit + bid flow — CUT through wait times — show bid confirmation]*

*[Switch back to the second wallet, navigate to Dashboard > Positions tab]*

> Back on the original bidder's dashboard, the positions tab shows all my active bids grouped by auction. I can see I've been outbid — the status badge says "Outbid." I can see the new current bid and decide whether to bid again from right here.

*[Show the positions tab with "Outbid" badge, the current bid amount, the "Place new bid" button]*

---

## AUCTION CLOSE AND SECRET REVEAL (2:55-3:30)

*[Show the same auction after the 5-minute timer has expired — status "Closed" or "Ended"]*

> The five minutes are up. The daemon's auction closer service detected the expiration and closed the auction on-chain. The winning bid amount was transferred — still encrypted — from the buyer's balance to the seller's balance.

*[As the winning bidder (third wallet), click "Reveal secret"]*

> As the winning bidder, I can now reveal the secret. The daemon decrypts the AES key from the FHE-encrypted on-chain value and unlocks the IPFS payload.

*[Show the secret text unblurring, the outcome badge, and the "trade on the linked prediction market" hint]*

*[Switch to the second wallet (the outbid account), navigate to the same auction, click "Reveal secret"]*

> If I switch to the account that got outbid and try to reveal — the system says only the seller and winning bidder can view this secret. Access control is enforced cryptographically.

*[Show the "only the seller and winning bidder can view" message]*

---

## AI SETTLEMENT AND ENCRYPTED REPUTATION (3:30-4:10)

*[Show an auction where reputation has already been resolved — either the auction detail timeline showing "Reputation updated" or navigate to a seller profile]*

> Here's where it all comes together. When the underlying prediction market event closes, our settler service calls Gemini AI with real-time Google Search grounding to fact-check the outcome. Did the event actually happen? Gemini returns a verdict and confidence score, and the result gets posted on-chain.
>
> Once the event is settled, the reputation resolver kicks in. The seller's prediction — still stored as an encrypted boolean — gets compared against the actual outcome using `FHE.eq()` on-chain. The result is an encrypted boolean. The daemon then uses Zama's relayer to decrypt it with a zero-knowledge proof, and submits that proof back on-chain to finalize the seller's reputation — plus one if correct, minus one if wrong.

*[Show the auction lifecycle timeline with the "Reputation updated" entry and score change]*

*[Navigate to the seller's profile page]*

> On the seller's profile, you can see their track record — total auctions, correct predictions, wrong predictions, reputation score. But you can never see what they predicted on any specific auction. The prediction is encrypted, compared encrypted, and only the boolean result is ever revealed. That's verifiable accountability from encrypted data — a governance primitive built on FHE.

*[Show the seller profile: rep score badge, correct/wrong counts, list of their auctions]*

---

## PREDICTION MARKET INTEGRATION (4:10-4:30)

*[Switch to the prediction market frontend (port 3100)]*

> Finally, we've integrated this directly into our prediction market.

*[Show an event page, buy YES or NO shares]*

> After placing a bet, a "Sell your signal" section appears with a "Create auction" link that takes you directly to Insider Streams with the event and outcome pre-filled.

*[Click the "Create auction" link, show it landing on the Insider Streams create page with fields pre-populated]*

> Take care of yourself first, then monetize your edge. Any prediction market becomes a signal coordination layer.

---

## CLOSING (4:30-4:45)

> Insider Streams — encrypted bids, private balances, confidential predictions, and verifiable on-chain reputation, all running on Zama's fhEVM. Five encrypted data types, zero plaintext on-chain, and ninety-four passing contract tests backing it up. That's Fully Homomorphic Encryption applied to a real coordination problem.

---

## RECORDING PLAN

### Pre-recording setup
1. Start the daemon (`cd apps/daemon && pnpm start`)
2. Start the frontend (`cd apps/insider-streams-frontend && pnpm dev`)
3. Start the prediction market frontend (`cd apps/prediction-market-frontend && pnpm dev`)
4. Have 3 wallet accounts ready in MetaMask (seller, bidder 1, bidder 2)
5. Fund all accounts with some cUSDC via the faucet ahead of time
6. Have at least one auction with completed reputation resolution already on-chain (for the reputation section)
7. Have Etherscan open in a tab, ready to show a BidPlaced transaction

### Recording sequence
1. **Intro** — record voiceover separately or narrate over the homepage
2. **Create auction** — use seller wallet, create with 5m duration, record through success screen
3. **Deposit** — switch to bidder 1 wallet, record unlock + deposit flow
4. **First bid** — record bid on the new auction, then switch to Etherscan tab to show the event
5. **Outbid** — switch to bidder 2 wallet, deposit + bid, then switch back to bidder 1 and show positions tab
6. **Auction close** — wait for the 5m timer (or use a pre-recorded auction), show the closed state
7. **Secret reveal (winner)** — bidder 2 reveals the secret
8. **Secret reveal (denied)** — bidder 1 tries and gets denied
9. **Reputation** — navigate to a pre-existing seller profile with reputation data
10. **Prediction market** — switch to port 3100, buy shares, show the "Create auction" link

### Editing notes
- Cut all wait times: FHE encryption (~10s), on-chain confirmation (~12s), deposit processing
- Keep the wallet signature popups — they show real interaction, not a mock
- The 5-minute auction duration means you can record the full lifecycle in one session
- For the reputation section, use a seller profile that already has resolved auctions — don't try to wait for settlement + reputation resolution in the recording

### What NOT to claim
- Don't claim fully decentralized — the daemon is an admin proxy (the path forward is threshold decryption via Zama's KMS)
- Don't claim AI settlement is trustless — it's a practical oracle with a Firestore audit trail
- Don't say "instant" or "fast" about FHE operations — acknowledge it's real cryptography with real compute cost
