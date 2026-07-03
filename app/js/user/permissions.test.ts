import { describe, expect, it } from 'vitest';
import { hasRolePermission, Permissions } from './permissions';

describe('hasRolePermission', () => {
    it('grants CONTROL_NPCS to admin', () => {
        expect(hasRolePermission(Permissions.CONTROL_NPCS, 'admin')).toBe(true);
    });

    it('grants CONTROL_NPCS to dm', () => {
        expect(hasRolePermission(Permissions.CONTROL_NPCS, 'dm')).toBe(true);
    });

    it('denies CONTROL_NPCS to user', () => {
        expect(hasRolePermission(Permissions.CONTROL_NPCS, 'user')).toBe(false);
    });

    it('denies CONTROL_NPCS for undefined role', () => {
        expect(hasRolePermission(Permissions.CONTROL_NPCS, undefined)).toBe(false);
    });

    it('denies CONTROL_NPCS for unknown role', () => {
        expect(hasRolePermission(Permissions.CONTROL_NPCS, 'moderator')).toBe(false);
    });
});
