'use strict';

var template = require('./template.tmpl');

module.exports = function() {
  return {
    restrict: 'C',
    template: template,
    scope: {
      mode: '=',
    }
  };
};
