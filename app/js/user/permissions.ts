import type { AccountState } from '../types';

export const Permissions = {
    CONTROL_NPCS: 'control_npcs',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ROLE_PERMISSIONS: Record<Permission, ReadonlyArray<AccountState['role']>> = {
    [Permissions.CONTROL_NPCS]: ['dm', 'admin'],
};

export function hasRolePermission(permission: Permission, role: string | undefined): boolean {
    if (role === undefined) return false;
    const allowed = ROLE_PERMISSIONS[permission];
    return (allowed as ReadonlyArray<string>).includes(role);
}
