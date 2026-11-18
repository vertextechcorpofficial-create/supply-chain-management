import { NextRequest, NextResponse } from "next/server";
import { decodeJwtPayload, COOKIE_NAME } from "@/lib/auth-utils";

export const runtime = "nodejs";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

let cachedTimezone: string | null = null;

async function fetchDatabaseTimezone(): Promise<string> {
  if (cachedTimezone) return cachedTimezone;
  try {
    const res = await fetch(`${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=time_zone&limit=1`, {
      headers: directusHeaders(),
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const setting = json?.data?.[0];
      const val = setting?.setting_value;
      if (typeof val === "string" && val.trim().length > 0) {
        const tz = val.trim();
        cachedTimezone = tz;
        return tz;
      }
    }
  } catch {
    // fallback
  }
  return "Asia/Manila";
}

async function getFormattedDbNow(): Promise<string> {
  const tz = await fetchDatabaseTimezone();
  return new Date().toLocaleString("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).replace(" ", "T");
}

function json(res: unknown, status = 200) {
  return NextResponse.json(res, { status });
}

function getUserIdFromRequest(req: NextRequest): number | null {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    const rawId = payload?.user_id ?? payload?.id ?? payload?.sub;
    const num = Number(rawId);
    return isNaN(num) || num <= 0 ? null : num;
  } catch {
    return null;
  }
}

function directusHeaders(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (DIRECTUS_TOKEN) h.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
  return h;
}

export async function GET(req: NextRequest) {
  try {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");

    const url = new URL(req.url);
    const branchParam = url.searchParams.get("branch_id") || url.searchParams.get("branch");

    let branchId: string | null = null;
    let branchNameFilter: string | null = null;

    if (branchParam && branchParam !== "all") {
      if (/^\d+$/.test(branchParam)) {
        branchId = branchParam;
      } else {
        branchNameFilter = branchParam.toLowerCase().trim();
      }
    }

    // 1. Fetch parts, stock, purchase requests, purchase request items, suppliers, and branches
    const [partsRes, stockRes, prRes, prItemsRes, suppliersRes, branchesRes] = await Promise.all([
      fetch(`${DIRECTUS_URL}/items/vehicle_parts?limit=-1&fields=*,classification_id.*`, {
        cache: "no-store",
        headers: directusHeaders(),
      }),
      fetch(
        `${DIRECTUS_URL}/items/vehicle_part_stock?limit=-1&fields=*,part_id.*,branch_id.*${
          branchId ? `&filter[branch_id][_eq]=${branchId}` : ""
        }`,
        {
          cache: "no-store",
          headers: directusHeaders(),
        }
      ),
      // Fetch purchase requests (include supplier_id relation)
      fetch(
        `${DIRECTUS_URL}/items/vehicle_part_purchase_requests?limit=-1&sort=-id&fields=*,branch_id.*,supplier_id.*${
          branchId ? `&filter[branch_id][_eq]=${branchId}` : ""
        }`,
        {
          cache: "no-store",
          headers: directusHeaders(),
        }
      ).catch(() => null),
      // Fetch purchase request items
      fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_request_items?limit=-1&fields=*,part_id.*`, {
        cache: "no-store",
        headers: directusHeaders(),
      }).catch(() => null),
      // Fetch suppliers
      fetch(`${DIRECTUS_URL}/items/suppliers?limit=-1&fields=id,supplier_name,supplier_shortcut,contact_person,phone_number,email_address&sort=supplier_name`, {
        cache: "no-store",
        headers: directusHeaders(),
      }).catch(() => null),
      // Fetch branches for accurate name lookup
      fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name`, {
        cache: "no-store",
        headers: directusHeaders(),
      }).catch(() => null),
    ]);

    const partsData = await partsRes.json().catch(() => ({ data: [] }));
    const stockData = await stockRes.json().catch(() => ({ data: [] }));

    const parts = Array.isArray(partsData?.data) ? partsData.data : [];
    const stockList = Array.isArray(stockData?.data) ? stockData.data : [];

    // Map parts into a quick lookup Map
    const partMap = new Map<number, Record<string, unknown>>();
    parts.forEach((p: { id: number }) => partMap.set(Number(p.id), p));

    const suppliersData = suppliersRes && suppliersRes.ok ? await suppliersRes.json().catch(() => ({ data: [] })) : { data: [] };
    const suppliers = Array.isArray(suppliersData?.data) ? suppliersData.data : [];
    const supplierMap = new Map<number, Record<string, unknown>>();
    suppliers.forEach((s: { id: number }) => supplierMap.set(Number(s.id), s));

    const branchesData = branchesRes && branchesRes.ok ? await branchesRes.json().catch(() => ({ data: [] })) : { data: [] };
    const branchRecords = Array.isArray(branchesData?.data) ? branchesData.data : [];
    const branchMap = new Map<number, string>();
    branchRecords.forEach((b: { id: number; branch_name?: string }) => {
      branchMap.set(Number(b.id), b.branch_name || `Branch #${b.id}`);
    });

    let prItems: Array<Record<string, unknown>> = [];
    if (prRes && prRes.ok) {
      const prData = await prRes.json().catch(() => ({ data: [] }));
      const rawPrs = prData?.data || [];

      const rawItemsData = prItemsRes && prItemsRes.ok ? await prItemsRes.json().catch(() => ({ data: [] })) : { data: [] };
      const rawItems = Array.isArray(rawItemsData?.data) ? rawItemsData.data : [];

      // Group items by purchase_request_id
      const itemsByPr = new Map<number, Record<string, unknown>[]>();
      rawItems.forEach((it: Record<string, unknown>) => {
        const prId = typeof it.purchase_request_id === "object" && it.purchase_request_id !== null
          ? Number((it.purchase_request_id as Record<string, unknown>).id)
          : Number(it.purchase_request_id);
        if (!itemsByPr.has(prId)) itemsByPr.set(prId, []);
        itemsByPr.get(prId)!.push(it);
      });

      // Enrich PR items
      prItems = rawPrs.map((pr: Record<string, unknown>) => {
        const linkedItems = itemsByPr.get(Number(pr.id)) || [];
        const primaryItem = linkedItems[0];

        let partObj: Record<string, unknown> | null = null;
        let itemQty = Number(pr.quantity) || 0;

        if (primaryItem) {
          itemQty = Number(primaryItem.quantity) || itemQty;
          const pId = typeof primaryItem.part_id === "object" && primaryItem.part_id !== null
            ? Number((primaryItem.part_id as Record<string, unknown>).id)
            : Number(primaryItem.part_id);
          partObj = (typeof primaryItem.part_id === "object" ? primaryItem.part_id as Record<string, unknown> : null) || partMap.get(pId) || null;
        } else if (pr.part_id) {
          const pId = typeof pr.part_id === "object" && pr.part_id !== null
            ? Number((pr.part_id as Record<string, unknown>).id)
            : Number(pr.part_id);
          partObj = (typeof pr.part_id === "object" ? pr.part_id as Record<string, unknown> : null) || partMap.get(pId) || null;
        }

        const unitCost = Number(partObj?.unit_cost) || 0;
        const estCost = Number(pr.estimated_cost) || (itemQty * unitCost);

        // Resolve supplier
        let supplierObj: Record<string, unknown> | null = null;
        let sName = pr.supplier_name as string | null | undefined;
        if (typeof pr.supplier_id === "object" && pr.supplier_id !== null) {
          supplierObj = pr.supplier_id as Record<string, unknown>;
          sName = (supplierObj.supplier_name as string) || sName;
        } else if (pr.supplier_id) {
          supplierObj = supplierMap.get(Number(pr.supplier_id)) || null;
          sName = (supplierObj?.supplier_name as string) || sName;
        }

        return {
          ...pr,
          part_id: partObj || pr.part_id,
          quantity: itemQty,
          estimated_cost: estCost,
          supplier_id: supplierObj || pr.supplier_id,
          supplier_name: sName || "—",
          items: linkedItems,
        };
      });

      // Strict branch post-filter if branch parameter provided
      if (branchId || branchNameFilter) {
        prItems = prItems.filter((pr) => {
          const prBranchObj = typeof pr.branch_id === "object" && pr.branch_id !== null ? (pr.branch_id as Record<string, unknown>) : null;
          const prBranchIdNum = prBranchObj ? Number(prBranchObj.id) : Number(pr.branch_id);
          const prBranchName = String(prBranchObj?.branch_name || "").toLowerCase().trim();

          if (branchId && prBranchIdNum !== Number(branchId)) {
            return false;
          }
          if (branchNameFilter && !prBranchName.includes(branchNameFilter)) {
            return false;
          }
          return true;
        });
      }
    }

    // Calculate low stock / reorder triggers
    // Map active PRs (Pending, Approved, Ordered) to inform the trigger without hiding the deficit
    const activePrMap = new Map<string, { id: number; pr_no: string; status: string }>();
    const activePrStatuses = new Set(["pending", "approved", "ordered"]);

    if (Array.isArray(prItems)) {
      prItems.forEach((pr) => {
        const status = String(pr.status || "").toLowerCase().trim();
        if (!activePrStatuses.has(status)) return;

        const prBranchId = typeof pr.branch_id === "object" && pr.branch_id !== null
          ? Number((pr.branch_id as Record<string, unknown>).id)
          : Number(pr.branch_id);

        const prSummary = {
          id: Number(pr.id),
          pr_no: String(pr.pr_no || ""),
          status: String(pr.status || "Pending"),
        };

        // Check primary part_id or linked items
        const primaryPartId = typeof pr.part_id === "object" && pr.part_id !== null
          ? Number((pr.part_id as Record<string, unknown>).id)
          : Number(pr.part_id);

        if (primaryPartId && prBranchId) {
          activePrMap.set(`${primaryPartId}-${prBranchId}`, prSummary);
        }

        const linkedItems = Array.isArray(pr.items) ? (pr.items as Record<string, unknown>[]) : [];
        linkedItems.forEach((it) => {
          const itPartId = typeof it.part_id === "object" && it.part_id !== null
            ? Number((it.part_id as Record<string, unknown>).id)
            : Number(it.part_id);
          if (itPartId && prBranchId) {
            activePrMap.set(`${itPartId}-${prBranchId}`, prSummary);
          }
        });
      });
    }

    const triggers: unknown[] = [];
    const processedPartIds = new Set<string>();

    // 1. Process from stock records
    stockList.forEach((s: Record<string, unknown>) => {
      const partId = typeof s.part_id === "object" && s.part_id !== null ? Number((s.part_id as Record<string, unknown>).id) : Number(s.part_id);
      const p = partMap.get(partId) || (typeof s.part_id === "object" ? (s.part_id as Record<string, unknown>) : null);
      const b = typeof s.branch_id === "object" && s.branch_id !== null ? (s.branch_id as Record<string, unknown>) : { id: Number(s.branch_id || 1), branch_name: `Branch #${s.branch_id || 1}` };

      if (!p) return;

      const key = `${partId}-${b.id}`;
      processedPartIds.add(key);

      const activePrInfo = activePrMap.get(key);

      const onHand = Number(s.on_hand) || 0;
      const reserved = Number(s.reserved) || 0;
      const available = onHand - reserved;
      const reorderPoint = Number(p.reorder_point) || 0;

      // Trigger condition: Available stock is at or below the reorder point
      if (available <= reorderPoint) {
        // Requested formula: Reorder Point - On-Hand = Suggested Order
        const deficit = Math.max(0, reorderPoint - onHand);
        const suggestedQty = Math.max(1, deficit);

        const classObj = typeof p.classification_id === "object" && p.classification_id !== null ? (p.classification_id as Record<string, unknown>) : null;

        triggers.push({
          id: s.id,
          part_id: p.id,
          part_code: p.part_code,
          part_name: p.part_name,
          classification_name: (classObj?.name as string) || (p.category as string) || "General",
          barcode: (p.barcode as string) || (classObj?.barcode as string) || "—",
          unit: p.unit || "pc",
          unit_cost: Number(p.unit_cost) || 0,
          branch_id: b.id,
          branch_name: b.branch_name || `Branch #${b.id}`,
          on_hand: onHand,
          reserved,
          available,
          reorder_point: reorderPoint,
          deficit,
          suggested_quantity: suggestedQty,
          active_pr_id: activePrInfo?.id || null,
          active_pr_no: activePrInfo?.pr_no || null,
          active_pr_status: activePrInfo?.status || null,
        });
      }
    });

    // 2. Also check registered catalog parts that may have 0 stock
    parts.forEach((p: Record<string, unknown>) => {
      const partId = Number(p.id);
      const reorderPoint = Number(p.reorder_point) || 0;
      const targetBranchId = branchId ? Number(branchId) : 1;
      const resolvedBranchName = branchMap.get(targetBranchId) || (targetBranchId === 1 ? "Central Warehouse" : `Branch #${targetBranchId}`);
      const key = `${partId}-${targetBranchId}`;

      // If not yet in triggers and has no positive stock record
      if (!processedPartIds.has(key)) {
        const activePrInfo = activePrMap.get(key);

        // Check if there is any stock record for this part
        const hasStock = stockList.some((s: Record<string, unknown>) => {
          const sPartId = typeof s.part_id === "object" && s.part_id !== null ? Number((s.part_id as Record<string, unknown>).id) : Number(s.part_id);
          return sPartId === partId;
        });

        if (!hasStock) {
          const classObj = typeof p.classification_id === "object" && p.classification_id !== null ? (p.classification_id as Record<string, unknown>) : null;
          const deficit = reorderPoint;
          const suggestedQty = Math.max(1, reorderPoint);

          triggers.push({
            id: `cat-${partId}-${targetBranchId}`,
            part_id: p.id,
            part_code: p.part_code,
            part_name: p.part_name,
            classification_name: (classObj?.name as string) || (p.category as string) || "General",
            barcode: (p.barcode as string) || (classObj?.barcode as string) || "—",
            unit: p.unit || "pc",
            unit_cost: Number(p.unit_cost) || 0,
            branch_id: targetBranchId,
            branch_name: resolvedBranchName,
            on_hand: 0,
            reserved: 0,
            available: 0,
            reorder_point: reorderPoint,
            deficit,
            suggested_quantity: suggestedQty,
            active_pr_id: activePrInfo?.id || null,
            active_pr_no: activePrInfo?.pr_no || null,
            active_pr_status: activePrInfo?.status || null,
          });
        }
      }
    });

    return json({
      data: prItems,
      triggers,
      suppliers,
      meta: {
        total_count: prItems.length,
        triggers_count: triggers.length,
        suppliers_count: suppliers.length,
      },
    });
  } catch (e: unknown) {
    const err = e as Error;
    return json({ error: String(err?.message || err) }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");

    const payload = await req.json();
    const { branch_id, part_id, quantity, estimated_cost, priority, supplier_id, supplier_name, expected_delivery_date, notes, items } = payload;

    const branchIdNum = Number(branch_id);
    const supplierIdNum = supplier_id ? Number(supplier_id) : null;

    // Normalize items list (either from payload.items or single part_id + quantity)
    let requestItems: { part_id: number; quantity: number; unit_cost?: number; remarks?: string }[] = [];
    if (Array.isArray(items) && items.length > 0) {
      requestItems = items
        .map((it: { part_id: number | string; quantity: number | string; unit_cost?: number | string; remarks?: string }) => ({
          part_id: Number(it.part_id),
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost || 0),
          remarks: it.remarks || "",
        }))
        .filter((it) => it.part_id > 0 && it.quantity > 0);
    } else if (part_id && quantity) {
      const pNum = Number(part_id);
      const qNum = Number(quantity);
      if (pNum > 0 && qNum > 0) {
        requestItems = [{ part_id: pNum, quantity: qNum, unit_cost: Number(estimated_cost) || 0 }];
      }
    }

    if (!branchIdNum || requestItems.length === 0) {
      return json({ error: "Branch and at least one valid part with positive quantity are required." }, 400);
    }

    const firstItem = requestItems[0];
    const totalQty = requestItems.reduce((acc, it) => acc + it.quantity, 0);
    const totalEstCost = estimated_cost ? Number(estimated_cost) : requestItems.reduce((acc, it) => acc + (it.quantity * (it.unit_cost || 0)), 0);

    const prNo = `PR-${Date.now().toString().slice(-6)}`;
    const currentUserId = getUserIdFromRequest(req);
    const nowIso = await getFormattedDbNow();

    const prRecord: Record<string, unknown> = {
      pr_no: prNo,
      branch_id: branchIdNum,
      part_id: firstItem.part_id,
      quantity: totalQty,
      estimated_cost: totalEstCost,
      supplier_id: supplierIdNum || null,
      priority: priority || "Normal",
      supplier_name: supplier_name || "General Supplier",
      expected_delivery_date: expected_delivery_date || null,
      status: "Pending",
      notes: notes || "",
      requested_by: currentUserId || null,
      requested_at: nowIso,
      created_by: currentUserId || null,
      created_at: nowIso,
    };

    // Attempt writing to vehicle_part_purchase_requests
    const prRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests`, {
      method: "POST",
      headers: directusHeaders(),
      body: JSON.stringify(prRecord),
    }).catch(() => null);

    const prJson = prRes && prRes.ok ? await prRes.json().catch(() => ({})) : null;
    const createdPrId = prJson?.data?.id;

    if (createdPrId) {
      // Insert all items into vehicle_part_purchase_request_items in parallel
      await Promise.all(
        requestItems.map((it) =>
          fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_request_items`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify({
              purchase_request_id: createdPrId,
              part_id: it.part_id,
              quantity: it.quantity,
              remarks: it.remarks || notes || `Ordered for ${prNo}`,
            }),
          }).catch(() => null)
        )
      );
    } else {
      // Fallback: Also record as procurement movement logs if PR table isn't dedicated in directus
      await Promise.all(
        requestItems.map((it) =>
          fetch(`${DIRECTUS_URL}/items/vehicle_part_movements`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify({
              part_id: it.part_id,
              branch_id: branchIdNum,
              movement_type: "Purchase Request",
              quantity: it.quantity,
              unit_cost: it.unit_cost || 0,
              reference_no: prNo,
              remarks: `[PR-${priority}] ${it.remarks || notes || ""}`.trim(),
            }),
          }).catch(() => null)
        )
      );
    }

    return json({ success: true, data: { ...prRecord, id: createdPrId, part_id: firstItem.part_id, quantity: totalQty, items_count: requestItems.length } }, 201);
  } catch (e: unknown) {
    const err = e as Error;
    return json({ error: String(err?.message || err) }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");

    const payload = await req.json();
    const { id, action } = payload;

    if (!id || !action) {
      return json({ error: "id and action are required." }, 400);
    }

    // Fetch existing PR record and linked items
    const [getRes, itemsRes] = await Promise.all([
      fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}?fields=*,branch_id.*`, {
        cache: "no-store",
        headers: directusHeaders(),
      }),
      fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_request_items?filter[purchase_request_id][_eq]=${id}&limit=-1&fields=*,part_id.*`, {
        cache: "no-store",
        headers: directusHeaders(),
      }).catch(() => null),
    ]);

    const prData = await getRes.json().catch(() => ({}));
    const pr = prData?.data;

    if (!pr) {
      return json({ error: "Purchase Request not found." }, 404);
    }

    const branchId = typeof pr.branch_id === "object" && pr.branch_id !== null ? Number(pr.branch_id.id) : Number(pr.branch_id || 1);
    const prNo = pr.pr_no || `PR-#${id}`;

    const itemsData = itemsRes && itemsRes.ok ? await itemsRes.json().catch(() => ({ data: [] })) : { data: [] };
    const prItemsList = Array.isArray(itemsData?.data) && itemsData.data.length > 0
      ? itemsData.data
      : [{
          part_id: pr.part_id,
          quantity: pr.quantity,
          remarks: pr.notes,
        }];

    const currentUserId = getUserIdFromRequest(req);
    const nowIso = await getFormattedDbNow();

    // 1. Approve Action
    if (action === "approve") {
      const patchRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
          status: "Approved",
          approved_at: nowIso,
          decided_by: currentUserId || null,
          decided_at: nowIso,
        }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      return json(patchData, patchRes.status);
    }

    // 2. Cancel Action
    if (action === "cancel") {
      const patchRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
          status: "Cancelled",
          decided_by: currentUserId || null,
          decided_at: nowIso,
        }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      return json(patchData, patchRes.status);
    }

    // 3. Receive Action (Stock In to Inventory)
    if (action === "receive") {
      // a. Mark PR as Received
      const patchRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}`, {
        method: "PATCH",
        headers: directusHeaders(),
        body: JSON.stringify({
          status: "Received",
          received_at: nowIso,
        }),
      });

      // b. Process each item in the purchase request
      const targetBranchId = branchId || 1;

      for (const item of prItemsList) {
        const rawPart = item.part_id;
        const partId = typeof rawPart === "object" && rawPart !== null
          ? Number(rawPart.id ?? (rawPart as { part_id?: number }).part_id)
          : Number(rawPart);
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unit_cost || (typeof rawPart === "object" && rawPart !== null ? (rawPart as { unit_cost?: number }).unit_cost : 0)) || 0;

        if (!partId || qty <= 0) continue;

        // Record Movement: Stock In / Purchase Receipt
        await fetch(`${DIRECTUS_URL}/items/vehicle_part_movements`, {
          method: "POST",
          headers: directusHeaders(),
          body: JSON.stringify({
            part_id: partId,
            branch_id: targetBranchId,
            movement_type: "Stock In",
            quantity: qty,
            unit_cost: cost,
            reference_no: prNo,
            remarks: `Received via Purchase Request ${prNo}`,
            created_at: nowIso,
          }),
        }).catch(() => null);

        // Increase on_hand strictly in vehicle_part_stock for this target branch
        const stockFilter = `filter[part_id][_eq]=${partId}&filter[branch_id][_eq]=${targetBranchId}&limit=1`;

        const stockRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_stock?${stockFilter}`, {
          cache: "no-store",
          headers: directusHeaders(),
        });
        const stockData = await stockRes.json().catch(() => ({ data: [] }));
        const existingStock = stockData?.data?.[0];

        if (existingStock) {
          const currentOnHand = Number(existingStock.on_hand) || 0;
          await fetch(`${DIRECTUS_URL}/items/vehicle_part_stock/${existingStock.id}`, {
            method: "PATCH",
            headers: directusHeaders(),
            body: JSON.stringify({
              on_hand: currentOnHand + qty,
            }),
          });
        } else {
          // Create initial stock entry strictly for the target branch
          await fetch(`${DIRECTUS_URL}/items/vehicle_part_stock`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify({
              part_id: partId,
              branch_id: targetBranchId,
              on_hand: qty,
              reserved: 0,
            }),
          });
        }
      }

      const patchData = await patchRes.json().catch(() => ({}));
      return json({ success: true, data: patchData }, 200);
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e: unknown) {
    const err = e as Error;
    return json({ error: String(err?.message || err) }, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");

    const payload = await req.json();
    const { id, branch_id, part_id, quantity, estimated_cost, priority, supplier_id, supplier_name, expected_delivery_date, notes, items } = payload;

    if (!id) {
      return json({ error: "Purchase Request ID is required for updating." }, 400);
    }

    // Fetch existing PR record to verify status
    const getRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}?fields=id,status,created_by,requested_by,pr_no`, {
      cache: "no-store",
      headers: directusHeaders(),
    });

    if (!getRes.ok) {
      return json({ error: "Purchase request not found." }, 404);
    }

    const prData = await getRes.json().catch(() => ({}));
    const pr = prData?.data;

    if (!pr) {
      return json({ error: "Purchase request not found." }, 404);
    }

    // Workflow check: Only allow editing if status is pending
    const currentStatus = String(pr.status || "").toLowerCase().trim();
    if (currentStatus !== "pending") {
      return json({
        error: `Only pending purchase requests can be edited. This purchase request is currently '${pr.status}'.`
      }, 403);
    }

    // Handle items list if provided (multi-part edit)
    let requestItems: { part_id: number; quantity: number; unit_cost?: number; remarks?: string }[] | null = null;
    if (Array.isArray(items) && items.length > 0) {
      requestItems = items
        .map((it: { part_id: number | string; quantity: number | string; unit_cost?: number | string; remarks?: string }) => ({
          part_id: Number(it.part_id),
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost || 0),
          remarks: it.remarks || "",
        }))
        .filter((it) => it.part_id > 0 && it.quantity > 0);
    }

    // Prepare update payload
    const updateBody: Record<string, unknown> = {};
    if (branch_id !== undefined) updateBody.branch_id = Number(branch_id);

    if (requestItems && requestItems.length > 0) {
      const firstItem = requestItems[0];
      const totalQty = requestItems.reduce((acc, it) => acc + it.quantity, 0);
      const totalEstCost = estimated_cost !== undefined
        ? Number(estimated_cost)
        : requestItems.reduce((acc, it) => acc + (it.quantity * (it.unit_cost || 0)), 0);

      updateBody.part_id = firstItem.part_id;
      updateBody.quantity = totalQty;
      updateBody.estimated_cost = totalEstCost;
    } else {
      if (part_id !== undefined) updateBody.part_id = Number(part_id);
      if (quantity !== undefined) updateBody.quantity = Number(quantity);
      if (estimated_cost !== undefined) updateBody.estimated_cost = Number(estimated_cost);
    }

    if (priority !== undefined) updateBody.priority = priority;
    if (supplier_id !== undefined) updateBody.supplier_id = supplier_id ? Number(supplier_id) : null;
    if (supplier_name !== undefined) updateBody.supplier_name = supplier_name;
    if (expected_delivery_date !== undefined) updateBody.expected_delivery_date = expected_delivery_date || null;
    if (notes !== undefined) updateBody.notes = notes;
    updateBody.updated_at = await getFormattedDbNow();

    const updateRes = await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_requests/${id}`, {
      method: "PATCH",
      headers: directusHeaders(),
      body: JSON.stringify(updateBody),
    });

    if (!updateRes.ok) {
      const errorJson = await updateRes.json().catch(() => ({}));
      return json({ error: errorJson?.errors?.[0]?.message || "Failed to update purchase request." }, updateRes.status);
    }

    // Synchronize items in vehicle_part_purchase_request_items if items array was supplied
    if (requestItems && requestItems.length > 0) {
      // Find existing items to clean up
      const oldItemsRes = await fetch(
        `${DIRECTUS_URL}/items/vehicle_part_purchase_request_items?filter[purchase_request_id][_eq]=${id}&limit=-1&fields=id`,
        { headers: directusHeaders(), cache: "no-store" }
      ).catch(() => null);

      if (oldItemsRes && oldItemsRes.ok) {
        const oldItemsJson = await oldItemsRes.json().catch(() => ({ data: [] }));
        const oldItemIds = Array.isArray(oldItemsJson?.data)
          ? oldItemsJson.data.map((oi: { id: number }) => oi.id)
          : [];

        // Delete existing items
        if (oldItemIds.length > 0) {
          await fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_request_items`, {
            method: "DELETE",
            headers: directusHeaders(),
            body: JSON.stringify(oldItemIds),
          }).catch(() => null);
        }
      }

      // Insert updated items
      const prNo = pr.pr_no || `PR-#${id}`;
      await Promise.all(
        requestItems.map((it) =>
          fetch(`${DIRECTUS_URL}/items/vehicle_part_purchase_request_items`, {
            method: "POST",
            headers: directusHeaders(),
            body: JSON.stringify({
              purchase_request_id: id,
              part_id: it.part_id,
              quantity: it.quantity,
              remarks: it.remarks || notes || `Ordered for ${prNo}`,
            }),
          }).catch(() => null)
        )
      );
    }

    const updatedData = await updateRes.json().catch(() => ({}));
    return json({ success: true, data: updatedData?.data || updatedData }, 200);
  } catch (e: unknown) {
    const err = e as Error;
    return json({ error: String(err?.message || err) }, 500);
  }
}


