'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { CalendarDays, ClipboardCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { dummyWarehouses, springChecklistListSchema, springKpiSchema, type SpringChecklist } from './contracts';
import { readSpringHousekeeping, writeSpringHousekeeping } from './service';
import { auditRow, scheduleRow, ruleRow, parseContract, type Audit, type Schedule, type Rule } from './workflow';
import { WorkflowForm, type FormField } from './WorkflowForm';
import { SpringStatusBadge, springStatusKeys } from './StatusBadge';
import { AuditDialog, createdAuditId } from './AuditDialog';
import { statusColors } from '../shared/components/HousekeepingStatusBadge';
import { ChecklistManager } from './ChecklistManager';
import { weeklyDayOptions, weekdayLabel } from './weekdays';
import { monthRange, manilaToday } from '../shared/contracts';

const pageFields = { total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() };
const outcomes = ['Upcoming', 'Due', 'Done', 'Done late', 'Missed', 'Cancelled'] as const;
const outcomeStyle = springStatusKeys;
const ruleFields: FormField[] = [
    { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: ['Weekly', 'Monthly'].map(value => ({ value, label: value })) },
    { name: 'weekday', label: 'Weekday', type: 'select', required: true, options: weeklyDayOptions, showWhen: { field: 'frequency', value: 'Weekly' } },
    { name: 'dayOfMonth', label: 'Monthly day (1–28)', type: 'number', min: 1, max: 28, required: true, showWhen: { field: 'frequency', value: 'Monthly' } },
    { name: 'startDate', label: 'Start date', type: 'date', required: true }, { name: 'endDate', label: 'End date (optional)', type: 'date' },
    { name: 'remarks', label: 'Remarks (optional)', type: 'textarea' },
];
const ruleBody = (branchId: number, v: Record<string, string>) => ({ branchId, frequency: v.frequency, weekday: v.frequency === 'Weekly' ? Number(v.weekday) : null, dayOfMonth: v.frequency === 'Monthly' ? Number(v.dayOfMonth) : null, startDate: v.startDate, endDate: v.endDate || null, remarks: v.remarks || '' });

