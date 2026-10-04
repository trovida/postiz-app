import { proxyActivities, sleep } from '@temporalio/workflow';
import { MetricsSnapshotActivity } from '@gitroom/orchestrator/activities/metrics.snapshot.activity';

const { runDailySnapshot } = proxyActivities<MetricsSnapshotActivity>({
  startToCloseTimeout: '30 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Singleton infinite workflow (the missingPostWorkflow pattern). Runs once
// immediately, then daily. Started by InfiniteWorkflowRegister behind RUN_CRON.
export async function metricsSnapshotWorkflow() {
  await runDailySnapshot();
  while (true) {
    await sleep('1 day');
    await runDailySnapshot();
  }
}
