import { getSopLookups } from '../services/lookups';
import { useSopResource } from './useSopResource';

/** Displayed options never confer SOP permissions. */
export function useSopLookups() {
    const resource = useSopResource('sop-lookups', async () => {
        const { branches, users } = await getSopLookups();
        return {
            branches: branches.map(branch => ({ value: String(branch.id), label: branch.branch_name })),
            users: users.map(user => ({ value: String(user.user_id), label: `${user.user_fname} ${user.user_lname}`.trim() })),
        };
    });
    return { ...resource, branches: resource.data?.branches ?? [], users: resource.data?.users ?? [] };
}
