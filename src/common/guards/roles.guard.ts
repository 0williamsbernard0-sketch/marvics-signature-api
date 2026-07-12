import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Must run AFTER JwtAuthGuard — relies on req.user already being populated
// by JwtStrategy.validate(). Usage: @UseGuards(JwtAuthGuard, RolesGuard)
// followed by @Roles(UserRole.SUPPORT, UserRole.SUPER_ADMIN) on the route.
//
// Routes with no @Roles() decorator are left open to any authenticated user
// (JwtAuthGuard already enforces that) — this guard only adds a further
// restriction when @Roles() is explicitly present, it never widens access.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user?.role) {
      throw new ForbiddenException('No role found on authenticated user');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
