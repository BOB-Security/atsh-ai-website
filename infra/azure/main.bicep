@description('Globally unique Azure App Service name.')
@minLength(2)
@maxLength(60)
param appName string

@description('Azure region for the Linux App Service.')
param location string = resourceGroup().location

@description('Resource ID of the existing or newly created Linux App Service plan. The plan is not modified by this template.')
param serverFarmId string

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: serverFarmId
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
output appUrl string = 'https://\${web.properties.defaultHostName}'
output serverFarmId string = serverFarmId
