@description('Globally unique Azure App Service name. Reuse the existing app name only when deploying into its current resource group.')
@minLength(2)
@maxLength(60)
param appName string

@description('Azure region for the Linux App Service plan.')
param location string = resourceGroup().location

@description('Existing or new App Service plan name.')
param planName string = '${appName}-plan'

@description('App Service plan SKU. B1 supports custom-domain preparation and always-on hosting.')
@allowed([
  'B1'
  'B2'
  'B3'
])
param skuName string = 'B1'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: {
    name: skuName
    tier: 'Basic'
    size: skuName
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/health'
    }
  }
}

output appName string = web.name
output defaultHostName string = web.properties.defaultHostName
output appUrl string = 'https://${web.properties.defaultHostName}'
output planName string = plan.name
