/** Close code the server uses when the login frame was missing, wrong or too slow. */
export const WS_AUTH_REFUSED = 4401;

/** Whether to try the live-session connection again after it closed. A refused login is not retried. */
export function shouldReconnect(closeCode: number, attempts: number, maxAttempts: number): boolean {
    return closeCode !== WS_AUTH_REFUSED && attempts < maxAttempts;
}
