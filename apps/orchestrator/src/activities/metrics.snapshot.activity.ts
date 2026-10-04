import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AnalyticsSnapshotService } from '@gitroom/nestjs-libraries/database/prisma/insights/analytics-snapshot.service';

// Pillar C foundation — the daily metrics-snapshot activity. Fail-soft: never
// throws out of the activity (a provider/token hiccup must not crash the loop).
@Injectable()
@Activity()
export class MetricsSnapshotActivity {
  constructor(private _analyticsSnapshotService: AnalyticsSnapshotService) {}

  @ActivityMethod()
  async runDailySnapshot() {
    try {
      return await this._analyticsSnapshotService.snapshotAll();
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
}
