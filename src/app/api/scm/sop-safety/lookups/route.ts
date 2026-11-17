import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeSop, SopAccessError } from '@/modules/supply-chain-management/sop-safety/server/access';
import { readItems } from '@/modules/supply-chain-management/housekeeping/server/queries';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    try {
        await authorizeSop(req);
        const [branches, users] = await Promise.all([
            readItems('branches', ['id', 'branch_name'], {}, z.array(z.object({ id: z.number(), branch_name: z.string() }))),
            readItems('user', ['user_id', 'user_fname', 'user_lname'], {}, z.array(z.object({ user_id: z.number(), user_fname: z.string().nullable(), user_lname: z.string().nullable() }))),
        ]);
        return NextResponse.json({ branches, users }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (cause) {
        return NextResponse.json({ message: 'Unable to load SOP options.' }, { status: cause instanceof SopAccessError ? cause.status : 503 });
    }
}
