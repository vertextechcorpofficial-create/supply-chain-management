'use client';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarDays, List, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { outcomes, pageSchema, ruleSchema, scheduleSchema, auditSchema, type SopRule, type SopAudit } from '../schemas/response.schema';
import { sopChecklistListSchema } from '../schemas/checklist.schema';
import { readSop, sopRequest } from '../services/sopClient';
import { useSopResource } from '../hooks/useSopResource';
import { SopError, SopLoading, SopPager, SopSelect, SopStatus, todayManila, type LookupOption } from './SopShared';
import { SopFormDialog, type SopField, type SopForm } from './SopFormDialog';
import { useSopAccess } from './SopAccessProvider';
import { SopEmptyState, SopFilterToolbar, SopSectionHeading } from './SopUi';
import { ScheduleDateActions } from './ScheduleDateActions';
import { sopStatusStyles } from '../utils/presentation';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function SchedulesPanel({ branch, branches, recurringOnly = false, onStartAuditDate }: { branch: string; branches: LookupOption[]; recurringOnly?: boolean; onStartAuditDate?: (date: string) => void }) {
    const access = useSopAccess();
    const [page, setPage] = useState(1);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [outcome, setOutcome] = useState('ALL');
    const [view, setView] = useState('table');
    const [day, setDay] = useState<Date>();
    const [calendarMonth, setCalendarMonth] = useState(new Date(`${todayManila()}T12:00:00`));
    const [form, setForm] = useState<SopForm>();
    const query = new URLSearchParams({ page: String(page), pageSize: '25', ...(branch !== 'ALL' ? { branchId: branch } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(outcome !== 'ALL' ? { outcome } : {}) });
    const schedules = useSopResource(`schedules:${query}`, async signal => recurringOnly ? undefined : readSop('schedules', pageSchema('schedules', scheduleSchema), query, signal));
    const rules = useSopResource('schedule-rules', signal => readSop('schedule-rules', z.array(ruleSchema), undefined, signal));
    const audits = useSopResource('audits', signal => readSop('audits', z.array(auditSchema), undefined, signal));
    const checklists = useSopResource(`upcoming-checklists:${branch}`, signal => readSop('checklists', sopChecklistListSchema, undefined, signal));
    const reload = () => { schedules.reload(); rules.reload(); audits.reload(); checklists.reload(); };
    const warehouseOptions = branches.filter(option => option.value !== 'ALL');
    const warehouseField: SopField = { name: 'branchId', label: 'Warehouse', type: 'select', required: true, options: warehouseOptions };
    const ruleFields: SopField[] = [warehouseField,
        { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: ['Weekly', 'Monthly'].map(value => ({ value, label: value })) },
        { name: 'weekday', label: 'Weekday', type: 'select', required: true, when: { name: 'frequency', value: 'Weekly' }, options: weekdays.map((label, index) => ({ value: String(index + 1), label })) },
        { name: 'dayOfMonth', label: 'Day of month (1–28)', type: 'number', min: 1, max: 28, required: true, when: { name: 'frequency', value: 'Monthly' } },
        { name: 'startDate', label: 'Start date', type: 'date', required: true }, { name: 'endDate', label: 'End date (optional)', type: 'date' },
    ];
    const editRule = (rule?: SopRule) => setForm({ title: rule ? 'Edit recurring plan' : 'Create recurring plan', description: 'Select one weekday for weekly inspections, or day 1–28 for monthly inspections. Leave the end date blank for an ongoing plan.', fields: ruleFields,
        initial: rule ? { branchId: String(rule.branchId), frequency: rule.frequency, weekday: String(rule.weekday ?? 1), dayOfMonth: String(rule.dayOfMonth ?? 1), startDate: rule.startDate, endDate: rule.endDate ?? '' } : { ...(branch !== 'ALL' ? { branchId: branch } : {}), frequency: 'Weekly', weekday: '1', startDate: todayManila() },
        save: async values => { await sopRequest(rule ? `schedule-rules/${rule.id}` : 'schedule-rules', { method: rule ? 'PUT' : 'POST', body: { branchId: Number(values.branchId), frequency: values.frequency, ...(values.frequency === 'Weekly' ? { weekday: Number(values.weekday), dayOfMonth: null } : { weekday: null, dayOfMonth: Number(values.dayOfMonth) }), startDate: values.startDate, endDate: values.endDate || null, ...(rule ? { active: rule.active } : {}) } }); },
    });
    const selectedDate = day ? format(day, 'yyyy-MM-dd') : null;
    const rows = schedules.data?.schedules;
    const today = todayManila();
    const upcomingRuleDates: Array<{ date: string; label: string }> = [];
    for (let offset = 0; offset <= 6; offset++) {
        const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + offset);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        for (const rule of (rules.data ?? []).filter(rule => rule.active && rule.branchId === Number(branch))) {
            if (dateStr < rule.startDate) continue;
            if (rule.endDate && dateStr > rule.endDate) continue;
            if (rule.frequency === 'Monthly' ? date.getDate() === rule.dayOfMonth : (date.getDay() || 7) === rule.weekday) upcomingRuleDates.push({ date: dateStr, label: `${rule.frequency} schedule #${rule.id}` });
        }
        for (const checklist of (checklists.data ?? []).filter(item => item.active && (item.branchId === null || item.branchId === Number(branch)))) {
            if (checklist.frequency === 'Monthly' ? date.getDate() === checklist.dayOfMonth : checklist.frequency === 'Weekly' && (date.getDay() || 7) === checklist.weekday) upcomingRuleDates.push({ date: dateStr, label: `${checklist.name} #${checklist.id}` });
        }
    }
    const auditedDates = new Set((audits.data ?? []).map((a: SopAudit) => a.auditDate));
    const upcomingAuditItems = upcomingRuleDates.filter(item => !auditedDates.has(item.date)).sort((a, b) => a.date.localeCompare(b.date));
    const upcomingAuditDates = [...new Set(upcomingAuditItems.map(item => item.date))];
    const visible = view === 'calendar' && selectedDate ? rows?.filter(row => row.scheduledDate === selectedDate) : rows;
    const shownRules = rules.data?.filter(rule => branch === 'ALL' || rule.branchId === Number(branch));
    const warehouseName = (id: number, name?: string) => name ?? warehouseOptions.find(option => Number(option.value) === id)?.label ?? 'Warehouse name unavailable';
    const auditLink = (id: number) => `/scm/sop-safety/${access.roles.includes('INSPECTOR') ? 'inspector' : 'planner'}/audits/${id}`;

    const recurringSchedules = (<div className="space-y-3"><SopSectionHeading title="Recurring schedules" count={shownRules?.length} actions={access.managePlanning ? <Button size="sm" onClick={() => editRule()} disabled={!warehouseOptions.length}><Plus className="mr-1.5 size-3.5" />Create recurring schedule</Button> : undefined} /><SopError error={rules.error} retry={rules.reload} />{rules.loading ? <SopLoading /> : shownRules && (shownRules.length ? <div className="divide-y rounded-lg border">{shownRules.map(rule => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-xs"><div className="min-w-0"><p className="font-medium">{warehouseName(rule.branchId)} · {rule.frequency} · {rule.frequency === 'Weekly' ? weekdays[(rule.weekday ?? 0) - 1] ?? 'Weekday not specified' : `day ${rule.dayOfMonth}`}</p><p className="mt-1 text-[11px] text-muted-foreground">{rule.startDate} – {rule.endDate || 'No end date'} · {rule.active ? 'Active' : 'Disabled'}</p></div>{access.managePlanning && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => editRule(rule)}>Edit</Button><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setForm({ title: rule.active ? 'Disable recurring plan?' : 'Enable recurring plan?', fields: [], save: async () => { await sopRequest(`schedule-rules/${rule.id}`, { method: 'PUT', body: { active: !rule.active } }); } })}>{rule.active ? 'Disable' : 'Enable'}</Button></div>}</div>)}</div> : <SopEmptyState title="No recurring plans" description="Weekly and monthly inspection plans will appear here." />)}</div>);
    if (recurringOnly) return <section aria-label="Recurring schedules" className="space-y-3">
        {access.inspect && upcomingAuditItems.length > 0 && <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"><CardHeader className="px-3 py-2 bg-amber-50/50 dark:bg-amber-950/10"><CardTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">Upcoming audit this week</CardTitle><p className="text-xs text-amber-900 dark:text-amber-200">{upcomingAuditDates.join(', ')}</p></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Scheduled audit dates for this week. Start an audit on any planned date.</p><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{upcomingAuditItems.map(item => { const isFuture = item.date > today; return <Card key={`${item.date}-${item.label}`} className="border-amber-200"><CardHeader className="px-3 py-2 bg-amber-50/50"><CardTitle className="text-sm font-semibold text-amber-900">{item.date}</CardTitle><p className="text-xs text-muted-foreground">{item.label}</p></CardHeader><CardContent className="px-3 py-2"><Button size="sm" className="w-full" disabled={isFuture} onClick={() => onStartAuditDate?.(item.date)}>{isFuture ? 'Locked' : 'Start Audit'}</Button></CardContent></Card>; })}</div></CardContent></Card>}
        {recurringSchedules}
        {access.managePlanning && form && <SopFormDialog form={form} onClose={() => setForm(undefined)} onChanged={reload} />}
    </section>;

    return <div className="space-y-4">
        <SopSectionHeading title="Inspection schedules" description="Plan inspections and review their completion status." actions={<>{access.managePlanning && <><Button size="sm" onClick={() => editRule()} disabled={!warehouseOptions.length}><Plus className="mr-1.5 size-3.5" />Create recurring plan</Button><Button size="sm" variant="outline" disabled={!warehouseOptions.length} onClick={() => setForm({ title: 'Add one-off inspection', fields: [warehouseField, { name: 'scheduledDate', label: 'Planned date (after today)', type: 'date', required: true }], initial: branch !== 'ALL' ? { branchId: branch } : {}, save: async values => { await sopRequest('schedules', { method: 'POST', body: { branchId: Number(values.branchId), scheduledDate: values.scheduledDate } }); } })}>Add one-off date</Button></>}<Button size="sm" variant="outline" onClick={reload}><RefreshCw className="mr-1.5 size-3.5" />Refresh</Button></>} />
        {access.inspect && upcomingAuditItems.length > 0 && <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"><CardHeader className="px-3 py-2 bg-amber-50/50 dark:bg-amber-950/10"><CardTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">Upcoming audit this week</CardTitle><p className="text-xs text-amber-900 dark:text-amber-200">{upcomingAuditDates.join(', ')}</p></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Scheduled audit dates for this week. Start an audit on any planned date.</p><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{upcomingAuditItems.map(item => { const isFuture = item.date > today; return (<Card key={`${item.date}-${item.label}`} className="border-amber-200"><CardHeader className="px-3 py-2 bg-amber-50/50"><CardTitle className="text-sm font-semibold text-amber-900">{item.date}</CardTitle><p className="text-xs text-muted-foreground">{item.label}</p></CardHeader><CardContent className="px-3 py-2"><Button size="sm" className="w-full" disabled={isFuture} onClick={() => onStartAuditDate?.(item.date)}>{isFuture ? 'Locked' : 'Start Audit'}</Button></CardContent></Card>); })}</div></CardContent></Card>}
        <SopFilterToolbar className="shadow-none"><div className="w-full sm:w-56 flex items-center gap-2"><span className="text-sm font-medium text-muted-foreground">Warehouse</span><span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium text-foreground border-transparent bg-muted">CENTRAL WAREHOUSE (#278)</span></div><div className="grid w-full grid-cols-2 gap-2 sm:w-72"><div className="space-y-1"><Label htmlFor="sop-schedules-from" className="text-[11px] text-muted-foreground">From</Label><Input id="sop-schedules-from" className="h-9 min-w-0 text-xs" aria-label="Schedule from date" type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></div><div className="space-y-1"><Label htmlFor="sop-schedules-to" className="text-[11px] text-muted-foreground">To</Label><Input id="sop-schedules-to" className="h-9 min-w-0 text-xs" aria-label="Schedule to date" type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></div></div><div className="w-full sm:w-40"><SopSelect label="Schedule outcome" value={outcome} options={[{ value: 'ALL', label: 'All outcomes' }, ...outcomes.map(value => ({ value, label: value }))]} onChange={value => { setOutcome(value); setPage(1); }} /></div><div className="flex items-center gap-1 rounded-lg bg-muted p-1 sm:ml-auto"><Button size="sm" className="h-7 px-2 text-xs" aria-pressed={view === 'table'} variant={view === 'table' ? 'default' : 'ghost'} onClick={() => setView('table')}><List className="mr-1 size-3.5" />Table</Button><Button size="sm" className="h-7 px-2 text-xs" aria-pressed={view === 'calendar'} variant={view === 'calendar' ? 'default' : 'ghost'} onClick={() => { setView('calendar'); if (rows?.[0]) setCalendarMonth(new Date(`${rows[0].scheduledDate}T12:00:00`)); }}><CalendarDays className="mr-1 size-3.5" />Calendar</Button></div></SopFilterToolbar>
        <SopError error={schedules.error} retry={schedules.reload} />
        {schedules.loading ? <SopLoading /> : visible && <>
            {view === 'calendar' ? <div className="grid items-start gap-4 lg:grid-cols-[auto_1fr]"><div className="space-y-2 rounded-lg border bg-background p-2"><Calendar mode="single" month={calendarMonth} onMonthChange={setCalendarMonth} selected={day} onSelect={setDay} modifiers={{ scheduled: (rows ?? []).map(row => new Date(`${row.scheduledDate}T12:00:00`)) }} modifiersClassNames={{ scheduled: 'font-bold underline' }} /><Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => setDay(undefined)}>Show all loaded dates</Button></div><div className="space-y-2">{visible.map(row => <div key={row.id} className={cn('space-y-2 rounded-lg border p-3', sopStatusStyles[row.outcome])}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{row.scheduledDate} · {warehouseName(row.branchId, row.branchName)}</p>{row.auditId && access.readAudits && <Link className="text-xs underline" href={auditLink(row.auditId)}>{row.auditNo || `Audit #${row.auditId}`}</Link>}</div><SopStatus value={row.outcome} /></div><ScheduleDateActions schedule={row} canManage={access.managePlanning} onForm={setForm} /></div>)}{!visible.length && <SopEmptyState title="No inspections on this date" description="Choose another date or show all loaded inspections." />}</div></div> : visible.length ? <Table><TableHeader><TableRow className="bg-muted/30 text-xs">{['Planned date', 'Warehouse', 'Outcome', 'Linked audit', 'Actions'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(row => <TableRow key={row.id} className="text-xs [&>td]:py-2.5"><TableCell>{row.scheduledDate}{row.originalDate && <p className="text-[11px] text-muted-foreground">Originally {row.originalDate}</p>}</TableCell><TableCell>{warehouseName(row.branchId, row.branchName)}</TableCell><TableCell><SopStatus value={row.outcome} />{row.cancelReason && <p className="mt-1 text-[11px] text-muted-foreground">{row.cancelReason}</p>}</TableCell><TableCell>{row.auditId ? access.readAudits ? <Link className="underline" href={auditLink(row.auditId)}>{row.auditNo || `Audit #${row.auditId}`}</Link> : row.auditNo || `Audit #${row.auditId}` : '—'}</TableCell><TableCell><ScheduleDateActions schedule={row} canManage={access.managePlanning} onForm={setForm} /></TableCell></TableRow>)}</TableBody></Table> : <SopEmptyState title="No inspections match these filters" description="Change the warehouse or date range to find planned inspections." />}
            <SopPager page={page} total={Number(schedules.data?.total)} onPage={value => { setPage(value); setDay(undefined); }} />
            {view === 'calendar' && <p className="text-[11px] text-muted-foreground">Calendar entries cover the current page only. Use date filters and page controls to load other inspections.</p>}
        </>}
        {recurringSchedules}
        {access.managePlanning && form && <SopFormDialog form={form} onClose={() => setForm(undefined)} onChanged={reload} />}
    </div>;
}
