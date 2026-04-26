// Dystoppia v2 — full infrastructure deployment
// Target resource group: rg-dystoppia-v2
//
// What this creates:
//   - Azure Container Registry (dystoppiaacr)
//   - PostgreSQL Flexible Server (psql-shared-bsall) + database (db_dystoppia)
//   - App Service Plan (asp-dystoppia-v2) B2 Linux
//   - Web App for Containers with system-assigned managed identity
//   - Access policy on kv-bsall-shared (cross-RG) for the managed identity
//   - Log Analytics workspace + Application Insights
//
// All sensitive app settings are Key Vault references to kv-bsall-shared.
// The DYSTOPPIA-DATABASE-URL secret must be seeded by deploy-v2.sh before
// this template runs (it needs the PG password, which is a secure param here).

@description('App Service name')
param appName string = 'dystoppia-v2-app'

@description('App Service Plan name')
param planName string = 'asp-dystoppia-v2'

@description('Azure Container Registry name (globally unique, lowercase alphanumeric)')
param acrName string = 'dystoppiaacr'

@description('Image tag to deploy')
param imageTag string = 'latest'

@description('PostgreSQL flexible server name (globally unique)')
param pgServerName string = 'psql-shared-bsall'

@description('PostgreSQL admin username')
param pgAdminUser string = 'pgadmin'

@description('PostgreSQL admin password — must match the value in DYSTOPPIA-DATABASE-URL secret')
@secure()
param pgAdminPassword string

@description('Database name')
param pgDatabaseName string = 'db_dystoppia'

@description('Shared Key Vault name (in rg-shared-credentials)')
param sharedKvName string = 'kv-bsall-shared'

@description('Resource group containing the shared Key Vault')
param sharedKvRg string = 'rg-shared-credentials'

@description('Public base URL used by Stripe redirects and CORS')
param nextPublicAppUrl string = 'https://${appName}.azurewebsites.net'

param location string = resourceGroup().location

// ── Container Registry ────────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

var acrLoginServer = acr.properties.loginServer
var acrAdminPassword = acr.listCredentials().passwords[0].value

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: pgServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 35, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

// Allow all Azure-internal services (0.0.0.0–0.0.0.0 is the Azure services rule)
resource pgFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: pgServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: pgServer
  name: pgDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.UTF8'
  }
}

// ── App Service Plan ──────────────────────────────────────────────────────────

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: { name: 'S1', tier: 'Standard' }
  kind: 'linux'
  properties: { reserved: true }
}

// ── Monitoring (Log Analytics + App Insights) ─────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-dystoppia-v2'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-dystoppia-v2'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

// ── Web App for Containers ────────────────────────────────────────────────────

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/dystoppia:${imageTag}'
      alwaysOn: true
      http20Enabled: true
      appSettings: [
        { name: 'WEBSITES_PORT',                           value: '8080' }
        { name: 'NODE_ENV',                                value: 'production' }
        { name: 'FAIL_ON_MIGRATE',                         value: '1' }
        { name: 'NEXT_PUBLIC_APP_URL',                     value: nextPublicAppUrl }
        { name: 'DOCKER_REGISTRY_SERVER_URL',              value: 'https://${acrLoginServer}' }
        { name: 'DOCKER_REGISTRY_SERVER_USERNAME',         value: acrName }
        { name: 'DOCKER_REGISTRY_SERVER_PASSWORD',         value: acrAdminPassword }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING',   value: appInsights.properties.ConnectionString }
        // All secrets are KV references — never stored as plain text
        { name: 'DATABASE_URL',                   value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-DATABASE-URL)' }
        { name: 'ANTHROPIC_API_KEY',              value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-ANTHROPIC-API-KEY)' }
        { name: 'OPENAI_API_KEY',                 value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-OPENAI-API-KEY)' }
        { name: 'COOKIE_SECRET',                  value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-COOKIE-SECRET)' }
        { name: 'AZURE_COMM_CONNECTION_STRING',   value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-AZURE-COMM-CONNECTION-STRING)' }
        { name: 'AZURE_SPEECH_KEY',               value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-AZURE-SPEECH-KEY)' }
        { name: 'AZURE_SPEECH_REGION',            value: '@Microsoft.KeyVault(VaultName=${sharedKvName};SecretName=DYSTOPPIA-AZURE-SPEECH-REGION)' }
        { name: 'AZURE_COMM_FROM_ADDRESS',        value: 'DoNotReply@ba0edab7-f474-4ace-a484-cb8557f76020.azurecomm.net' }
      ]
    }
  }
}

// ── KV access policy — cross-RG module ───────────────────────────────────────
// Grants the web app's managed identity get/list on kv-bsall-shared

module kvAccessPolicy 'modules/kv-access-policy.bicep' = {
  name: 'kvAccessPolicy'
  scope: resourceGroup(sharedKvRg)
  params: {
    kvName: sharedKvName
    principalId: appService.identity.principalId
    tenantId: subscription().tenantId
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output appUrl              string = 'https://${appService.properties.defaultHostName}'
output acrLoginServer      string = acrLoginServer
output pgServerFqdn        string = pgServer.properties.fullyQualifiedDomainName
output appPrincipalId      string = appService.identity.principalId
output appInsightsKey      string = appInsights.properties.ConnectionString
