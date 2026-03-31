@description('Existing App Service name (Linux container)')
param webAppName string = 'dystoppia-prod-app'

@description('Log Analytics workspace name')
param logAnalyticsName string = 'law-dystoppia-prod'

@description('Application Insights component name')
param appInsightsName string = 'appi-dystoppia-prod'

param location string = resourceGroup().location

resource webApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: webAppName
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-law'
  scope: webApp
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceAppLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

@description('Set on App Service as APPLICATIONINSIGHTS_CONNECTION_STRING')
output connectionString string = appInsights.properties.ConnectionString
output logAnalyticsWorkspaceId string = logAnalytics.id
output appInsightsId string = appInsights.id
