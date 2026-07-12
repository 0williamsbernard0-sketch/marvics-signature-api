import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Global interceptor, but a no-op on any route without @Roles() — a route
// is only "privileged" (and therefore audited) once it opts in via @Roles(),
// same metadata RolesGuard reads. This means the moment a new admin route
// is built with @Roles(...), it is automatically audited with zero extra
// wiring — the exact "build before the first admin route" guarantee from
// Doc 6 §8, rather than something that can be forgotten per-handler.
//
// No privileged routes exist yet in this codebase, so this writes nothing
// currently — it's dormant infrastructure, ready for Milestone 6.
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  // Field names to redact if they appear in a logged request body — avoid
  // ever persisting secrets/credentials into AuditLog.requestBody.
  private readonly REDACTED_FIELDS = ['password', 'secret', 'token', 'apiKey', 'hmacSecret'];

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Not a privileged route — pass through untouched, no audit write.
    if (!requiredRoles || requiredRoles.length === 0) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    const method: string = req.method;
    const path: string = req.originalUrl ?? req.url;
    const ipAddress: string | undefined = req.ip;
    const requestBody = this.redact(req.body);
    const action = `${method} ${path}`;

    return next.handle().pipe(
      tap((response) => {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        void this.writeAuditLog({ userId, action, method, path, statusCode, requestBody, ipAddress });
      }),
      catchError((err) => {
        const statusCode = err?.status ?? 500;
        void this.writeAuditLog({ userId, action, method, path, statusCode, requestBody, ipAddress });
        throw err;
      }),
    );
  }

  private redact(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const field of this.REDACTED_FIELDS) {
      if (field in clone) {
        clone[field] = '[REDACTED]';
      }
    }
    return clone;
  }

  // Fire-and-forget, deliberately: an audit-log write failure must never
  // block or fail the actual privileged action it's describing. Logged
  // loudly if it does fail, so the gap is visible rather than silent.
  private async writeAuditLog(data: {
    userId?: string;
    action: string;
    method: string;
    path: string;
    statusCode: number;
    requestBody: unknown;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId ?? null,
          action: data.action,
          method: data.method,
          path: data.path,
          statusCode: data.statusCode,
          requestBody: data.requestBody as any,
          ipAddress: data.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write AuditLog for ${data.action}: ${err}`);
    }
  }
}
