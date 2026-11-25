import { z } from 'zod';
import { sopCentralWarehouseId } from '../centralWarehouse';

/** Request fields documented in the SOP guide. Auditor and status are server-owned. */
export const createSopAuditSchema = z.object({
    checklistId: z.number().int().positive().safe(),
    branchId: sopCentralWarehouseId,
    auditDate: z.iso.date(),
    area: z.string().optional(),
    remarks: z.string().optional(),
}).strict();

export type CreateSopAuditInput = z.infer<typeof createSopAuditSchema>;
