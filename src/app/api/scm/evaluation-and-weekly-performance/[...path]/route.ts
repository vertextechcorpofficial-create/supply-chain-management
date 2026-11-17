import { NextRequest } from 'next/server';
import { GET as me } from '@/app/api/scm/housekeeping/me/route';
import { GET as warehouses } from '@/app/api/scm/housekeeping/warehouses/route';
import { GET as schedules } from '@/app/api/scm/housekeeping/schedules/route';
import { GET as detail } from '@/app/api/scm/housekeeping/schedules/[id]/route';
import { GET as evidence } from '@/app/api/scm/housekeeping/schedules/[id]/evidence/[evidenceId]/route';
import { GET as recurrences } from '@/app/api/scm/housekeeping/recurrences/route';
import { retiredEvaluationWrite } from '@/modules/supply-chain-management/housekeeping/archive/retired-write';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Thin URL compatibility dispatcher. Target handlers retain authentication and scope checks. */
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    const route = path.join('/');
    if (route === 'me') return me();
    if (route === 'warehouses') return warehouses();
    if (route === 'schedules') return schedules(request);
    if (route === 'recurrences') return recurrences(request);
    if (/^schedules\/[1-9]\d*$/.test(route)) return detail(request, { params: Promise.resolve({ id: path[1] }) });
    if (/^schedules\/[1-9]\d*\/evidence\/[1-9]\d*$/.test(route)) return evidence(request, { params: Promise.resolve({ id: path[1], evidenceId: path[3] }) });
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Housekeeping resource not found.' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
export const POST = retiredEvaluationWrite;
export const PATCH = retiredEvaluationWrite;
