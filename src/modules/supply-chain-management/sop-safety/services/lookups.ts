import { z } from 'zod';

const lookupSchema = z.object({
    branches: z.array(z.object({ id: z.number(), branch_name: z.string() })),
    users: z.array(z.object({ user_id: z.number(), user_fname: z.string().nullable(), user_lname: z.string().nullable() })),
});
export type Branch = z.infer<typeof lookupSchema>['branches'][number];
export async function getSopLookups() {
    const response = await fetch('/api/scm/sop-safety/lookups', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load SOP warehouse and user options.');
    return lookupSchema.parse(await response.json());
}
export async function getSopBranches() { return (await getSopLookups()).branches; }
