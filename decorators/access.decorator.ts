import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'entities/global.entity';
import { PermissionDomain } from 'entities/permissions';


export const ACCESS_KEY = 'access';

export interface AccessRule {
    roles?: UserRole[];
    permission?: {
        domain: PermissionDomain;
        value: number | number[];
    };
}

export const RequireAccess = (rule: AccessRule) =>
    SetMetadata(ACCESS_KEY, rule);
