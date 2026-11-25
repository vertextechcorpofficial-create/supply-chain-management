import { sopChecklistListSchema, sopChecklistDetailSchema } from '../schemas/checklist.schema';
import { readSop } from './sopClient';
import { SOP_CENTRAL_WAREHOUSE_ID } from '../centralWarehouse';

export const sopSafetyService = {
    getChecklists: async (signal?: AbortSignal) => {
        const rows = await readSop('checklists', sopChecklistListSchema, undefined, signal);
        return rows.filter(checklist => checklist.branchId === null || checklist.branchId === SOP_CENTRAL_WAREHOUSE_ID);
    },
    async getChecklist(id: number, signal?: AbortSignal) {
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Select a valid checklist.');
        const result = await readSop(`checklists/${id}`, sopChecklistDetailSchema, undefined, signal);
        if (result.checklist.id !== id) throw new Error('Backend returned a different checklist.');
        return result;
    },
};
