import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { CadenceService } from '@gitroom/nestjs-libraries/database/prisma/insights/cadence.service';

// The Insights layer — interpretation over the store's own data (distinct from
// the raw per-platform Analytics page). Gated on ENABLE_INSIGHTS (fail-closed),
// deliberately NOT on billingEnabled: a self-knowledge feature derived from the
// store's own posts has no reason to require Stripe.
@ApiTags('Insights')
@Controller('/insights')
export class InsightsController {
  constructor(private _cadenceService: CadenceService) {}

  private _assertEnabled() {
    if (process.env.ENABLE_INSIGHTS !== 'true') {
      // Don't advertise a disabled surface.
      throw new NotFoundException();
    }
  }

  // Pillar B1 — cadence: posts/week, droughts, and a weekday x hour posting
  // histogram, per channel, PUBLISHED-only, in the requested timezone.
  @Get('/cadence')
  async cadence(
    @GetOrgFromRequest() org: Organization,
    @Query('days') days?: string,
    @Query('integrationId') integrationId?: string,
    @Query('tz') tz?: string
  ) {
    this._assertEnabled();
    return this._cadenceService.cadence(org.id, {
      days: days ? +days : undefined,
      integrationId: integrationId || undefined,
      tz: tz || undefined,
    });
  }
}
