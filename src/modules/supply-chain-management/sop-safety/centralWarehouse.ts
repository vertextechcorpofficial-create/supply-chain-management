import { z } from 'zod';

/** Both SOP & Safety and Housekeeping audit the Central Warehouse only. */
export const SOP_CENTRAL_WAREHOUSE_ID = 278;
export const SOP_CENTRAL_WAREHOUSE_NAME = 'CENTRAL WAREHOUSE';

export function isSopCentralWarehouse(id: number | null | undefined): boolean {
    return id === SOP_CENTRAL_WAREHOUSE_ID;
}

export const sopCentralWarehouseId = z.number().int().positive().safe()
    .refine(isSopCentralWarehouse, 'SOP & Safety audits are limited to the Central Warehouse.');

export const sopCentralOrGlobalWarehouseId = z.number().int().positive().safe().nullable()
    .refine(value => value === null || isSopCentralWarehouse(value), 'Only the Central Warehouse or a global checklist can be selected.');
