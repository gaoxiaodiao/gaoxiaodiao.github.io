(function () {
  'use strict';

  var root = document.getElementById('hexo-blog-encrypt-partial');
  if (!root) {
    return;
  }

  var cryptoObject = window.crypto || window.msCrypto;
  if (!cryptoObject || !cryptoObject.subtle) {
    return;
  }

  var knownPrefix = '<hbe-prefix></hbe-prefix>';
  var keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
  var ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');
  var dataElement = document.querySelector('.hbe-partial-data');
  var input = document.getElementById('hbePartialPass');
  var unlockButton = root.querySelector('.hbe-partial-unlock-button');
  var wrongPassMessage = root.getAttribute('data-hbe-wpm');
  var wrongHashMessage = root.getAttribute('data-hbe-whm');
  var relockMessage = root.getAttribute('data-hbe-relock') || '重新加密';
  var rawScope = root.getAttribute('data-hbe-scope') || ('post:' + window.location.pathname);
  var scopedStorageName = 'hexo-blog-encrypt:' + rawScope;
  var postStorageName = 'hexo-blog-encrypt:#' + window.location.pathname;
  var encryptedData = dataElement ? dataElement.textContent.trim() : '';
  var hmacDigest = dataElement ? dataElement.getAttribute('data-hmacdigest') : '';
  var unlocked = false;
  var storage = getStorage();

  if (!dataElement || !encryptedData || !hmacDigest) {
    return;
  }

  function getStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function textToArray(value) {
    var bytes = [];

    for (var index = 0; index < value.length;) {
      var codePoint = value.codePointAt(index);
      if (codePoint < 128) {
        bytes.push(codePoint);
        index += 1;
      } else if (codePoint < 2048) {
        bytes.push((codePoint >> 6) | 192);
        bytes.push((codePoint & 63) | 128);
        index += 1;
      } else if (codePoint < 65536) {
        bytes.push((codePoint >> 12) | 224);
        bytes.push(((codePoint >> 6) & 63) | 128);
        bytes.push((codePoint & 63) | 128);
        index += 1;
      } else {
        bytes.push((codePoint >> 18) | 240);
        bytes.push(((codePoint >> 12) & 63) | 128);
        bytes.push(((codePoint >> 6) & 63) | 128);
        bytes.push((codePoint & 63) | 128);
        index += 2;
      }
    }

    return new Uint8Array(bytes);
  }

  function hexToArray(value) {
    var pairs = value.match(/[\da-f]{2}/gi);
    if (!pairs || pairs.join('').length !== value.length) {
      throw new Error('Invalid hexadecimal value.');
    }
    return new Uint8Array(pairs.map(function (pair) {
      return parseInt(pair, 16);
    }));
  }

  function arrayBufferToHex(arrayBuffer) {
    var view = new Uint8Array(arrayBuffer);
    var result = '';

    for (var index = 0; index < view.length; index += 1) {
      var value = view[index].toString(16);
      result += value.length === 1 ? '0' + value : value;
    }
    return result;
  }

  function getKeyMaterial(password) {
    return cryptoObject.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey', 'deriveBits']
    );
  }

  function getHmacKey(keyMaterial) {
    return cryptoObject.subtle.deriveKey({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: keySalt.buffer,
      iterations: 1024,
    }, keyMaterial, {
      name: 'HMAC',
      hash: 'SHA-256',
      length: 256,
    }, true, ['verify']);
  }

  function getDecryptKey(keyMaterial) {
    return cryptoObject.subtle.deriveKey({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: keySalt.buffer,
      iterations: 1024,
    }, keyMaterial, {
      name: 'AES-CBC',
      length: 256,
    }, true, ['decrypt']);
  }

  function getIv(keyMaterial) {
    return cryptoObject.subtle.deriveBits({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: ivSalt.buffer,
      iterations: 512,
    }, keyMaterial, 16 * 8);
  }

  function importStoredKeys(storedData) {
    return Promise.all([
      cryptoObject.subtle.importKey(
        'jwk',
        storedData.dk,
        { name: 'AES-CBC', length: 256 },
        true,
        ['decrypt']
      ),
      Promise.resolve(hexToArray(storedData.iv).buffer),
      cryptoObject.subtle.importKey(
        'jwk',
        storedData.hmk,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        true,
        ['verify']
      ),
    ]);
  }

  function decodePayload(decryptKey, iv, hmacKey) {
    return cryptoObject.subtle.decrypt({
      name: 'AES-CBC',
      iv: iv,
    }, decryptKey, hexToArray(encryptedData).buffer).then(function (result) {
      var decoded = new TextDecoder().decode(result);
      if (!decoded.startsWith(knownPrefix)) {
        throw new Error('Decrypted content has no known prefix.');
      }

      return cryptoObject.subtle.verify({
        name: 'HMAC',
        hash: 'SHA-256',
      }, hmacKey, hexToArray(hmacDigest), new TextEncoder().encode(decoded)).then(function (verified) {
        if (!verified) {
          var hashError = new Error('Encrypted content failed HMAC verification.');
          hashError.code = 'HBE_HASH_MISMATCH';
          throw hashError;
        }

        var payload = JSON.parse(decoded.slice(knownPrefix.length));
        if (payload.version !== 1 || !Array.isArray(payload.fragments)) {
          var formatError = new Error('Unsupported partial encryption payload.');
          formatError.code = 'HBE_HASH_MISMATCH';
          throw formatError;
        }
        return payload;
      });
    });
  }

  function reviveScripts(container) {
    Array.prototype.slice.call(container.querySelectorAll('script')).forEach(function (oldScript) {
      var newScript = document.createElement('script');
      Array.prototype.slice.call(oldScript.attributes).forEach(function (attribute) {
        newScript.setAttribute(attribute.name, attribute.value);
      });
      newScript.text = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  function refreshLazyImages(container) {
    Array.prototype.slice.call(container.querySelectorAll('img')).forEach(function (image) {
      if (image.getAttribute('data-src') && !image.getAttribute('src')) {
        image.setAttribute('src', image.getAttribute('data-src'));
      }
    });
  }

  function insertFragments(payload) {
    var slots = Array.prototype.slice.call(
      document.querySelectorAll('.hbe-partial-slot[data-hbe-slot]')
    );
    var slotsByIndex = {};

    if (slots.length !== payload.fragments.length) {
      throw new Error('Encrypted fragment count does not match page slots.');
    }

    slots.forEach(function (slot) {
      var index = Number(slot.getAttribute('data-hbe-slot'));
      if (
        !Number.isInteger(index) ||
        typeof payload.fragments[index] !== 'string' ||
        Object.prototype.hasOwnProperty.call(slotsByIndex, index)
      ) {
        throw new Error('Invalid encrypted fragment index.');
      }
      slotsByIndex[index] = slot;
    });

    payload.fragments.forEach(function (fragment, index) {
      if (!Object.prototype.hasOwnProperty.call(slotsByIndex, index)) {
        throw new Error('Encrypted fragment has no matching page slot.');
      }
    });

    payload.fragments.forEach(function (fragment, index) {
      var slot = slotsByIndex[index];
      slot.innerHTML = fragment;
    });

    payload.fragments.forEach(function (fragment, index) {
      var slot = slotsByIndex[index];
      reviveScripts(slot);
      refreshLazyImages(slot);
    });

    var relockButton = document.createElement('button');
    relockButton.type = 'button';
    relockButton.className = 'hbe-button hbe-partial-relock-button';
    relockButton.textContent = relockMessage;
    relockButton.addEventListener('click', function () {
      removeStoredValue(scopedStorageName);
      if (postStorageName !== scopedStorageName) {
        removeStoredValue(postStorageName);
      }
      window.location.reload();
    });
    root.appendChild(relockButton);

    unlocked = true;
    document.dispatchEvent(new CustomEvent('hbe:partial-decrypted', {
      detail: {
        fragmentCount: payload.fragments.length,
        scope: rawScope,
      },
    }));
  }

  function readStoredValue(key) {
    if (!storage) {
      return null;
    }
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStoredValue(key, value) {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(key, value);
    } catch (error) {
      // Decryption still succeeds when storage is unavailable or full.
    }
  }

  function removeStoredValue(key, expectedValue) {
    if (!storage) {
      return;
    }
    try {
      if (expectedValue === undefined || storage.getItem(key) === expectedValue) {
        storage.removeItem(key);
      }
    } catch (error) {
      // Ignore unavailable storage.
    }
  }

  function storeKeys(decryptKey, iv, hmacKey) {
    if (!storage) {
      return Promise.resolve();
    }

    return Promise.all([
      cryptoObject.subtle.exportKey('jwk', decryptKey),
      cryptoObject.subtle.exportKey('jwk', hmacKey),
    ]).then(function (keys) {
      var value = JSON.stringify({
        dk: keys[0],
        iv: arrayBufferToHex(iv),
        hmk: keys[1],
      });

      writeStoredValue(scopedStorageName, value);
      if (postStorageName !== scopedStorageName) {
        writeStoredValue(postStorageName, value);
      }
    });
  }

  function attemptWithKeys(keys, options) {
    return decodePayload(keys[0], keys[1], keys[2]).then(function (payload) {
      insertFragments(payload);
      return true;
    }).catch(function (error) {
      if (options && options.alertOnFailure) {
        window.alert(error && error.code === 'HBE_HASH_MISMATCH' ? wrongHashMessage : wrongPassMessage);
      }
      return false;
    });
  }

  function tryStoredKeys() {
    if (!storage) {
      return Promise.resolve(false);
    }

    var names = scopedStorageName === postStorageName
      ? [scopedStorageName]
      : [scopedStorageName, postStorageName];

    return names.reduce(function (promise, name) {
      return promise.then(function (success) {
        if (success) {
          return true;
        }

        var rawValue = readStoredValue(name);
        if (!rawValue) {
          return false;
        }

        var storedData;
        try {
          storedData = JSON.parse(rawValue);
        } catch (error) {
          removeStoredValue(name, rawValue);
          return false;
        }

        return importStoredKeys(storedData).then(function (keys) {
          return attemptWithKeys(keys, { alertOnFailure: false });
        }).then(function (result) {
          if (result) {
            writeStoredValue(scopedStorageName, rawValue);
            if (postStorageName !== scopedStorageName) {
              writeStoredValue(postStorageName, rawValue);
            }
          } else {
            removeStoredValue(name, rawValue);
          }
          return result;
        }).catch(function () {
          removeStoredValue(name, rawValue);
          return false;
        });
      });
    }, Promise.resolve(false));
  }

  function cleanPassword() {
    if (!input) {
      return '';
    }
    var cleanValue = String(input.value).trim();
    if (input.value !== cleanValue) {
      input.value = cleanValue;
    }
    return cleanValue;
  }

  function unlockWithPassword() {
    if (unlocked || !input) {
      return Promise.resolve(false);
    }

    var password = cleanPassword();
    if (!password) {
      return Promise.resolve(false);
    }

    input.disabled = true;
    if (unlockButton) {
      unlockButton.disabled = true;
    }

    return getKeyMaterial(password).then(function (keyMaterial) {
      return Promise.all([
        getDecryptKey(keyMaterial),
        getIv(keyMaterial),
        getHmacKey(keyMaterial),
      ]);
    }).then(function (keys) {
      return attemptWithKeys(keys, { alertOnFailure: true }).then(function (success) {
        if (!success) {
          return false;
        }
        return storeKeys(keys[0], keys[1], keys[2]).then(function () {
          return true;
        });
      });
    }).catch(function () {
      window.alert(wrongPassMessage);
      return false;
    }).finally(function () {
      if (!unlocked && input) {
        input.disabled = false;
        input.focus();
      }
      if (!unlocked && unlockButton) {
        unlockButton.disabled = false;
      }
    });
  }

  if (input) {
    input.addEventListener('keydown', function (event) {
      if (!event.isComposing && (event.key === 'Enter' || event.keyCode === 13)) {
        event.preventDefault();
        unlockWithPassword();
      }
    });
    input.addEventListener('paste', function () {
      window.setTimeout(cleanPassword, 0);
    });
    input.addEventListener('blur', cleanPassword);
  }

  if (unlockButton) {
    unlockButton.addEventListener('click', unlockWithPassword);
  }

  tryStoredKeys();
}());
