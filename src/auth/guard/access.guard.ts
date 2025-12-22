import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY, AccessRule } from 'decorators/access.decorator';
import { PermissionBitmaskHelper } from '../permission-bitmask.helper';

@Injectable()
export class AccessGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const rule = this.reflector.get<AccessRule>(
            ACCESS_KEY,
            context.getHandler(),
        );

        if (!rule) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // 1️⃣ ROLE CHECK (OR condition)
        if (rule.roles?.length) {
            if (rule.roles.includes(user.role)) {
                return true;
            }
        }

        // 2️⃣ PERMISSION CHECK (OR condition)
        if (rule.permission) {
            const { domain, value } = rule.permission;

            // Super admin shortcut
            if (user.permissions === 1) return true;

            const domainMask = user.permissions?.[domain];
            if (domainMask && PermissionBitmaskHelper.has(domainMask, value)) {
                return true;
            }
        }

        throw new ForbiddenException('Insufficient permissions');
    }
}
