var _ = require("lodash");
var path = require("path");
var Bacon = require("baconjs");
var nodegit = require("nodegit");
var colors = require("colors");

var Logger = require("../logger.js");

var AppConfig = require("../models/app_configuration.js");
var Notification = require("../models/notification.js");
var Organisation = require("../models/organisation.js");
var User = require("../models/user.js");

var notifs = module.exports;

var getOrgaIdOrUserId = function(api, orgIdOrName) {
  if(!orgIdOrName) {
    return User.getCurrentId(api);
  } else {
    return Organisation.getId(api, orgIdOrName);
  }
}

var getOwnerAndApp = function(api, params, useLinkedApp) {
  var alias = params.options.alias;


  if(!useLinkedApp) {
    return getOrgaIdOrUserId(api, params.options.org).map(function(ownerId) {
      return {ownerId: ownerId};
    });
  } else {
    return AppConfig.getAppData(alias).flatMapLatest(function(appData) {
      if(appData.org_id) {
        return {ownerId: appData.org_id, appId: appData.app_id}
      } else {
        return User.getCurrentId(api).map(function(id) {
          return {ownerId: id, appId: appData.app_id};
        });
      }
    });
  }

}


var list = notifs.list = function(api, params) {
  var listAll = params.options["list-all"];
  var s_ownerAndApp = getOwnerAndApp(api, params, !listAll);
  var s_hooks = s_ownerAndApp.flatMapLatest(function(ownerAndApp) {
    return Notification.list(api, ownerAndApp.ownerId, ownerAndApp.appId);
  });

  s_hooks.onValue(function(hooks) {
    hooks.forEach(function(hook) {
      Logger.println(hook.name && hook.name.bold || hook.id);
      Logger.println("  id: " + hook.id);
      Logger.println("  services: " + (hook.scope && hook.scope.join(", ") || hook.ownerId));
      Logger.println("  events: " + (hook.events && hook.events.join(", ") || "ALL".bold));
      Logger.println("  hooks:")
      hook.urls.forEach(function(url) {
        Logger.println("    " + url.url + " (" + url.format + ")");
      });
      Logger.println();
    });
  });
  s_hooks.onError(Logger.error);
};

var add = notifs.add = function(api, params) {
  var format = params.options.format;
  var event = params.options.event;
  var event_types = event ? event.split(',') : null;
  var service = params.options.service;
  var services = service ? service.split(',') : null;

  var name = params.args[0];
  var hookUrl = params.args[1];

  var s_ownerAndApp = getOwnerAndApp(api, params, !params.options.org && !services);
  var s_results = s_ownerAndApp.flatMapLatest(function(ownerAndApp) {
    if(ownerAndApp.appId) {
      services = services || [ownerAndApp.appId];
    }
    var url = {
      format: format,
      url: hookUrl
    };
    return Notification.add(api, ownerAndApp.ownerId, name, [url], services, event_types);
  });

  s_results.onValue(function() {
    Logger.println("The notification has been added")
  });
  s_results.onError(Logger.error);
};

var remove = notifs.remove = function(api, params) {
  var notificationId = params.args[0];

  var s_ownerId = getOrgaIdOrUserId(api, params.options.org);
  var s_results = s_ownerId.flatMapLatest(function(ownerId) {
    return Notification.remove(api, ownerId, notificationId);
  });

  s_results.onValue(function() {
    Logger.println("The notification has been sucessfully removed");
  });
  s_results.onError(Logger.error);
};

