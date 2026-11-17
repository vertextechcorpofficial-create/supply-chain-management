"use client";

import * as React from "react";
import type { IssuePartsInput, JobOrderRef, VehicleRef } from "../types";
import type { VehiclePart } from "../../registration/types";
import type { Branch } from "../../stock-in/types";
import { SearchableSelect } from "./SearchableSelect";
import { fetchAvailablePartsByBranch, fetchJobOrderRequestedParts } from "../provider/fetchProviders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Wrench } from "lucide-react";

interface IssuePartsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobOrders: JobOrderRef[];
  parts: VehiclePart[];
  branches: Branch[];
  saving: boolean;
  onSave: (payload: IssuePartsInput) => Promise<boolean>;
}

interface ItemRowState {
  part_id: string;
  quantity: string;
  unit_cost: string;
  remarks: string;
}

export function IssuePartsModal({
  open,
  onOpenChange,
  jobOrders,
  branches,
  saving,
  onSave,
}: IssuePartsModalProps) {
  const [jobOrderId, setJobOrderId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [generalRemarks, setGeneralRemarks] = React.useState("");
  const [items, setItems] = React.useState<ItemRowState[]>([
    { part_id: "", quantity: "1", unit_cost: "0", remarks: "" },
  ]);

  const [availableParts, setAvailableParts] = React.useState<VehiclePart[]>([]);
  const [loadingParts, setLoadingParts] = React.useState(false);

  const [errors, setErrors] = React.useState<{
    jobOrderId?: string;
    branchId?: string;
    items?: { [index: number]: { part_id?: string; quantity?: string; unit_cost?: string } };
  }>({});
  const [submitted, setSubmitted] = React.useState(false);

  const [loadingJoParts, setLoadingJoParts] = React.useState(false);

  // When modal opens, clear and initialize (do not auto-select branch so user must choose or pick JO)
  React.useEffect(() => {
    if (open) {
      setJobOrderId("");
      setBranchId("");
      setGeneralRemarks("");
      setItems([{ part_id: "", quantity: "1", unit_cost: "0", remarks: "" }]);
      setErrors({});
      setSubmitted(false);
    }
  }, [open]);

  // Reactive effect: When branchId changes, fetch parts available specifically in that branch
  React.useEffect(() => {
    if (!branchId) {
      setAvailableParts([]);
      return;
    }

    let isMounted = true;
    setLoadingParts(true);

    fetchAvailablePartsByBranch(branchId)
      .then((data) => {
        if (isMounted) {
          setAvailableParts(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailableParts([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingParts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [branchId]);

  // When jobOrderId changes, auto-set branch if JO has branch_id and auto-populate requested parts
  const handleJoChange = async (selectedJoId: string) => {
    setJobOrderId(selectedJoId);
    if (submitted && errors.jobOrderId) {
      setErrors((prev) => ({ ...prev, jobOrderId: undefined }));
    }

    const jo = jobOrders.find((j) => String(j.id) === selectedJoId);
    let targetBranchId = branchId;
    if (jo?.branch_id) {
      const bId =
        typeof jo.branch_id === "object" && jo.branch_id !== null
          ? String(jo.branch_id.id)
          : String(jo.branch_id);
      targetBranchId = bId;
      setBranchId(bId);
      if (submitted && errors.branchId) {
        setErrors((prev) => ({ ...prev, branchId: undefined }));
      }
    }

    if (!selectedJoId) return;

    // Auto-fetch requested parts for this Job Order
    setLoadingJoParts(true);
    try {
      const [joParts, branchParts] = await Promise.all([
        fetchJobOrderRequestedParts(selectedJoId),
        targetBranchId ? fetchAvailablePartsByBranch(targetBranchId) : Promise.resolve([]),
      ]);

      if (targetBranchId) {
        setAvailableParts(branchParts);
      }

      if (joParts && joParts.length > 0) {
        const mappedItems: ItemRowState[] = joParts.map((p) => {
          const partId =
            typeof p.part_id === "object" && p.part_id !== null
              ? String(p.part_id.id)
              : String(p.part_id || "");

          const remainingRequested = Math.max(1, (p.quantity_requested || 0) - (p.quantity_issued || 0));
          const unitCost = String(p.unit_cost || 0);

          return {
            part_id: partId,
            quantity: String(remainingRequested),
            unit_cost: unitCost,
            remarks: p.remarks || "",
          };
        });
        setItems(mappedItems.length > 0 ? mappedItems : [{ part_id: "", quantity: "1", unit_cost: "0", remarks: "" }]);
      } else {
        setItems([{ part_id: "", quantity: "1", unit_cost: "0", remarks: "" }]);
      }
    } catch {
      // Keep default row if fetch fails
    } finally {
      setLoadingJoParts(false);
    }
  };

  // Branch change handler: clears selected parts in item rows and triggers refetch
  const handleBranchChange = (newBranchId: string) => {
    setBranchId(newBranchId);
    // Instantly reset parts in existing rows
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        part_id: "",
        unit_cost: "0",
      }))
    );
    if (submitted && errors.branchId) {
      setErrors((prev) => ({ ...prev, branchId: undefined }));
    }
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { part_id: "", quantity: "1", unit_cost: "0", remarks: "" }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ItemRowState, value: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };

      if (field === "part_id") {
        const selectedPart = availableParts.find((p) => String(p.id) === value) as
          | (VehiclePart & { on_hand?: number; available?: number })
          | undefined;
        if (selectedPart) {
          copy[index].unit_cost = String(selectedPart.unit_cost ?? 0);
          const maxAvail = selectedPart.available ?? selectedPart.on_hand ?? 0;
          if (maxAvail > 0 && Number(copy[index].quantity) > maxAvail) {
            copy[index].quantity = String(maxAvail);
          }
        }
      }

      if (field === "quantity") {
        const partId = copy[index].part_id;
        if (partId) {
          const selectedPart = availableParts.find((p) => String(p.id) === partId) as
            | (VehiclePart & { on_hand?: number; available?: number })
            | undefined;
          const maxAvail = selectedPart?.available ?? selectedPart?.on_hand ?? 0;
          if (maxAvail > 0 && Number(value) > maxAvail) {
            copy[index].quantity = String(maxAvail);
          }
        }
      }

      return copy;
    });

    if (submitted) {
      setErrors((prev) => {
        if (!prev.items || !prev.items[index]) return prev;
        const copyItems = { ...prev.items };
        delete copyItems[index];
        return { ...prev, items: copyItems };
      });
    }
  };

  const validate = (): boolean => {
    let isValid = true;
    let joError: string | undefined;
    let branchError: string | undefined;
    const itemErrors: { [index: number]: { part_id?: string; quantity?: string; unit_cost?: string } } = {};

    if (!jobOrderId) {
      joError = "Please select a target Job Order";
      isValid = false;
    }
    if (!branchId) {
      branchError = "Please select an issuing branch";
      isValid = false;
    }

    items.forEach((item, idx) => {
      const rowErr: { part_id?: string; quantity?: string; unit_cost?: string } = {};
      if (!item.part_id) {
        rowErr.part_id = "Select part";
        isValid = false;
      }
      
      const qtyNum = Number(item.quantity);
      if (!item.quantity || qtyNum <= 0 || isNaN(qtyNum)) {
        rowErr.quantity = "Qty > 0";
        isValid = false;
      } else if (item.part_id) {
        const selectedPart = availableParts.find((p) => String(p.id) === item.part_id) as
          | (VehiclePart & { on_hand?: number; available?: number })
          | undefined;
        const availableQty = selectedPart?.available ?? selectedPart?.on_hand ?? 0;
        
        // Sum total requested for this part across all rows
        const totalRequestedForPart = items
          .filter((it) => it.part_id === item.part_id)
          .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

        if (availableQty <= 0) {
          rowErr.quantity = "Out of stock";
          isValid = false;
        } else if (totalRequestedForPart > availableQty) {
          rowErr.quantity = `Max: ${availableQty}`;
          isValid = false;
        }
      }

      if (item.unit_cost === "" || Number(item.unit_cost) < 0 || isNaN(Number(item.unit_cost))) {
        rowErr.unit_cost = "Cost ≥ 0";
        isValid = false;
      }
      if (Object.keys(rowErr).length > 0) {
        itemErrors[idx] = rowErr;
      }
    });

    setErrors({ jobOrderId: joError, branchId: branchError, items: itemErrors });
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    if (!validate()) return;

    const payload: IssuePartsInput = {
      job_order_id: Number(jobOrderId),
      branch_id: Number(branchId),
      remarks: generalRemarks.trim() || undefined,
      items: items.map((i) => ({
        part_id: Number(i.part_id),
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
        remarks: i.remarks.trim() || undefined,
      })),
    };

    const success = await onSave(payload);
    if (success) {
      onOpenChange(false);
    }
  };

  const joOptions = React.useMemo(() => {
    return jobOrders
      .filter((jo) => jo.status === "Approved" || jo.status === "In Progress")
      .map((jo) => {
        const v = typeof jo.vehicle_id === "object" && jo.vehicle_id !== null ? (jo.vehicle_id as VehicleRef) : null;
        const vLabel = v?.plate_number ? ` [${v.plate_number}]` : "";
        return {
          value: String(jo.id),
          label: `${jo.jo_no}${vLabel} (${jo.status})`,
        };
      });
  }, [jobOrders]);

  const branchOptions = React.useMemo(() => {
    return branches.map((b) => ({
      value: String(b.id),
      label: `${b.branch_name}${b.city ? ` (${b.city})` : ""}`,
    }));
  }, [branches]);

  const partOptions = React.useMemo(() => {
    return availableParts.map((p) => {
      const pWithStock = p as VehiclePart & { on_hand?: number; available?: number };
      const availText =
        pWithStock.available !== undefined
          ? ` (Available: ${pWithStock.available} ${p.unit})`
          : pWithStock.on_hand !== undefined
          ? ` (On Hand: ${pWithStock.on_hand} ${p.unit})`
          : ` (${p.unit})`;

      return {
        value: String(p.id),
        label: `${p.part_code} — ${p.part_name}${availText}`,
      };
    });
  }, [availableParts]);

  const grandTotal = items.reduce((sum, item) => {
    const q = Number(item.quantity) || 0;
    const c = Number(item.unit_cost) || 0;
    return sum + q * c;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Issue Parts to Job Order
            </DialogTitle>
            <DialogDescription>
              Select an approved Job Order to issue parts and automatically deduct from inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 pr-1 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
              <div className="space-y-1.5 min-w-0 relative z-50">
                <Label htmlFor="jo_select">
                  Select Job Order <span className="text-destructive font-bold">*</span>
                </Label>
                <SearchableSelect
                  options={joOptions}
                  value={jobOrderId}
                  onValueChange={handleJoChange}
                  placeholder="Search Job Order..."
                  className={`w-full ${
                    submitted && errors.jobOrderId ? "border-destructive text-destructive" : ""
                  }`}
                />
                {submitted && errors.jobOrderId && (
                  <p className="text-xs text-destructive">{errors.jobOrderId}</p>
                )}
              </div>

              <div className="space-y-1.5 min-w-0 relative z-50">
                <Label htmlFor="branch_select">
                  Issuing Branch <span className="text-destructive font-bold">*</span>
                </Label>
                <SearchableSelect
                  options={branchOptions}
                  value={branchId}
                  onValueChange={handleBranchChange}
                  placeholder="Search branch name..."
                  className={`w-full ${
                    submitted && errors.branchId ? "border-destructive text-destructive" : ""
                  }`}
                />
                {submitted && errors.branchId && (
                  <p className="text-xs text-destructive">{errors.branchId}</p>
                )}
              </div>

              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="remarks">Issuance Notes (Optional)</Label>
                <Input
                  id="remarks"
                  placeholder="e.g. Issued to Mechanic Juan"
                  value={generalRemarks}
                  onChange={(e) => setGeneralRemarks(e.target.value)}
                  className="w-full min-w-0"
                />
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">Parts to Issue</Label>
                  {loadingJoParts && (
                    <span className="text-xs text-primary animate-pulse font-medium">
                      (Loading requested parts from JO...)
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="h-8 gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Another Part
                </Button>
              </div>

              <div className="border rounded-md divide-y bg-background min-w-0 overflow-hidden">
                {items.map((item, idx) => {
                  const rowErr = errors.items?.[idx];
                  const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
                  const rowZIndex = 40 - idx;

                  const selectedPart = availableParts.find((p) => String(p.id) === item.part_id) as
                    | (VehiclePart & { on_hand?: number; available?: number })
                    | undefined;
                  const availableQty = selectedPart?.available ?? selectedPart?.on_hand ?? null;

                  return (
                    <div
                      key={idx}
                      style={{ zIndex: rowZIndex }}
                      className="p-3 bg-card/50 flex flex-col md:flex-row gap-2.5 items-start md:items-center relative min-w-0"
                    >
                      <div className="flex-1 w-full md:min-w-[200px] space-y-1 relative min-w-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            Part <span className="text-destructive font-bold">*</span>
                            {loadingParts && (
                              <span className="text-[10px] text-muted-foreground ml-2 animate-pulse">
                                (Loading stock...)
                              </span>
                            )}
                            {!branchId && (
                              <span className="text-[10px] text-amber-600 ml-2">
                                (Select branch first)
                              </span>
                            )}
                          </Label>
                          {selectedPart && availableQty !== null && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                availableQty > 0
                                  ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60"
                                  : "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60"
                              }`}
                            >
                              Avail: {availableQty} {selectedPart.unit}
                            </span>
                          )}
                        </div>
                        <SearchableSelect
                          options={partOptions}
                          value={item.part_id}
                          onValueChange={(val) => handleItemChange(idx, "part_id", val)}
                          placeholder={
                            !branchId
                              ? "Select an issuing branch first..."
                              : loadingParts
                              ? "Loading parts..."
                              : partOptions.length === 0
                              ? "No parts in stock at this branch"
                              : "Search part code or name..."
                          }
                          disabled={!branchId || loadingParts}
                          className={`h-9 text-xs w-full ${
                            submitted && rowErr?.part_id ? "border-destructive text-destructive" : ""
                          }`}
                        />
                        {submitted && rowErr?.part_id && (
                          <p className="text-[11px] text-destructive">{rowErr.part_id}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto min-w-0">
                        <div className="w-24 shrink-0 space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Qty to Issue <span className="text-destructive font-bold">*</span>
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max={availableQty !== null && availableQty > 0 ? availableQty : undefined}
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className={`h-9 text-xs ${
                              submitted && rowErr?.quantity ? "border-destructive focus-visible:ring-destructive" : ""
                            }`}
                          />
                          {submitted && rowErr?.quantity && (
                            <p className="text-[11px] text-destructive">{rowErr.quantity}</p>
                          )}
                        </div>

                        <div className="w-28 shrink-0 space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Unit Cost (₱) <span className="text-destructive font-bold">*</span>
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => handleItemChange(idx, "unit_cost", e.target.value)}
                            className={`h-9 text-xs ${
                              submitted && rowErr?.unit_cost ? "border-destructive focus-visible:ring-destructive" : ""
                            }`}
                          />
                          {submitted && rowErr?.unit_cost && (
                            <p className="text-[11px] text-destructive">{rowErr.unit_cost}</p>
                          )}
                        </div>
                      </div>

                      <div className="w-full md:flex-1 md:min-w-[140px] space-y-1 min-w-0">
                        <Label className="text-xs text-muted-foreground">Part Notes</Label>
                        <Input
                          placeholder="Specific installation notes"
                          value={item.remarks}
                          onChange={(e) => handleItemChange(idx, "remarks", e.target.value)}
                          className="h-9 text-xs w-full min-w-0"
                        />
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0">
                        <div className="text-left md:text-right">
                          <div className="text-[10px] text-muted-foreground">Total Cost</div>
                          <div className="font-semibold text-xs sm:text-sm">
                            ₱{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center py-2 px-3 bg-muted/40 rounded-md border text-sm">
                <span className="font-medium text-muted-foreground">Total Parts Value:</span>
                <span className="font-bold text-base text-foreground">
                  ₱{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-auto pt-3 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              {saving ? "Processing..." : "Complete Parts Issuance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
