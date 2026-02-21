/**
 * Passphrase-based authentication via KV lookup.
 * KV key: auth:{passphrase} -> { displayName, createdAt }
 */

/**
 * Authenticate a passphrase against KV store.
 * @param {KVNamespace} kv
 * @param {string} passphrase
 * @returns {Promise<{displayName: string, createdAt: string} | null>}
 */
export async function authenticate(kv, passphrase) {
    if (!passphrase) return null;
    const data = await kv.get(`auth:${passphrase}`, 'json');
    return data; // { displayName, createdAt } or null
}
