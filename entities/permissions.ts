


export namespace Permissions {
    export enum Users {
        Add = 1 << 0,  // 0001 (1)
        Edit = 1 << 1, // 0010 (2)
        Delete = 1 << 2, // 0100 (4)
        View = 1 << 3, // 1000 (8)
        ChangeStatus = 1 << 4, // 10000 (16)
        UpdateLevel = 1 << 5,  // 100000 (32)
    }

    export enum Categories {
        Add = 1 << 0, // 000001 (1)
        Edit = 1 << 1, // 000010 (2)
        Delete = 1 << 2, // 000100 (4)
        View = 1 << 3, // 001000 (8)
        TopToggle = 1 << 4  // 010000 (16)
    }

    export enum Services {
        Add = 1 << 0, // 000001 (1)
        Edit = 1 << 1, // 000010 (2)
        Delete = 1 << 2, // 000100 (4)
        View = 1 << 3, // 001000 (8)
        PopularToggle = 1 << 4,  // 010000 (16)
        ChangeStatus = 1 << 5,  // 100000 (32)
    }

    export enum Jobs {
        Add = 1 << 0, // 000001 (1)
        Edit = 1 << 1, // 000010 (2)
        Delete = 1 << 2, // 000100 (4)
        View = 1 << 3, // 001000 (8)
        ChangeStatus = 1 << 4,  // 010000 (16)
    }

    export enum Orders {
        View = 1 << 0, // 0001 (1)
        ChangeStatus = 1 << 1,  // 0010 (2)
        MarkAsPayout = 1 << 2, // 000100 (3)
    }

    export enum Invoices {
        View = 1 << 0 // 0001 (1)
    }

    export enum Disputes {
        View = 1 << 0, // 0001 (1)
        Chat = 1 << 1, // 0010 (2)
        Propose = 1 << 2, // 0100 (4)
        ChangeStatus = 1 << 3  // 1000 (8)
    }

    export enum Finance {
        View = 1 << 0 // 0001 (1)
    }

    export enum Settings {
        Update = 1 << 0 // 0001 (1)
    }

    export enum Statistics {
        View = 1 << 0 // 0001 (1)
    }
}

export class PermissionDomains {
    static readonly USERS = 'users';
    static readonly SERVICES = 'services';
    static readonly CATEGORIES = 'categories';
    static readonly JOBS = 'jobs';
    static readonly ORDERS = 'orders';
    static readonly INVOICES = 'invoices';
    static readonly DISPUTES = 'disputes';
    static readonly FINANCE = 'finance';
    static readonly SETTINGS = 'settings';
    static readonly STATISTICS = 'statistics';
}

export type PermissionDomain =
    | typeof PermissionDomains.USERS
    | typeof PermissionDomains.SERVICES
    | typeof PermissionDomains.CATEGORIES
    | typeof PermissionDomains.JOBS
    | typeof PermissionDomains.ORDERS
    | typeof PermissionDomains.INVOICES
    | typeof PermissionDomains.DISPUTES
    | typeof PermissionDomains.FINANCE
    | typeof PermissionDomains.SETTINGS
    | typeof PermissionDomains.STATISTICS;
