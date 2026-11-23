import type { NextRequest } from 'next/server';

/**
 * Validate browser mutations against the public origin.
 *
 * Behind a reverse proxy, req.nextUrl may be built from the internal
 * application URL. The forwarded host/protocol are the public values that
 * the browser used, so prefer those when the proxy supplies them.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return false;

    try {
        const submitted = new URL(origin);
        if (origin !== submitted.origin || !['http:', 'https:'].includes(submitted.protocol)) return false;

        const host = req.headers.get('host')?.toLowerCase();
        const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase();
        const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
        const expectedProtocol = forwardedProto
            ? `${forwardedProto.replace(/:$/, '')}:`
            : req.nextUrl.protocol;

        if (submitted.protocol !== expectedProtocol.toLowerCase()) return false;

        // Some proxies forward the hostname without its port. Recover the
        // port only when both headers agree on the hostname.
        if (forwardedHost && host?.startsWith(`${forwardedHost}:`) && /^\d+$/.test(host.slice(forwardedHost.length + 1))) {
            return submitted.host === host;
        }

        return submitted.host === (forwardedHost || host || req.nextUrl.host.toLowerCase());
    } catch {
        return false;
    }
}
