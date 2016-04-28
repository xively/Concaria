const _ = require('lodash')

const shareIcon = require('./images/share-icon.svg')
const rulesIcon = require('../navigation/images/rules-icon.svg')
const settingsIcon = require('../navigation/images/settings-icon.svg')
const xiLogo = require('./images/xi-logo.svg')
const xivelyLogo = require('./images/xively-logo.png')
const xivelyLogoSimple = require('./images/xively-logo-simple.png')
const chevronLeft = require('./images/chevron-left.svg')
const chevronRight = require('./images/chevron-right.svg')

require('./device-demo.route.less')

/* @ngInject */
function deviceDemoRoute ($stateProvider) {
  $stateProvider.state('devices.device-demo', {
    url: '/:id/demo?header',
    template: `
      <div class="device-demo">
        <div class="left-side" ng-show="demo.mobileView">
          <div class="chevron-left" ng-click="demo.toggleMobileView()" ng-show="demo.mobileView"> ${chevronLeft} </div>
          <iphone-frame>
            <notification></notification>
            <div class="iphone-frame-scrollable">
              <div class="navigation-header">
                <div class="logo">
                  <img src="${xivelyLogoSimple}"></img>
                  <div>Product Simulator</div>
                </div>
              </div>
              <div class="icons">
                <a class="share" ng-click="demo.toggleShareModal()"> ${shareIcon} </a>
              </div>
              <device-panel device="demo.device"></device-panel>
            </div>
            <share-modal link="demo.shareLink" toggle="demo.toggleShareModal()" ng-show="demo.shareModal"></share-modal>
            <boldchat></boldchat>
          </iphone-frame>
        </div>
        <div class="right-side">
          <div class="navigation">
            <div class="navigation-container">
              <div class="navigation-dropdown">
                <select
                  ng-model="demo.navigation.selectedOption"
                  ng-change="demo.navigation.selectedOption.navigate()"
                  ng-options="deviceLink.name for deviceLink in demo.navigation.availableOptions track by deviceLink.device.deviceTemplateId">
                </select>
                <div class="simulate-button" ng-click="demo.toggleSimulation()">
                  {{ demo.device.simulate ? 'Stop' : 'Start' }} simulation
                </div>
              </div>
              <div class="navigation-items">
                <div class="navigation-item" ui-sref="rules" ui-sref-active="active">
                  <span class="navigation-item-icon">${rulesIcon}</span>
                  <span class="navigation-item-text">Rules</span>
                </div>
                <div class="navigation-item" ui-sref="settings" ui-sref-active="active">
                  <span class="navigation-item-icon">${settingsIcon}</span>
                  <span class="navigation-item-text">Settings</span>
                </div>
                <a class="navigation-item logo" href="{{ demo.cpmLink }}" target="_blank">
                  <span class="navigation-item-icon">${xiLogo}</span>
                  <span class="navigation-item-text">CPM</span>
                </a>
              </div>
            </div>
          </div>
          <div class="device-controls">
            <div class="chevron-right" ng-click="demo.toggleMobileView()" ng-show="!demo.mobileView"> ${chevronRight} </div>
            <div class="device-header">
              <div class="device-serial">
                {{ ::demo.device.serialNumber }}
              </div>
              <div class="xively-logo">
                <div class="powered-by">Powered by</div>
                <img src="${xivelyLogo}"></img>
              </div>
            </div>
            <div class="device-container" style="width: {{ ::demo.config.width }}px" ng-if="demo.config.image">
              <div ng-repeat="(name, sensor) in ::demo.config.sensors">
                <tooltip ng-if="sensor.tooltip"
                  options="sensor"
                  label="name"
                  value="demo.device.sensors[name].numericValue"
                  update="demo.update(name, value)"
                  device="demo.device">
                </tooltip>
                <div ng-if="sensor.widget" bind-html-compile="demo.getHtml(sensor.widget)"></div>
              </div>
              <img class="device-image" src="{{ demo.config.image }}" />
            </div>
            <div class="no-image" ng-if="!demo.config.image">
              <h2>No image available</h2>
            </div>
            <div class="device-control-sliders" ng-if="demo.sensorsNotConfigured.length">
              <div class="header row">
                <div class="channel-name">Channel name</div>
                <div class="control">Control</div>
                <div class="value">Value</div>
              </div>
              <div class="row" ng-repeat="(name, sensor) in demo.device.sensors" ng-if="demo.sensorsNotConfigured.indexOf(name) > -1">
                <div class="channel-name">{{ name }}</div>
                <div class="control">
                  <input type="range" min="0" max="100" ng-model="demo.sensors[name]" ng-change="demo.update(name, demo.sensors[name])" ng-disabled="!demo.device.ok">
                </div>
                <div class="value">
                  {{ demo.sensors[name] }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    controllerAs: 'demo',
    resolve: {
      /* @ngInject */
      templates (devicesService) {
        return devicesService.getDeviceTemplates()
      },
      /* @ngInject */
      device ($stateParams, $state, devicesService) {
        const id = $stateParams.id
        return devicesService.getDevice(id)
          .catch(() => $state.go('devices'))
      }
    },
    /* @ngInject */
    controller ($log, $scope, $rootScope, $state, $location, device, templates, devicesService, socketService, DEVICES_CONFIG, CONFIG, EVENTS) {
      device.template = templates[device.deviceTemplateId]
      this.config = DEVICES_CONFIG[device.template.name] || {}
      this.sensorsNotConfigured = _.pullAll(Object.keys(device.sensors), Object.keys(this.config.sensors || {}))
      this.sensors = this.sensorsNotConfigured.reduce((sensors, key) => {
        sensors[key] = 50
        return sensors
      }, {})
      $scope.$watch(() => device.sensors, (sensors) => {
        _.forEach(sensors, (sensor, name) => { this.sensors[name] = sensor.numericValue })
      }, true)
      this.device = device

      $scope.$watch(() => this.device.ok, (ok, wasOk) => {
        if (!ok) {
          $rootScope.$broadcast(EVENTS.NOTIFICATION, {
            type: 'error',
            text: 'Your device reported a mailfunction. Please stand by, our agents are already aware of the issue and will have a look at it very soon.',
            sticky: true
          })
        } else if (!wasOk && ok) {
          $rootScope.$broadcast(EVENTS.NOTIFICATION, {
            type: 'success',
            text: 'The device has been fixed.'
          })
        }
      })

      // template navigation options
      devicesService.getDevices().then((devices) => {
        const availableOptions = _.map((templates), (template, id) => ({
          name: template.name,
          device: _.find(devices, { deviceTemplateId: id }),
          navigate () {
            $state.go('devices.device-demo', { id: this.device.id })
          }
        })).filter((option) => option.device)

        const selectedOption = _.find(availableOptions, { name: device.template.name })

        this.navigation = {
          availableOptions,
          selectedOption
        }
      })

      // simulate
      this.toggleSimulation = () => {
        this.device.simulate = !this.device.simulate
        if (this.device.simulate) {
          socketService.startSimulation(device)
        } else {
          socketService.stopSimulation(device)
        }
      }

      $scope.$on('stopSimulation', () => {
        this.device.simulate = false
      })

      // update sensor value
      this.update = _.debounce(device.update, 100)

      // get html for a widget element
      this.getHtml = (widget) => {
        const { name, position } = widget
        return `<${name} device="demo.device" style="position: absolute; top: ${position.top}px; left: ${position.left}px"></${name}>`
      }

      this.shareLink = $location.absUrl().replace(/\/demo.*/, '?navigation=0')
      this.toggleShareModal = () => {
        this.shareModal = !this.shareModal
      }

      // FIXME workaround
      this.cpmLink = `https://${CONFIG.account.idmHost.replace('id.', 'app.')}/login?accountId=${CONFIG.account.accountId}`

      // toggle mobile visibility
      this.mobileView = true
      this.toggleMobileView = () => {
        this.mobileView = !this.mobileView
      }
    }
  })
}

module.exports = deviceDemoRoute
