/**
 * Lovable Powerkits — license enforcement (client).
 * Requires an active PK- license validated by lov.powerkits.net before protected actions.
 */
(function () {
  var ASSERT_TTL_MS = 30000;
  var _assertCache = { at: 0, allowed: false };

  function pkApiBase() {
    return typeof POWERKITS_API_BASE !== "undefined" ? POWERKITS_API_BASE : "https://lov.powerkits.net";
  }

  function pkApiKey() {
    return typeof POWERKITS_API_KEY !== "undefined" ? POWERKITS_API_KEY : "";
  }

  function pkAssertSessionUrl() {
    return pkApiBase() + "/functions/v1/assert-session";
  }

  function pkLicenseHeaders(extra) {
    var h = typeof powerkitsApiHeaders === "function"
      ? powerkitsApiHeaders({ "Content-Type": "application/json" })
      : { apikey: pkApiKey(), "Content-Type": "application/json" };
    return Object.assign({}, h, extra || {});
  }

  function pkProxyFetch(url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        action: "proxyFetch",
        url: url,
        method: options.method || "POST",
        headers: options.headers || {},
        body: options.body || null
      }, function (resp) {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp) {
          return reject(new Error("No response from background. Reload the extension."));
        }
        if (!resp.ok) {
          var errText = (resp.data && (resp.data.message || resp.data.error || resp.data.error_display))
            || (resp.data && resp.data.raw)
            || ("Request failed (HTTP " + resp.status + ")");
          return reject(new Error(errText));
        }
        resolve(resp.data || {});
      });
    });
  }

  function pkInvalidateAssertCache() {
    _assertCache = { at: 0, allowed: false };
  }

  function pkReadLicenseStorage() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(
        ["ql_license_valid", "ql_license_key", "ql_session_id"],
        function (res) {
          resolve(res || {});
        }
      );
    });
  }

  function pkResolveDeviceId() {
    if (typeof getStableDeviceId === "function") {
      return getStableDeviceId();
    }
    if (typeof getDeviceId === "function") {
      return getDeviceId();
    }
    if (typeof getHardwareFingerprint === "function") {
      return getHardwareFingerprint();
    }
    return Promise.resolve("");
  }

  function pkLocalLicenseReady(stored) {
    if (typeof INTERNAL_LICENSE_MODE !== "undefined" && INTERNAL_LICENSE_MODE) {
      return true;
    }
    if (!stored || !stored.ql_license_valid) return false;
    if (typeof resolveTeamLicenseKey !== "function") return false;
    if (!resolveTeamLicenseKey(stored.ql_license_key)) return false;
    if (!stored.ql_session_id) return false;
    return true;
  }

  function pkRevokeLicenseStorage() {
    pkInvalidateAssertCache();
    if (typeof window.__pkSetCreditBypass === "function") {
      window.__pkSetCreditBypass(false);
    }
    return new Promise(function (resolve) {
      chrome.storage.local.remove([
        "ql_license_valid",
        "ql_license_key",
        "ql_session_id",
        "ql_user_name",
        "ql_expires_at",
        "ql_activated_at",
        "ql_license_status",
        "ql_validity_minutes"
      ], resolve);
    });
  }

  /**
   * @returns {{ lock: boolean, conflictCount: number, message?: string }}
   */
  function pkShouldLockoutFromValidation(data, conflictCount) {
    if (!data || data.valid) {
      return { lock: false, conflictCount: 0 };
    }
    if (typeof INTERNAL_LICENSE_MODE !== "undefined" && INTERNAL_LICENSE_MODE) {
      return { lock: false, conflictCount: 0 };
    }
    if (data.reason === "device_conflict") {
      conflictCount = (conflictCount || 0) + 1;
      if (conflictCount < 2) {
        return { lock: false, conflictCount: conflictCount };
      }
    }
    return {
      lock: true,
      conflictCount: conflictCount || 0,
      message: data.message || "License not active. Activate your PK- key in the side panel.",
      reason: data.reason || null
    };
  }

  /**
   * Server confirmation that PK- license + session are still active.
   * @param {boolean} force
   */
  function pkEnsureActiveLicense(force) {
    if (typeof INTERNAL_LICENSE_MODE !== "undefined" && INTERNAL_LICENSE_MODE) {
      return Promise.resolve({ allowed: true });
    }

    var now = Date.now();
    if (!force && _assertCache.allowed && (now - _assertCache.at) < ASSERT_TTL_MS) {
      return Promise.resolve({ allowed: true, cached: true });
    }

    return pkReadLicenseStorage().then(function (stored) {
      if (!pkLocalLicenseReady(stored)) {
        return pkRevokeLicenseStorage().then(function () {
          throw new Error("Activate your PK- license key first.");
        });
      }

      var licenseKey = resolveTeamLicenseKey(stored.ql_license_key);
      return pkResolveDeviceId().then(function (deviceId) {
        return pkProxyFetch(pkAssertSessionUrl(), {
          method: "POST",
          headers: pkLicenseHeaders(),
          body: JSON.stringify({
            license_key: licenseKey,
            session_id: stored.ql_session_id || "",
            device_id: deviceId || "",
            heartbeat: true
          })
        }).then(function (data) {
          var ok = data && (data.allowed === true || data.valid === true || data.active === true);
          if (ok) {
            _assertCache = { at: Date.now(), allowed: true };
            if (typeof pkLicenseStoragePatch === "function") {
              var patch = pkLicenseStoragePatch(data);
              if (data.user_name) patch.ql_user_name = data.user_name;
              if (data.plan) patch.ql_plan = data.plan;
              chrome.storage.local.set(patch);
            }
            return data;
          }
          if (typeof pkInvalidateAssertCache === "function") {
            pkInvalidateAssertCache();
          }
          var msg = (data && data.message) || "License not active.";
          var err = new Error(msg);
          err.pkReason = (data && data.reason) || "inactive";
          if (data && (data.reason === "revoked" || data.reason === "expired" || data.reason === "inactive" || data.force_logout)) {
            return pkRevokeLicenseStorage().then(function () { throw err; });
          }
          throw err;
        });
      });
    });
  }

  async function computeHmacSha256(secret, message) {
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(secret);
      const msgData = enc.encode(message);
      const cryptoObj = window.crypto || crypto;
      const key = await cryptoObj.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["sign"]
      );
      const signatureBuffer = await cryptoObj.subtle.sign("HMAC", key, msgData);
      const hashArray = Array.from(new Uint8Array(signatureBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.error("[Crypto] HMAC failed:", e);
      return "";
    }
  }

  /** Headers for storage upload (backend validates license). */
  function pkLicenseUploadHeaders(url, method, extra) {
    var reqMethod = method || "POST";
    return pkReadLicenseStorage().then(function (stored) {
      if (!pkLocalLicenseReady(stored)) {
        throw new Error("Activate your PK- license key first.");
      }
      return pkResolveDeviceId().then(function (deviceId) {
        return pkEnsureActiveLicense(false).then(async function () {
          var licenseKey = resolveTeamLicenseKey(stored.ql_license_key);
          var headers = Object.assign({}, extra || {}, {
            "x-license-key": licenseKey,
            "x-session-id": stored.ql_session_id || "",
            "x-device-id": deviceId || ""
          });

          // Add replay attack protection (nonce & timestamp)
          const cryptoObj = window.crypto || crypto;
          const nonce = Array.from(cryptoObj.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          const timestamp = new Date().toISOString();
          
          headers["x-nonce"] = nonce;
          headers["x-timestamp"] = timestamp;

          if (url && licenseKey) {
            // Binary uploads use empty body for signature matching
            var stringToSign = [reqMethod.toUpperCase(), url, timestamp, nonce, ""].join('|');
            var signature = await computeHmacSha256(licenseKey, stringToSign);
            if (signature) {
              headers["x-signature"] = signature;
            }
          }
          return headers;
        });
      });
    });
  }

  window.pkInvalidateAssertCache = pkInvalidateAssertCache;
  window.pkEnsureActiveLicense = pkEnsureActiveLicense;
  window.pkRevokeLicenseStorage = pkRevokeLicenseStorage;
  window.pkShouldLockoutFromValidation = pkShouldLockoutFromValidation;
  window.pkLicenseUploadHeaders = pkLicenseUploadHeaders;
  window.pkLocalLicenseReady = pkLocalLicenseReady;

  var _policyPollTimer = null;
  var POLICY_POLL_MS = 30000;

  function pkApplyPolicyUpdate(data) {
    if (!data) return;
    if (data.user_name) {
      chrome.storage.local.set({ ql_user_name: data.user_name });
    }
    if (data.plan) {
      chrome.storage.local.set({ ql_plan: data.plan });
    }
    if (typeof pkLicenseStoragePatch === "function") {
      chrome.storage.local.set(pkLicenseStoragePatch(data));
    }
    var nameEl = document.getElementById("sp-name");
    if (nameEl && data.user_name) nameEl.textContent = data.user_name;
  }

  function pkPollLicensePolicyOnce() {
    return pkReadLicenseStorage().then(function (stored) {
      if (!pkLocalLicenseReady(stored)) return;
      return pkResolveDeviceId().then(function (deviceId) {
        var base = pkApiBase();
        var token = encodeURIComponent(stored.ql_session_id || "");
        var dev = encodeURIComponent(deviceId || "");
        return pkProxyFetch(base + "/api/license/status?token=" + token + "&device_id=" + dev, {
          method: "GET",
          headers: pkLicenseHeaders()
        }).then(function (data) {
          if (data && data.valid && !data.force_logout) {
            pkApplyPolicyUpdate(data);
            return data;
          }
          if (data && (data.force_logout || data.valid === false)) {
            pkInvalidateAssertCache();
            var msg = data.message || "Your license was updated by an administrator.";
            return pkRevokeLicenseStorage().then(function () {
              if (typeof spHandleLicenseInvalid === "function") {
                spHandleLicenseInvalid({ reason: data.reason || "revoked", message: msg });
              }
              throw new Error(msg);
            });
          }
          return data;
        }).catch(function () { /* network blip — keep session */ });
      });
    });
  }

  function pkStartLicensePolicyPoll() {
    if (_policyPollTimer) return;
    pkPollLicensePolicyOnce();
    _policyPollTimer = setInterval(function () { pkPollLicensePolicyOnce(); }, POLICY_POLL_MS);
  }

  function pkStopLicensePolicyPoll() {
    if (_policyPollTimer) { clearInterval(_policyPollTimer); _policyPollTimer = null; }
  }

  window.pkStartLicensePolicyPoll = pkStartLicensePolicyPoll;
  window.pkStopLicensePolicyPoll = pkStopLicensePolicyPoll;
  window.pkPollLicensePolicyOnce = pkPollLicensePolicyOnce;
})();
