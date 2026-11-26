'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sopRequest } from '../services/sopClient';
import { SopFormDialog, type SopField, type SopForm } from './SopFormDialog';
import type { SopChecklist, SopChecklistDetail } from '../types';
import { useSopAccess } from './SopAccessProvider';
import { SOP_CENTRAL_WAREHOUSE_ID } from '../centralWarehouse';
import { useSopResource } from '../hooks/useSopResource';
import { readSop } from '../services/sopClient';
import { ruleSchema, type SopRule } from '../schemas/response.schema';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function checklistItemForm(detail: SopChecklistDetail, item?: SopChecklistDetail['items'][number]): SopForm {
    const fields: SopField[] = [{ name: 'section', label: 'Section', required: true, suggestions: Array.from(new Set(detail.items.map(row => row.section))) }, { name: 'description', label: 'Requirement', type: 'textarea', required: true }, { name: 'weight', label: 'Weight', type: 'number', min: 0, required: true }, { name: 'sortOrder', label: 'Sort order', type: 'number', required: true }, { name: 'active', label: 'Status', type: 'select', required: true, options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] }];
    return {
        title: item ? 'Edit checklist item' : 'Add checklist item',
        description: 'Choose an existing section or enter a new one. Saved audit results keep their original requirements and weights.',
        fields,
        initial: item ? { section: item.section, description: item.description, weight: String(item.weight), sortOrder: String(item.sortOrder), active: String(item.active) } : { weight: '1', sortOrder: String(Math.max(0, ...detail.items.map(row => row.sortOrder)) + 10), active: 'true' },
        save: async values => { await sopRequest(item ? `items/${item.id}` : `checklists/${detail.checklist.id}/items`, { method: item ? 'PUT' : 'POST', body: { section: values.section, description: values.description, weight: Number(values.weight), sortOrder: Number(values.sortOrder), active: values.active === 'true' } }); },
    };
}

export function ChecklistAdmin({ checklist, detail, onChanged }: { checklist?: SopChecklist; detail?: SopChecklistDetail; onChanged: () => void }) {
    const [form, setForm] = useState<SopForm>();
    const access = useSopAccess();
    const rules = useSopResource('checklist-schedule-rules', signal => readSop('schedule-rules', z.array(ruleSchema), undefined, signal));
    if (!access.managePlanning) return null;
    const fields: SopField[] = [
        { name: 'name', label: 'Checklist name', required: true }, { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: ['Weekly', 'Monthly'].map(value => ({ value, label: value })) },
        { name: 'weekday', label: 'Inspection weekday', type: 'select', required: true, when: { name: 'frequency', value: 'Weekly' }, options: weekdays.map((label, index) => ({ value: String(index + 1), label })) },
        { name: 'dayOfMonth', label: 'Inspection day of month (1–28)', type: 'number', min: 1, max: 28, required: true, when: { name: 'frequency', value: 'Monthly' } },
        { name: 'maxGrade', label: 'Maximum grade', type: 'number', min: 0, required: true },
        { name: 'active', label: 'Status', type: 'select', required: true, options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
    ];
    return <div className="flex flex-wrap items-center gap-2">
        <Button variant={checklist ? 'outline' : 'default'} size="sm" onClick={() => { const rule = checklist && rules.data?.find((item: SopRule) => item.branchId === SOP_CENTRAL_WAREHOUSE_ID && item.frequency === checklist.frequency); setForm({ title: checklist ? 'Edit checklist' : 'Create checklist', description: 'Set the inspection frequency and assigned day. Previous submitted audits stay unchanged.', fields, initial: checklist ? { name: checklist.name, description: checklist.description ?? '', frequency: checklist.frequency, weekday: String(checklist.weekday ?? rule?.weekday ?? 1), dayOfMonth: String(checklist.dayOfMonth ?? rule?.dayOfMonth ?? 1), maxGrade: String(checklist.maxGrade), active: String(checklist.active) } : { frequency: 'Weekly', weekday: '1', maxGrade: '5', active: 'true' }, save: async values => { const frequency = values.frequency as 'Weekly' | 'Monthly'; const weekday = frequency === 'Weekly' ? Number(values.weekday) : null; const dayOfMonth = frequency === 'Monthly' ? Number(values.dayOfMonth) : null; await sopRequest(checklist ? `checklists/${checklist.id}` : 'checklists', { method: checklist ? 'PUT' : 'POST', body: { name: values.name, description: values.description || null, branchId: SOP_CENTRAL_WAREHOUSE_ID, frequency, maxGrade: Number(values.maxGrade), active: values.active === 'true' } }); const currentRule = rules.data?.find((item: SopRule) => item.branchId === SOP_CENTRAL_WAREHOUSE_ID && item.frequency === frequency); await sopRequest(currentRule ? `schedule-rules/${currentRule.id}` : 'schedule-rules', { method: currentRule ? 'PUT' : 'POST', body: currentRule ? { branchId: SOP_CENTRAL_WAREHOUSE_ID, frequency, weekday, dayOfMonth, startDate: currentRule.startDate, endDate: currentRule.endDate ?? null, active: values.active === 'true' } : { branchId: SOP_CENTRAL_WAREHOUSE_ID, frequency, weekday, dayOfMonth, startDate: new Date().toISOString().slice(0, 10), endDate: null, active: values.active === 'true' } }); } }); }}>{checklist ? <Pencil className="mr-1.5 size-3.5" /> : <Plus className="mr-1.5 size-3.5" />}{checklist ? 'Edit checklist' : 'Create checklist'}</Button>
        {detail && <Button size="sm" onClick={() => setForm(checklistItemForm(detail))}><Plus className="mr-1.5 size-3.5" />Add item</Button>}
        {form && <SopFormDialog form={form} onClose={() => setForm(undefined)} onChanged={onChanged} />}
    </div>;
}
