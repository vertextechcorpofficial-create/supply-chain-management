'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getSopBranches, type Branch } from '../services/lookups';
import { createSopAuditSchema, type CreateSopAuditInput } from '../schemas/audit.schema';
import { useCreateSopAudit } from '../hooks/useCreateSopAudit';
import type { SopChecklist } from '../types';
import { todayManila } from './SopShared';
import { SOP_CENTRAL_WAREHOUSE_ID } from '../centralWarehouse';

export function CreateAuditDialog({ checklists, initialDate, onClose, onReviewAudits }: { checklists: SopChecklist[]; initialDate?: string; onClose: () => void; onReviewAudits: () => void }) {
    const router = useRouter();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const { create, saving, error, uncertain, result } = useCreateSopAudit();
    const form = useForm<CreateSopAuditInput>({
        resolver: zodResolver(createSopAuditSchema),
        defaultValues: { branchId: SOP_CENTRAL_WAREHOUSE_ID, auditDate: initialDate ?? todayManila(), area: '', remarks: '' },
    });
    const checklistId = useWatch({ control: form.control, name: 'checklistId' });
    const completed = result !== undefined;

    useEffect(() => {
        if (!result) return;
        onClose();
        router.push(`/scm/sop-safety/inspector/audits/${result.audit.id}`);
    }, [result, onClose, router]);

    useEffect(() => {
        let active = true;
        // Options do not confer audit permissions.
        getSopBranches().then(rows => { if (active) setBranches(rows); })
            .catch(() => { if (active) setBranches([]); })
            .finally(() => { if (active) setLoadingBranches(false); });
        return () => { active = false; };
    }, []);

    return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" onInteractOutside={event => { if (saving) event.preventDefault(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}>
            <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12"><DialogTitle className="text-base">Create SOP audit</DialogTitle><DialogDescription className="text-xs">Start a warehouse compliance audit. You will be recorded as the inspector.</DialogDescription></DialogHeader>
            {completed && result ? <div className="space-y-3 p-5">
                <p role="status" className="text-sm">Created {result.audit.auditNo} · {result.audit.branchName} · {result.audit.auditDate}</p>
                <Button asChild><Link href={`/scm/sop-safety/inspector/audits/${result.audit.id}`} onClick={onClose}>Open grading workspace</Link></Button>
                <Button variant="outline" onClick={onReviewAudits}>View compliance audits</Button>
            </div> : <form className="flex min-h-0 flex-col" onSubmit={form.handleSubmit(create)}>
                <fieldset disabled={saving || uncertain} className="grid min-h-0 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="sop-checklist">Checklist *</Label>
                        <Select value={checklistId ? String(checklistId) : ''} onValueChange={value => {
                            // These Select controls use setValue, not native registered inputs.
                            // Reset explicitly so an old warehouse cannot survive a scope change.
                            form.reset({ ...form.getValues(), checklistId: Number(value), branchId: SOP_CENTRAL_WAREHOUSE_ID });
                        }}><SelectTrigger id="sop-checklist" className="h-9 w-full" aria-invalid={!!form.formState.errors.checklistId} aria-describedby={form.formState.errors.checklistId ? 'sop-checklist-error' : undefined}><SelectValue placeholder="Select an active checklist" /></SelectTrigger>
                            <SelectContent>{checklists.filter(checklist => checklist.active).map(checklist => <SelectItem key={checklist.id} value={String(checklist.id)}>{checklist.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {form.formState.errors.checklistId && <p id="sop-checklist-error" role="alert" className="text-xs text-destructive">Select a checklist.</p>}
                    </div>
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="sop-warehouse">Warehouse *</Label><div className="flex items-center gap-2"><span className="text-xs font-medium text-muted-foreground">CENTRAL WAREHOUSE (#278)</span><input type="hidden" {...form.register('branchId')} /></div>{!loadingBranches && branches.length === 0 && <p role="alert" className="text-xs text-destructive">Warehouses are unavailable. Close and reopen to try again.</p>}{form.formState.errors.branchId && <p id="sop-warehouse-error" role="alert" className="text-xs text-destructive">Select a warehouse.</p>}</div>
                     <input type="hidden" {...form.register('auditDate')} />
                    <div className="space-y-1 sm:col-span-2"><Label className="text-xs" htmlFor="sop-remarks">Remarks</Label><Textarea className="min-h-16 text-sm" rows={2} id="sop-remarks" {...form.register('remarks')} /></div>
                </fieldset>
                {error && <p role="alert" className="px-5 pb-3 text-xs text-destructive">{error}</p>}
                {uncertain && <div className="px-5 pb-3"><Button size="sm" type="button" variant="outline" onClick={onReviewAudits}>Check audit list before retrying</Button></div>}
                <DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-3"><Button size="sm" type="button" variant="outline" disabled={saving} onClick={onClose}>Close</Button><Button size="sm" type="submit" disabled={saving || uncertain || loadingBranches || branches.length === 0}>{saving ? 'Creating…' : 'Create draft'}</Button></DialogFooter>
            </form>}
        </DialogContent>
    </Dialog>;
}
