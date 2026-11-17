import type { ReactNode } from 'react';
import { SopRoleGate } from '@/modules/supply-chain-management/sop-safety/server/SopRoleGate';
export default function PlannerLayout({ children }: { children: ReactNode }) {
    return <SopRoleGate role="PLANNER">{children}</SopRoleGate>;
}
