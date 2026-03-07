
We need to set up an auction close workflow. This will be an update to the auction-closer CRE job.
When an auction is closed, if there's ann bid for it in Supabase, we need to update that bid's status to won (and there might be a timestamp to update, check the DB). Won bids should increment the 


The Balances view I think has some flaws. Can you walk me through this?

Let me describe my understanding at a high level
pending_witdrawls, completed_withdrawls -> If this is referring to the records WE create when privately transfer funds out of our EOA to the user? If so, we call that "transfer_out" not "withdrawl", my question is do we store anything but finalized transfers in the transfers table? If not, we should, we only care about completed transfers. Then this can be collands into total_transferred_out.
total_deposited, this can be total_transferred_in (we want to avoid calling transfers in deposits in backend docs, although it's called a balance in user facing components, to avoid confusion)
locked_balance is fine
spent_on_wins this is the total amount the user has spent on won bids right? If so, good.
Con
One type of balance we need to check, this is complex, but we need to consider funds earned by a seller when a buyer has won an auction they created, so if a private bid is one, that means we should increment the seller's balance by the same amount that we decrement the buyer's balance by. 

Can you update the

You can rename the secrets table to private_auction_data

Check REST API docs for what statuses are actually available for private transfers and what they mean. Check e2e tests and the cre stuffs to see if something is wrong and/or needs to be updated

balances values:
```sql 
CREATE OR REPLACE VIEW balances AS
SELECT
  t.user_address,
  (COALESCE(t.total_deposited, 0)
    - COALESCE(b.locked_balance, 0)
    - COALESCE(b.spent_on_wins, 0)
    - COALESCE(t.pending_withdrawal, 0)
    - COALESCE(t.completed_withdrawals, 0))::text AS available_balance,
  COALESCE(b.locked_balance, 0)::text AS locked_balance,
  COALESCE(t.pending_withdrawal, 0)::text AS pending_withdrawal
FROM
  (
    SELECT
      user_address,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status = 'confirmed'
      ), 0) AS total_deposited,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status IN ('requested', 'transferring')
      ), 0) AS pending_withdrawal,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status = 'completed'
      ), 0) AS completed_withdrawals
    FROM transfers
    WHERE user_address IS NOT NULL
    GROUP BY user_address
  ) t
LEFT JOIN
  (
    SELECT
      bidder_address AS user_address,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'active'), 0) AS locked_balance,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'won'), 0) AS spent_on_wins
    FROM private_bids
    GROUP BY bidder_address
  ) b ON b.user_address = t.user_address;

-- RLS on view: security_invoker ensures the view runs with the caller's
-- permissions, so only service_role can query it.
ALTER VIEW balances SET (security_invoker = true);
```
