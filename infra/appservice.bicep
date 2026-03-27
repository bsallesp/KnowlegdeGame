@description('App Service name')
param appName string = 'dystoppia-prod-app'

@description('App Service Plan name')
param planName string = 'asp-dystoppia-prod'

@description('ACR login server')
param acrLoginServer string = 'dystoppiaacr.azurecr.io'

@description('ACR admin username')
param acrUsername string = 'dystoppiaacr'

@description('ACR admin password')
@secure()
param acrPassword string

@description('Image tag to deploy')
param imageTag string = 'latest'

@description('Key Vault name')
param keyVaultName string = 'kv-dystoppia-prod'

param location string = resourceGroup().location

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' existing = {
  name: planName
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acrLoginServer}/dystoppia:${imageTag}'
      alwaysOn: true
      http20Enabled: true
      appSettings: [
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_URL'
          value: 'https://${acrLoginServer}'
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_USERNAME'
          value: acrUsername
        }
        {
          name: 'DOCKER_REGISTRY_SERVER_PASSWORD'
          value: acrPassword
        }
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=DATABASE-URL)'
        }
        {
          name: 'ANTHROPIC_API_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=ANTHROPIC-API-KEY)'
        }
        {
          name: 'OPENAI_API_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=OPENAI-API-KEY)'
        }
        {
          name: 'AZURE_COMM_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=AZURE-COMM-CONNECTION-STRING)'
        }
        {
          name: 'AZURE_SPEECH_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=AZURE-SPEECH-KEY)'
        }
        {
          name: 'AZURE_SPEECH_REGION'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=AZURE-SPEECH-REGION)'
        }
        {
          name: 'COOKIE_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=COOKIE-SECRET)'
        }
      ]
    }
    httpsOnly: true
  }
}

output appUrl string = 'https://${appService.properties.defaultHostName}'
