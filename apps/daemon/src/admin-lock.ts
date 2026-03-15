/**
 * Shared admin wallet mutex.
 *
 * All on-chain transactions from the admin EOA must be serialized to prevent
 * nonce collisions. Viem's wallet client auto-manages nonces, but only if
 * transactions are submitted sequentially (each waits for the previous nonce
 * to be assigned before requesting the next one).
 *
 * Every service (auction-closer, settler, reputation-resolver,
 * API faucet) must wrap write calls with withAdminLock().
 */

let adminLockPromise = Promise.resolve();

export function withAdminLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = adminLockPromise.then(fn, fn);
  adminLockPromise = next.then(
    () => {},
    () => {},
  );
  return next;
}
