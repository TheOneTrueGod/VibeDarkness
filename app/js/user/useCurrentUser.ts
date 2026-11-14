import type { AccountRole } from '../types';
import { hasRolePermission, Permissions } from './permissions';
import { useUserData } from './UserDataProvider';

export interface CurrentUser {
    id: number;
    name: string;
    role: AccountRole;
    isAdmin: boolean;
    /** Manager or admin: may open the manager screens (`Permissions.VIEW_MANAGER_SCREENS`). */
    canViewManagerScreens: boolean;
    resources: { fire: number; water: number; earth: number; air: number };
    campaignIds: string[];
    inventoryItemIds: string[];
    knowledge: Record<string, Record<string, unknown>>;
    emergencyRecoveryExpiresAt: number | null;
    refetch: () => Promise<void>;
}

export function useCurrentUser(): CurrentUser {
    const { user, refetch } = useUserData();
    return {
        id: user?.id ?? 0,
        name: user?.name ?? '',
        role: user?.role ?? 'user',
        isAdmin: user?.role === 'admin',
        canViewManagerScreens: hasRolePermission(Permissions.VIEW_MANAGER_SCREENS, user?.role),
        resources: {
            fire: user?.fire ?? 0,
            water: user?.water ?? 0,
            earth: user?.earth ?? 0,
            air: user?.air ?? 0,
        },
        campaignIds: user?.campaignIds ?? [],
        inventoryItemIds: user?.inventoryItemIds ?? [],
        knowledge: user?.knowledge ?? {},
        emergencyRecoveryExpiresAt: user?.emergencyRecoveryExpiresAt ?? null,
        refetch,
    };
}
