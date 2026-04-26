// Grants an Azure managed identity get/list access to a Key Vault
// that lives in a different resource group.
// Deploy this module scoped to the KV's resource group.

@description('Name of the existing Key Vault')
param kvName string

@description('Object ID of the managed identity to grant access to')
param principalId string

@description('Tenant ID of the subscription')
param tenantId string

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: kvName
}

resource kvPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: kv
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: principalId
        permissions: {
          secrets: [ 'get', 'list' ]
        }
      }
    ]
  }
}
