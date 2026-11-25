import { z } from 'zod';

/** Both SOP & Safety and Housekeeping audit the Central Warehouse only. */
export const CENTRAL_WAREHOUSE_ID = 278;
export const CENTRAL_WAREHOUSE_NAME = 'CENTRAL WAREHOUSE';

export function isCentralWarehouse(id: number | null | undefined): boolean {
    return id === CENTRAL_WAREHOUSE_ID;
}

export const centralWarehouseId = z.number().int().positive().safe()
    .refine(isCentralWarehouse, 'Housekeeping audits are limited to the Central Warehouse.');

export const centralOrGlobalWarehouseId = z.number().int().positive().safe().nullable()
    .refine(value => value === null || isCentralWarehouse(value), 'Only the Central Warehouse or a global checklist can be selected.');
