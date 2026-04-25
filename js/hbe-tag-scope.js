(function () {
  'use strict';

  var container = document.getElementById('hexo-blog-encrypt');
  var storage = window.localStorage;

  if (!container || !storage) {
    return;
  }

  var rawScope = container.getAttribute('data-hbe-scope') || ('post:' + window.location.pathname);
  var scopedStorageName = 'hexo-blog-encrypt:' + rawScope;
  var postStorageName = 'hexo-blog-encrypt:#' + window.location.pathname;

  if (scopedStorageName === postStorageName) {
    return;
  }

  var scopedData = storage.getItem(scopedStorageName);
  var postData = storage.getItem(postStorageName);

  if (scopedData && !postData) {
    storage.setItem(postStorageName, scopedData);
  } else if (postData && !scopedData && rawScope.indexOf('tag:') === 0) {
    storage.setItem(scopedStorageName, postData);
  }

  window.__hbeStorageAliases = window.__hbeStorageAliases || {};
  window.__hbeStorageAliases[postStorageName] = scopedStorageName;

  if (window.__hbeTagScopeStoragePatched) {
    return;
  }

  window.__hbeTagScopeStoragePatched = true;

  var originalSetItem = Storage.prototype.setItem;
  var originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (key, value) {
    var result = originalSetItem.apply(this, arguments);
    var aliases = window.__hbeStorageAliases || {};

    if (this === window.localStorage && aliases[key] && aliases[key] !== key) {
      originalSetItem.call(this, aliases[key], value);
    }

    return result;
  };

  Storage.prototype.removeItem = function (key) {
    var result = originalRemoveItem.apply(this, arguments);
    var aliases = window.__hbeStorageAliases || {};

    if (this === window.localStorage && aliases[key] && aliases[key] !== key) {
      originalRemoveItem.call(this, aliases[key]);
    }

    return result;
  };
}());