export function HousekeepingWorkspace({ mode }: { mode: 'auditor' | 'checker' | 'scheduler' }) {
    const [branch] = useState(String(dummyWarehouses[0].id));
    const [month, setMonth] = useState(manilaToday().slice(0, 7));
    const [status, setStatus] = useState('ALL');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [version, setVersion] = useState(0);
    const [settledKey, setSettledKey] = useState('');
    const [error, setError] = useState('');
    const [audits, setAudits] = useState<Audit[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([]);
    const [upcomingPlanDates, setUpcomingPlanDates] = useState<string[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);
    const [checklists, setChecklists] = useState<SpringChecklist[]>([]);
    const [kpi, setKpi] = useState<z.infer<typeof springKpiSchema>>();
    const [total, setTotal] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [view, setView] = useState('table');
    const [day, setDay] = useState<Date>();
    const [manageChecklist, setManageChecklist] = useState(false);
    const [form, setForm] = useState<{ title: string; description: string; fields: FormField[]; initial?: Record<string, string>; save: (v: Record<string, string>) => Promise<void> }>();
    const requestKey = `${branch}:${month}:${page}:${status}:${mode}:${version}`;
    const isAuditorOrChecker = mode === 'auditor' || mode === 'checker';
    const loading = settledKey !== requestKey;
    const reload = () => setVersion(v => v + 1);
    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
        const range = monthRange(month);
        const common = { branchId: branch, from: range.from, to: range.through };
        const list = new URLSearchParams({ ...common, page: String(page), pageSize: '25', ...(status === 'ALL' ? {} : isAuditorOrChecker ? { status } : { outcome: status }) });
        const [c, k, rows, plans, planned] = await Promise.all([
            readSpringHousekeeping('checklists', new URLSearchParams(), controller.signal),
            readSpringHousekeeping('kpi', new URLSearchParams(common), controller.signal),
            readSpringHousekeeping(isAuditorOrChecker ? 'audits' : 'schedules', list, controller.signal),
            mode !== 'checker' ? readSpringHousekeeping('schedule-rules', new URLSearchParams({ branchId: branch }), controller.signal) : Promise.resolve([]),
            mode === 'auditor' ? readSpringHousekeeping('schedules', list, controller.signal) : Promise.resolve(null),
        ]);
            if (controller.signal.aborted) return;
            const checked = parseContract(springChecklistListSchema, c), metrics = parseContract(springKpiSchema, k);
            const recurringRules = parseContract(z.array(ruleRow), plans);
            if (isAuditorOrChecker) { const p = parseContract(z.object({ audits: z.array(auditRow), ...pageFields }), rows); setAudits(p.audits); setTotal(p.total); if (mode === 'auditor') setRules(recurringRules.filter(rule => rule.active && rule.branchId === Number(branch))); }
            else { const p = parseContract(z.object({ schedules: z.array(scheduleRow), ...pageFields }), rows); setSchedules(p.schedules); setRules(recurringRules.filter(rule => rule.branchId === Number(branch))); setTotal(p.total); }
            setChecklists(checked); setKpi(metrics); setError(''); setSettledKey(requestKey);
            if (mode === 'auditor' && planned) {
                const p = parseContract(z.object({ schedules: z.array(scheduleRow), ...pageFields }), planned);
                const today = manilaToday();
                const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 6);
                const weekEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
                setUpcomingSchedules(p.schedules.filter(schedule => schedule.scheduledDate >= today && schedule.scheduledDate <= weekEnd && ['Upcoming', 'Due'].includes(schedule.outcome)));
                const activeRules = recurringRules.filter(rule => rule.active && rule.branchId === Number(branch));
                const dates: string[] = [];
                for (const rule of activeRules) {
                    const start = new Date(`${rule.startDate}T12:00:00`);
                    if (start > end) continue;
                    for (let offset = 0; offset <= 6; offset++) {
                        const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + offset);
                        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        if (rule.frequency === 'Monthly' ? date.getDate() === rule.dayOfMonth : date.getDay() === (rule.weekday ?? 1) - 1) dates.push(value);
                    }
                }
                setUpcomingPlanDates([...new Set([...dates, ...activeRules.map(rule => rule.startDate)])].sort());
            } else { setUpcomingSchedules([]); setUpcomingPlanDates([]); }
        };
        fetchData().catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Housekeeping data could not load'); setSettledKey(requestKey); } });
        return () => controller.abort();
    }, [branch, month, page, status, mode, version, requestKey, isAuditorOrChecker]);
    const warehouse = dummyWarehouses.find(w => w.id === Number(branch));
    const available = checklists.filter(c => c.active && c.frequency !== 'Daily' && (c.branchId === null || c.branchId === Number(branch)));
    const changeScope = () => { setPage(1); setDay(undefined); setSelected(null); setForm(undefined); };
    const canShow = !loading && !error;
    const dayKey = day ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` : '';
    const shownAudits = audits.filter(a => (!dayKey || a.auditDate === dayKey) && `${a.auditNo} ${a.area ?? ''} ${a.checkedBy ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    const shownSchedules = schedules.filter(s => (!dayKey || s.scheduledDate === dayKey) && `${s.auditNo ?? ''} ${s.scheduledDate} ${s.outcome}`.toLowerCase().includes(search.toLowerCase()));
    const Icon = mode === 'scheduler' ? CalendarDays : ClipboardCheck;
    const auditorTable = (
        <div className="overflow-x-auto rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {['Audit', 'Warehouse / area', 'Date', 'Auditor', 'Status', 'Score', 'Action'].map(label => <TableHead key={label}>{label}</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shownAudits.map(a => (
                        <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.auditNo}</TableCell>
                            <TableCell>{warehouse?.name}<p className="text-xs text-muted-foreground">{a.area}</p></TableCell>
                            <TableCell>{a.auditDate}</TableCell>
                            <TableCell>{a.checkedBy ?? 'Not returned'}</TableCell>
                            <TableCell><SpringStatusBadge status={a.status} /></TableCell>
                            <TableCell>{a.scorePercent == null ? '—' : `${a.scorePercent.toFixed(2)}%`}</TableCell>
                            <TableCell><Button size="sm" variant="outline" onClick={() => setSelected(a.id)}>View details</Button></TableCell>
                        </TableRow>
                    ))}
                    {!shownAudits.length && (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No audits match these filters.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
    const schedulerTable = (
        <>
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {['Scheduled date', 'Warehouse', 'Outcome', 'Linked audit', 'Actions'].map(label => <TableHead key={label}>{label}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shownSchedules.map(s => (
                            <TableRow key={s.id}>
                                <TableCell>{s.scheduledDate}{s.originalDate && <p className="text-xs text-muted-foreground">Originally {s.originalDate}</p>}</TableCell>
                                <TableCell>{s.branchName}</TableCell>
                                <TableCell><SpringStatusBadge status={s.outcome} />{s.cancelReason && <p className="text-xs text-muted-foreground">{s.cancelReason}</p>}</TableCell>
                                <TableCell>{s.auditId ? <Button size="sm" variant="outline" onClick={() => setSelected(s.id)}>{s.auditNo || `Audit #${s.auditId}`}</Button> : 'Not fulfilled'}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                        {s.status !== 'Cancelled' && !s.auditId && (
                                            <>
                                                {s.scheduledDate > manilaToday() && (
                                                    <>
                                                        <Button size="sm" variant="outline" onClick={() => setForm({ title: 'Move planned date', description: 'Choose a date after today. The original date is preserved.', fields: [{ name: 'scheduledDate', label: 'New date', type: 'date', required: true }], initial: { scheduledDate: s.scheduledDate }, save: async v => { if (v.scheduledDate <= manilaToday()) throw new Error('Choose a future date.'); await writeSpringHousekeeping(`schedules/${s.id}`, 'PUT', { scheduledDate: v.scheduledDate }); reload(); } })}>Move</Button>
                                                        <Button size="sm" variant="outline" onClick={() => setForm({ title: 'Delete future date?', description: 'This removes the unused scheduled date. This cannot be undone.', fields: [], save: async () => { await writeSpringHousekeeping(`schedules/${s.id}`, 'DELETE'); reload(); } })}>Delete</Button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        <Button size="sm" variant="outline" onClick={() => setForm({ title: 'Cancel planned date', description: 'A reason is required. Cancelled dates are excluded from coverage.', fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true }], save: async () => { await writeSpringHousekeeping(`schedules/${s.id}`, 'DELETE'); reload(); } })}>Cancel</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <h3 className="font-semibold mt-4">Repeating plans</h3>
            <div className="space-y-2">
                {rules.map(rule => (
                    <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                        <div>
                            <p>{rule.frequency} · {rule.frequency === 'Weekly' ? weekdayLabel(rule.weekday) : `day ${rule.dayOfMonth}`} · {rule.active ? 'Active' : 'Disabled'}</p>
                            <p className="text-xs text-muted-foreground">{rule.startDate} – {rule.endDate || 'No end'} · {rule.remarks}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setForm({ title: 'Edit repeating plan', description: 'Changing the pattern replaces unused future dates. Human-moved dates may return to the plan pattern. Weekly plans use Monday–Friday only.', fields: ruleFields, initial: { frequency: rule.frequency, weekday: rule.weekday !== null && rule.weekday >= 1 && rule.weekday <= 5 ? String(rule.weekday) : '', dayOfMonth: String(rule.dayOfMonth ?? ''), startDate: rule.startDate, endDate: rule.endDate ?? '', remarks: rule.remarks ?? '' }, save: async v => { await writeSpringHousekeeping(`schedule-rules/${rule.id}`, 'PUT', ruleBody(Number(branch), v)); reload(); } })}>Edit</Button>
                            <Button variant="outline" size="sm" onClick={() => setForm({ title: rule.active ? 'Disable repeating plan?' : 'Enable repeating plan?', description: 'Disabling removes eligible future dates with no linked audit. Historical records remain.', fields: [], save: async () => { await writeSpringHousekeeping(`schedule-rules/${rule.id}`, 'PUT', { active: !rule.active }); reload(); } })}>{rule.active ? 'Disable' : 'Enable'}</Button>
                        </div>
                    </div>
                ))}
                {!rules.length && <p className="text-sm text-muted-foreground">No repeating plans.</p>}
            </div>
        </>
    );
    return <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="size-7" /></div><div><h1 className="text-2xl font-semibold tracking-tight">Housekeeping {mode === 'scheduler' ? 'Scheduler' : mode === 'checker' ? 'Checker' : 'Auditor'}</h1><p className="text-sm text-muted-foreground">Warehouse 5S audits · {warehouse?.name}</p></div></div><Button variant="outline" disabled={loading} onClick={reload}><RefreshCw className="mr-2 size-4" />Refresh</Button></div>
         <Alert><AlertDescription>Answer every criterion with a score or N/A. N/A is excluded from scoring. Missed schedules affect completion coverage, not quality scores. Planned dates are linked automatically on submission.</AlertDescription></Alert>
         {mode === 'auditor' && (upcomingSchedules.length > 0 || upcomingPlanDates.length > 0) && <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><AlertDescription><strong>Upcoming audit this week:</strong> {[...new Set([...upcomingSchedules.map(schedule => schedule.scheduledDate), ...upcomingPlanDates])].sort().join(', ')}</AlertDescription></Alert>}
        {!loading && error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" size="sm" onClick={reload}>Retry</Button></AlertDescription></Alert>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">{[{ label: '5S quality score', value: kpi?.scorePercent == null ? 'No data' : `${kpi.scorePercent.toFixed(2)}%`, color: 'COMPLETED' as const }, ...outcomes.map(outcome => ({ label: outcome, value: String(kpi?.schedule[({ Upcoming: 'upcoming', Due: 'due', Done: 'done', 'Done late': 'doneLate', Missed: 'missed', Cancelled: 'cancelled' } as const)[outcome]] ?? 0), color: outcomeStyle[outcome] }))].map(card => <Card key={card.label}><CardHeader className="px-3 py-2"><CardTitle className="text-xs font-medium text-muted-foreground">{card.label}</CardTitle></CardHeader><CardContent className="px-3 pb-3">{loading ? <Skeleton className="h-7 w-12" /> : <p className={`inline-block rounded-md border px-2 text-xl font-semibold ${statusColors[card.color]}`}>{canShow ? card.value : '—'}</p>}</CardContent></Card>)}</div>
        {canShow && kpi && <p className="text-sm text-muted-foreground">Audits done: {kpi.schedule.done + kpi.schedule.doneLate} of {kpi.schedule.counted} settled · {kpi.schedule.donePercent == null ? 'No settled schedules' : `${kpi.schedule.donePercent.toFixed(2)}% completion`} · {kpi.audits} submitted audits{ kpi.scorePercent === null && kpi.schedule.counted > 0 ? ' · Not audited' : ''}</p>}
        <Card><CardHeader><CardTitle className="text-base">{isAuditorOrChecker ? 'Audits and saved results' : 'Warehouse schedules'}</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="flex items-center gap-2"><Label htmlFor="hk-warehouse" className="text-xs">Warehouse</Label><span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium text-foreground border-transparent bg-muted">CENTRAL WAREHOUSE (#278)</span></div><div><Label htmlFor="hk-month">Month</Label><Input id="hk-month" type="month" value={month} onChange={e => { setMonth(e.target.value); changeScope(); }} /></div><div><Label htmlFor="hk-status">{isAuditorOrChecker ? 'Audit status' : 'Schedule outcome'}</Label><Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}><SelectTrigger id="hk-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All</SelectItem>{(isAuditorOrChecker ? ['Draft', 'Submitted', 'Cancelled'] : outcomes).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="hk-search">Search current page</Label><Input id="hk-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Reference, date, area…" /></div></div>
            <div className="flex flex-wrap gap-2">{isAuditorOrChecker ? <><Button disabled={!canShow || !available.length} onClick={() => setForm({ title: 'Start Housekeeping audit', description: 'Creates a draft with you recorded as auditor. Early audits do not fulfil future planned dates.', fields: [{ name: 'checklistId', label: 'Checklist', type: 'select', required: true, options: available.map(c => ({ value: String(c.id), label: `${c.name} · ${c.frequency} · max ${c.maxGrade}` })) }, { name: 'auditDate', label: 'Audit date', type: 'date', required: true }, { name: 'area', label: 'Area / zone' }, { name: 'remarks', label: 'General remarks', type: 'textarea' }], initial: { auditDate: manilaToday(), checklistId: String(available[0].id) }, save: async v => { const result = await writeSpringHousekeeping('audits', 'POST', { branchId: Number(branch), checklistId: Number(v.checklistId), auditDate: v.auditDate, area: v.area || '', remarks: v.remarks || '' }); reload(); setSelected(createdAuditId(result)); } })}>Start audit</Button><Button variant="outline" onClick={() => setManageChecklist(true)}>Manage checklists</Button></> : <><Button disabled={!canShow} onClick={() => setForm({ title: 'Create repeating plan', description: 'Choose a weekly weekday or monthly day. Future dates are generated automatically; conflicting dates are rejected.', fields: ruleFields, initial: { frequency: 'Weekly', weekday: '1', startDate: manilaToday() }, save: async v => { await writeSpringHousekeeping('schedule-rules', 'POST', ruleBody(Number(branch), v)); reload(); } })}>Create plan</Button><Button variant="outline" disabled={!canShow} onClick={() => setForm({ title: 'Add one-off date', description: 'Date must be after today. One planned audit per warehouse per day.', fields: [{ name: 'scheduledDate', label: 'Scheduled date', type: 'date', required: true }], save: async v => { if (v.scheduledDate <= manilaToday()) throw new Error('Choose a date after today (Manila).'); await writeSpringHousekeeping(`schedules`, 'POST', { branchId: Number(branch), scheduledDate: v.scheduledDate }); reload(); } })}>Add one-off date</Button></>}</div>
            {isAuditorOrChecker && <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="table">Table</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger></TabsList></Tabs>}
            {isAuditorOrChecker && view === 'calendar' && canShow && <div className="flex flex-wrap gap-4"><Calendar mode="single" selected={day} onSelect={setDay} month={new Date(`${month}-01T12:00:00`)} onMonthChange={date => { setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`); changeScope(); }} /><div className="min-w-60 flex-1 space-y-2">{shownAudits.map(a => <button key={a.id} type="button" onClick={() => setSelected(a.id)} title={`${a.auditNo} · ${a.status}`} className={`block w-full rounded-lg border p-3 text-left text-sm ${statusColors[springStatusKeys[a.status]]}`}><p>{a.auditDate} · {a.auditNo}</p><SpringStatusBadge status={a.status} /></button>)}<Button variant="outline" onClick={() => setDay(undefined)}>Show whole month</Button><p className="text-xs text-muted-foreground">Calendar entries cover the current paginated results.</p></div></div>}
            {loading ? <Skeleton className="h-48 w-full" /> : canShow && (isAuditorOrChecker ? auditorTable : schedulerTable)}
            {canShow && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{total} records · Page {page} of {Math.max(1, Math.ceil(total / 25))}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setDay(undefined); }}>Previous</Button><Button size="sm" variant="outline" disabled={page * 25 >= total} onClick={() => { setPage(p => p + 1); setDay(undefined); }}>Next</Button></div></div>}
        </CardContent></Card>
        {selected !== null && <AuditDialog key={selected} id={selected} onClose={() => { setSelected(null); reload(); }} onChanged={reload} />}
        {form && <WorkflowForm title={form.title} description={form.description} fields={form.fields} initial={form.initial} onSave={form.save} onClose={() => setForm(undefined)} />}
        {manageChecklist && <ChecklistManager onClose={() => { setManageChecklist(false); reload(); }} />}
    </div>;
}
