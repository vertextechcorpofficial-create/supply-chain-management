"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { GroupedArrivalInvoice } from "../types/for-arrival-summary.types";
import {
  formatCurrency,
  buildAddress,
} from "../services/for-arrival-summary.helpers";
import { useState } from "react";

interface InvoiceCardProps {
  group: GroupedArrivalInvoice;
}

function getInvoiceStatusVariant(
  status: string,
): "secondary" | "outline" | "default" {
  switch (status) {
    case "Fulfilled":
      return "default";
    case "Not Fulfilled":
      return "outline";
    case "Fulfilled With Returns":
    case "Fulfilled With Concerns":
      return "secondary";
    default:
      return "outline";
  }
}

export function InvoiceCard({ group }: InvoiceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const firstInvoice = group.invoices[0];
  const driverName =
    `${firstInvoice.driverFirstName} ${firstInvoice.driverLastName}`.trim() || "N/A";
  const address = buildAddress(group.brgy, group.city, group.province);
  const invoiceCount = group.invoices.length;
  const isSingleInvoice = invoiceCount === 1;

  // Check if every invoice in this customer group has a delivery proof
  const allInvoicesDelivered =
    group.invoices.length > 0 && group.invoices.every((inv) => Boolean(inv.hasProof));

  return (
    <Card
      className={cn(
        "gap-0 rounded-md border py-0 transition-colors",
        allInvoicesDelivered
          ? "border-emerald-600 bg-emerald-100/80 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/50"
          : "border-border bg-card",
      )}
    >
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1" className="border-b-0">
          {/* Main Details (Always Visible) */}
          <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>div>svg]:rotate-180">
            <div className="flex w-full flex-col gap-2 text-left">
              {/* Customer Name */}
              <div className="mt-1">
                <p className="text-xs font-semibold text-foreground truncate max-w-[260px]">
                  {group.customerName}
                </p>
              </div>

              {/* Sequence + Invoice Count */}
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                  >
                    {group.sequence}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Sequence
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                  {invoiceCount} {invoiceCount === 1 ? "Invoice" : "Invoices"}
                </Badge>
              </div>
            </div>
          </AccordionTrigger>

          {/* Accordion Content (Hidden by default) */}
          <AccordionContent className="px-4 pb-3 space-y-3">
            <Separator className="mb-3" />

            {/* Aggregated Amounts */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total Net Amount
                </p>
                <p className="text-xs font-semibold text-foreground">
                  {formatCurrency(group.totalNetAmount)}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total Amount
                </p>
                <p className="text-xs font-semibold text-foreground">
                  {formatCurrency(group.totalAmount)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Address */}
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Delivery Address
                </p>
                <p className="text-xs text-foreground leading-tight">
                  {address}
                </p>
              </div>
            </div>

            {/* Driver & Vehicle */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Driver
                </p>
                <p className="text-xs text-foreground truncate">
                  {driverName}
                </p>
              </div>
              {firstInvoice.vehiclePlate && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Vehicle
                  </p>
                  <p className="text-xs text-foreground truncate">
                    {firstInvoice.vehiclePlate}
                  </p>
                </div>
              )}
            </div>

            {/* Helpers */}
            {firstInvoice.helperNames.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Helper(s)
                </p>
                {firstInvoice.helperNames.map((name) => (
                  <p key={name} className="text-[10px] text-foreground truncate">
                    {name}
                  </p>
                ))}
              </div>
            )}

            {/* Expandable Invoice List (when multiple invoices) */}
            {!isSingleInvoice && (
              <>
                <Separator />
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    className="flex items-center gap-1.5 w-full text-left py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    {invoiceCount} Individual Invoices
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 bg-muted/30 rounded-md p-2">
                      {group.invoices.map((invoice) => {
                        const hasProof = Boolean(invoice.hasProof);
                        return (
                          <div
                            key={`${invoice.invoiceId}-${invoice.sequence}`}
                            className={cn(
                              "flex items-center justify-between text-[11px] py-1 px-1.5 rounded transition-colors",
                              hasProof
                                ? "bg-emerald-200/90 text-emerald-950 border border-emerald-500 font-medium dark:bg-emerald-900/60 dark:text-emerald-50 dark:border-emerald-600"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn(
                                "truncate",
                                hasProof ? "text-emerald-950 dark:text-emerald-50 font-semibold" : "text-foreground font-medium"
                              )}>
                                {invoice.invoiceNo || invoice.invoiceId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn(
                                "text-[10px]",
                                hasProof ? "text-emerald-900 font-medium dark:text-emerald-200" : "text-muted-foreground"
                              )}>
                                {formatCurrency(invoice.totalAmount)}
                              </span>
                              <Badge
                                variant={hasProof ? "default" : getInvoiceStatusVariant(invoice.invoiceStatus)}
                                className={cn(
                                  "text-[9px] h-4 px-1.5",
                                  hasProof && "bg-emerald-700 text-white hover:bg-emerald-700 border-transparent dark:bg-emerald-600"
                                )}
                              >
                                {invoice.proofOutcome || invoice.invoiceStatus || "N/A"}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Single invoice — show invoice no and status inline */}
            {isSingleInvoice && (
              <div
                className={cn(
                  "flex items-center justify-between rounded p-1.5 transition-colors",
                  Boolean(firstInvoice.hasProof) &&
                    "bg-emerald-200/90 border border-emerald-500 dark:bg-emerald-900/60 dark:border-emerald-600"
                )}
              >
                <div className="space-y-0.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Invoice No
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      Boolean(firstInvoice.hasProof)
                        ? "text-emerald-950 dark:text-emerald-50 font-semibold"
                        : "text-foreground"
                    )}
                  >
                    {firstInvoice.invoiceNo || firstInvoice.invoiceId}
                  </p>
                </div>
                <Badge
                  variant={
                    Boolean(firstInvoice.hasProof)
                      ? "default"
                      : getInvoiceStatusVariant(firstInvoice.invoiceStatus)
                  }
                  className={cn(
                    Boolean(firstInvoice.hasProof) &&
                      "bg-emerald-700 text-white hover:bg-emerald-700 border-transparent dark:bg-emerald-600 font-semibold"
                  )}
                >
                  {firstInvoice.proofOutcome || firstInvoice.invoiceStatus || "N/A"}
                </Badge>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
