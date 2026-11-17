import { notFound } from 'next/navigation';
import { AuditDetailModule } from '@/modules/supply-chain-management/sop-safety/AuditDetailModule';
export default async function PlannerAuditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
    return <AuditDetailModule id={Number(id)} workspace="PLANNER" readOnly />;
}
