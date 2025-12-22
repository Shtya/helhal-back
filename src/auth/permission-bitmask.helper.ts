export class PermissionBitmaskHelper {
    /**
     * Converts an array of permission enums to a bitmask number
     * Example: [ADD, EDIT] => 3
     */
    static fromArray<T extends number>(permissions?: T[]): number | null {
        if (!permissions || permissions.length === 0) return null;
        return permissions.reduce((mask, perm) => mask | perm, 0);
    }

    /**
     * Checks if a bitmask contains a permission
     */
    static has(mask: number, permission: number): boolean {
        return (mask & permission) === permission;
    }

    /**
     * Adds a permission to a mask
     */
    static add(mask: number, permission: number): number {
        return mask | permission;
    }

    /**
     * Removes a permission from a mask
     */
    static remove(mask: number, permission: number): number {
        return mask & ~permission;
    }
}
