import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { CadenceService } from '@gitroom/nestjs-libraries/database/prisma/insights/cadence.service';
import { CoverageService } from '@gitroom/nestjs-libraries/database/prisma/insights/coverage.service';
import { AnalyticsSnapshotService } from '@gitroom/nestjs-libraries/database/prisma/insights/analytics-snapshot.service';
import {
  BrandProfileService,
  BrandProfileInput,
} from '@gitroom/nestjs-libraries/database/prisma/insights/brand-profile.service';
import { BrandContextService } from '@gitroom/nestjs-libraries/database/prisma/insights/brand-context.service';
import { BestTimeService } from '@gitroom/nestjs-libraries/database/prisma/insights/best-time.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

// The Insights layer — interpretation over the store's own data (distinct from
// the raw per-platform Analytics page). Gated on ENABLE_INSIGHTS (fail-closed),
// deliberately NOT on billingEnabled: a self-knowledge feature derived from the
// store's own posts has no reason to require Stripe.
@ApiTags('Insights')
@Controller('/insights')
export class InsightsController {
  constructor(
    private _cadenceService: CadenceService,
    private _coverageService: CoverageService,
    private _analyticsSnapshotService: AnalyticsSnapshotService,
    private _brandProfileService: BrandProfileService,
    private _brandContextService: BrandContextService,
    private _bestTimeService: BestTimeService,
    private _mediaService: MediaService
  ) {}

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

  // Pillar A — content-mix audit: what the store's analyzed photo library is
  // made of, the retail gaps, and a facts-grounded narrative.
  @Get('/audit')
  async audit(@GetOrgFromRequest() org: Organization) {
    this._assertEnabled();
    return this._mediaService.contentAudit(org.id);
  }

  // Pillar B2 — coverage: theme x channel mix of what was published, gaps, and
  // days-since-last per theme. Progressive (returns themed-so-far + a pending
  // count; call the backfill to classify the rest).
  @Get('/coverage')
  async coverage(
    @GetOrgFromRequest() org: Organization,
    @Query('days') days?: string
  ) {
    this._assertEnabled();
    return this._coverageService.coverage(org.id, days ? +days : undefined);
  }

  @Post('/coverage/backfill')
  async coverageBackfill(
    @GetOrgFromRequest() org: Organization,
    @Body('limit') limit?: number,
    @Body('days') days?: number
  ) {
    this._assertEnabled();
    return this._coverageService.backfillThemes(
      org.id,
      limit ? +limit : undefined,
      days ? +days : undefined
    );
  }

  // Pillar C foundation — snapshot this org's recent post performance into
  // PostMetricsSnapshot (the data #3 best-time and #4 engagement ranking read).
  // On-demand backfill (the daily Temporal job is dormant without RUN_CRON).
  @Post('/snapshots/backfill')
  async snapshotsBackfill(
    @GetOrgFromRequest() org: Organization,
    @Body('days') days?: number,
    @Body('limit') limit?: number
  ) {
    this._assertEnabled();
    return this._analyticsSnapshotService.snapshotOrg(org.id, {
      days: days ? +days : 90,
      limit: limit ? +limit : 200,
      source: 'backfill',
    });
  }

  // Pillar D / #4 — brand copilot: the per-org brand profile + exemplar pool
  // that grounds generation in the store's own voice.
  @Get('/brand')
  async getBrand(@GetOrgFromRequest() org: Organization) {
    this._assertEnabled();
    const [profile, contextPreview] = await Promise.all([
      this._brandProfileService.get(org.id),
      this._brandContextService.build(org.id),
    ]);
    return { profile, contextPreview };
  }

  @Put('/brand')
  async updateBrand(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BrandProfileInput
  ) {
    this._assertEnabled();
    return this._brandProfileService.update(org.id, body);
  }

  @Post('/brand/seed')
  async seedBrand(@GetOrgFromRequest() org: Organization) {
    this._assertEnabled();
    return this._brandProfileService.seedFromPosts(org.id);
  }

  @Post('/brand/backfill')
  async backfillBrand(
    @GetOrgFromRequest() org: Organization,
    @Body('limit') limit?: number
  ) {
    this._assertEnabled();
    return this._brandProfileService.backfillExemplars(
      org.id,
      limit ? +limit : undefined
    );
  }

  // Pillar C / #3 — best-time: ranked weekday x time-band slots from the store's
  // own snapshots (fallback ladder when sparse). Read-only; never mutates the
  // scheduler. 'apply'/'revert' opt-in + reversibly write Integration.postingTimes.
  @Get('/best-times/:integrationId')
  async bestTimes(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query('tz') tz?: string
  ) {
    this._assertEnabled();
    const result = await this._bestTimeService.bestTimes(
      org.id,
      integrationId,
      tz || undefined
    );
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  @Put('/best-times/:integrationId/apply')
  async applyBestTimes(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Body('count') count?: number
  ) {
    this._assertEnabled();
    return this._bestTimeService.applySuggestedTimes(
      org.id,
      integrationId,
      count ? +count : undefined
    );
  }

  @Post('/best-times/:integrationId/revert')
  async revertBestTimes(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string
  ) {
    this._assertEnabled();
    return this._bestTimeService.revertSuggestedTimes(org.id, integrationId);
  }
}
