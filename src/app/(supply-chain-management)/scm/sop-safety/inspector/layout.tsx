import type { ReactNode } from 'react';
import { SopRoleGate } from '@/modules/supply-chain-management/sop-safety/server/SopRoleGate';
export default function InspectorLayout({ children }: { children: ReactNode }) {
    return <SopRoleGate role="INSPECTOR">{children}</SopRoleGate>;
}
