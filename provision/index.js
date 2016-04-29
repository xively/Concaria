'use strict'

require('dotenv').config({ silent: true })

const path = require('path')
const _ = require('lodash')
const logger = require('winston')
const blueprint = require('./blueprint')
const salesforce = require('../server/salesforce')
const database = require('../server/database')
const config = require('../config/provision')

const createAccountUser = () => {
  const salesforceUser = process.env.SALESFORCE_USER
  const account = {
    accountId: process.env.XIVELY_ACCOUNT_ID
  }

  if (!salesforceUser) {
    return blueprint.createAccountUsers([account])
  }

  return salesforce.getUserEmail().then((idmUserEmail) => {
    Object.assign(account, {
      createIdmUser: true,
      idmUserEmail
    })

    return blueprint.createAccountUsers([account])
  })
}

blueprint.getJwt()
.then(() => {
  return Promise.all([
    blueprint.createOrganizationTemplates(config.organizationTemplates),
    blueprint.createDeviceTemplates(config.deviceTemplates),
    blueprint.createEndUserTemplates(config.endUserTemplates),
    createAccountUser()
  ])
})
.then((arr) => ({
  organizationTemplates: arr[0],
  deviceTemplates: arr[1],
  endUserTemplates: arr[2]
}))
.then((data) => {
  const organizationTemplates = data.organizationTemplates
  const deviceTemplates = data.deviceTemplates

  config.organizations = config.organizations.map((organization) => Object.assign({
    organizationTemplateId: _.find(organizationTemplates, { name: organization.organizationTemplate }).id
  }, organization))

  config.channelTemplates = config.channelTemplates.map((channelTemplate) => Object.assign({
    entityId: _.find(deviceTemplates, { name: channelTemplate.deviceTemplate }).id
  }, channelTemplate))

  config.deviceFields = config.deviceFields.map((deviceFields) => Object.assign({
    deviceTemplateId: _.find(deviceTemplates, { name: deviceFields.deviceTemplate }).id
  }, deviceFields))

  return Promise.all([
    blueprint.createOrganizations(config.organizations),
    blueprint.createChannelTemplates(config.channelTemplates),
    blueprint.createDeviceFields(config.deviceFields)
  ])
  .then((arr) => Object.assign({
    organizations: arr[0],
    channelTemplates: arr[1],
    deviceFields: arr[2]
  }, data))
})
.then((data) => {
  const organizations = data.organizations
  const organizationTemplates = data.organizationTemplates
  const endUserTemplates = data.endUserTemplates
  const deviceTemplates = data.deviceTemplates

  config.endUsers = config.endUsers.map((endUser) => Object.assign({
    organizationId: _.find(organizations, { name: endUser.organization }).id,
    organizationTemplateId: _.find(organizationTemplates, { name: endUser.organizationTemplate }).id,
    endUserTemplateId: _.find(endUserTemplates, { name: endUser.endUserTemplate }).id
  }, endUser))

  config.devices = config.devices.map((device) => Object.assign({
    deviceTemplateId: _.find(deviceTemplates, { name: device.deviceTemplate }).id,
    organizationId: _.find(organizations, { name: device.organization }).id
  }, device))

  return Promise.all([
    blueprint.createEndUser(config.endUsers),
    blueprint.createDevices(config.devices)
  ])
  .then((arr) => Object.assign({
    endUsers: arr[0],
    devices: arr[1]
  }, data))
})
.then((data) => {
  const devices = data.devices.map((device) => ({
    entityId: device.id,
    entityType: 'device'
  }))

  const endUsers = data.endUsers.map((endUser) => ({
    entityId: endUser.id,
    entityType: 'endUser'
  }))

  const entities = devices.concat(endUsers)

  return Promise.all([
    blueprint.createMqttCredentials(entities)
  ])
  .then((arr) => Object.assign({
    mqttCredentials: arr[0]
  }, data))
})
.then((data) => {
  const tableScript = path.join(__dirname, 'tables.sql')

  return database.runScriptFile(tableScript)
    .then(() => {
      logger.info('Inserting: firmwares')
      return Promise.all(data.devices.map((device) => {
        const mqttCredentials = data.mqttCredentials.find((mqttCredential) => mqttCredential.entityId === device.id)

        const firmware = {
          name: device.name,
          serialNumber: device.serialNumber,
          deviceId: device.id,
          template: data.deviceTemplates.find((deviceTemplate) => deviceTemplate.id === device.deviceTemplateId),
          organizationId: device.organizationId,
          accountId: mqttCredentials.accountId,
          entityId: mqttCredentials.entityId,
          entityType: mqttCredentials.entityType,
          secret: mqttCredentials.secret
        }

        return database.insertInventory({ serial: firmware.serial })
          .then((rows) => {
            firmware.id = rows[0].id
            return database.insertFirmware(firmware)
          })
      }))
    })
    .then(() => {
      logger.info('Inserting: application configs')
      return Promise.all(data.endUsers.map((endUser) => {
        const appConfig = {
          endUser,
          accountId: process.env.XIVELY_ACCOUNT_ID,
          organization: data.organizations.find((organization) => organization.id === endUser.organizationId),
          mqttUser: data.mqttCredentials.find((mqttCredential) => mqttCredential.entityId === endUser.id)
        }
        return database.insertApplicationConfig(appConfig)
      }))
    })
})
.then(() => {
  console.log('Provision done')
  process.exit()
})
.catch((err) => {
  console.error('Provision error', err, err.obj && err.obj.error.details)
  process.exit(1)
})
