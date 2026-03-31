import * as appInsights from "applicationinsights";

appInsights
  .setup()
  .setAutoCollectRequests(true)
  .setAutoCollectPerformance(true, true)
  .setAutoCollectExceptions(true)
  .setAutoCollectDependencies(true)
  .setAutoCollectConsole(true, false)
  .setAutoCollectPreAggregatedMetrics(true)
  .setSendLiveMetrics(false)
  .start();
