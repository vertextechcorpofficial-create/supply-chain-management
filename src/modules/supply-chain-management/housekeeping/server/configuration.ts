import 'server-only';

/** Server-only credential for the existing evaluation storage. */
export function evaluationToken(): string | undefined {
    return process.env.DIRECTUS_STATIC_TOKEN;
}
