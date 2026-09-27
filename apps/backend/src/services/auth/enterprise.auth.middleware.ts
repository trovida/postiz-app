import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createHash } from 'crypto';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';

/**
 * SECURITY (S13 — Trovida Tier-1 T1-3): the `/enterprise/*` routes mint an
 * organisation + apiKey and can delete channels cross-tenant. Upstream leaves
 * them OFF the AuthMiddleware list (see api.module.ts `authenticatedController`),
 * so their only protection is a JWT in the request BODY signed with the shared
 * `JWT_SECRET` — the same secret used for user login and every other token.
 * Anyone who can reach the port can call them.
 *
 * This middleware puts a dedicated server-to-server credential IN FRONT of the
 * controller: every `/enterprise/*` request must carry `x-enterprise-key`
 * matching a DISTINCT `ENTERPRISE_API_KEY` secret (never `JWT_SECRET`). Only the
 * platform's core-api holds that key. It is defence-in-depth alongside the Kong
 * allowlist that restricts these routes to core-api's source (infra half); each
 * layer stands alone.
 *
 * FAIL CLOSED: if `ENTERPRISE_API_KEY` is unset or empty, every `/enterprise/*`
 * request is rejected. A misconfigured deploy must NOT leave the mint endpoint
 * open — the previous behaviour.
 */
@Injectable()
export class EnterpriseAuthMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction) {
    const expected = process.env.ENTERPRISE_API_KEY;

    // Fail closed: no configured secret => the gate is shut, not open.
    if (!expected) {
      throw new HttpForbiddenException();
    }

    const presented = req.headers['x-enterprise-key'];
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new HttpForbiddenException();
    }

    if (!EnterpriseAuthMiddleware.constantTimeEquals(presented, expected)) {
      throw new HttpForbiddenException();
    }

    next();
  }

  /**
   * Constant-time comparison that does not leak length via early return.
   * `timingSafeEqual` throws on unequal-length buffers, so both sides are
   * hashed to a fixed 32-byte digest first — comparing digests keeps the
   * timing independent of the presented value's length and content.
   */
  private static constantTimeEquals(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  }
}
