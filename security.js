/**
 * Lovable Powerkits — Security Middleware Layer
 * Handles anti-tampering, DevTools/debugger detection, and client-side RS256 JWT validation.
 */
(function () {
  // Embedded public key matching the private key stored on Vercel
  const JWT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnT8Q40luOd5vRznR6YKl
XLTA0zbxhlTK4PDg9oR7Zyrxgx5IOebW6OhkuzrT47Y7s39Q3Mn/1OqReFLXLlW7
GFZoLU2PUE7noPuh5peXfrNr98NAjxVq2Cfl2GRfDtYL2XsGf5CQtWTDjxDIunx+
EvVDuOBuYjk+Y17F1xtqtfEsj9WD7nNSB+ynmITiJrUdwNXkFk2msHiKSCqZAFje
SWiT9orTD65z1aH+BIVW4cA4D0MZ5ntnd2fFabzbqab6F/GPjUzLB8dRluXqatI5
EkMmVoBBwk+279gf7TCDjMCpPls0J/T81HPk76X5SXy0gULmaGUbfh8CIsk0Q672
HwIDAQAB
-----END PUBLIC KEY-----`;

  // --- Base64URL Decoders for JWT ---
  function base64UrlDecode(str) {
    var base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    var padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  }

  function str2ab(str) {
    var buf = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i);
    }
    return buf;
  }

  function importPublicKey(pem) {
    var pemHeader = "-----BEGIN PUBLIC KEY-----";
    var pemFooter = "-----END PUBLIC KEY-----";
    var cleanPem = pem.trim();
    var pemContents = cleanPem.substring(pemHeader.length, cleanPem.length - pemFooter.length).replace(/\s/g, '');
    var binaryDer = str2ab(atob(pemContents));
    return window.crypto.subtle.importKey(
      "spki",
      binaryDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  }

  // Cryptographically verifies JWT token signature & expiration client-side
  async function verifyJwtClientSide(token) {
    if (!token || token.indexOf('eyJ') !== 0) return false;
    try {
      var parts = token.split('.');
      if (parts.length !== 3) return false;
      var header = parts[0];
      var payload = parts[1];
      var signature = parts[2];

      var data = str2ab(header + '.' + payload);
      var signatureBytes = str2ab(base64UrlDecode(signature));

      var cryptoKey = await importPublicKey(JWT_PUBLIC_KEY);
      var isValid = await window.crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        cryptoKey,
        signatureBytes,
        data
      );

      if (!isValid) return false;

      // Validate expiration
      var jsonPayload = JSON.parse(base64UrlDecode(payload));
      if (jsonPayload.exp && jsonPayload.exp * 1000 < Date.now()) {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Anti-Tampering Engine ---
  function onTamperingDetected(reason) {
    console.warn("[Security] Tampering event logged: " + reason);
    
    // Clear storage and revoke license locally
    chrome.storage.local.remove([
      "ql_license_valid",
      "ql_license_key",
      "ql_session_id",
      "ql_user_name",
      "ql_expires_at",
      "ql_activated_at",
      "ql_license_status",
      "ql_validity_minutes"
    ], function() {
      // Invalidate memory cache in license guard if loaded
      if (typeof window.pkInvalidateAssertCache === "function") {
        window.pkInvalidateAssertCache();
      }

      // Send threat report event to the security log endpoint
      chrome.storage.local.get(["ql_hw_fingerprint"], function(res) {
        var deviceId = res.ql_hw_fingerprint || "unknown";
        var apiBase = typeof POWERKITS_API_BASE !== "undefined" ? POWERKITS_API_BASE : "https://lov.powerkits.net";
        chrome.runtime.sendMessage({
          action: "proxyFetch",
          url: apiBase + "/functions/v1/assert-session",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId,
            tampering_event: reason,
            details: {
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString()
            }
          })
        });
      });

      // Reload panel or page after brief pause (disabled to prevent refresh loops)
      /*
      setTimeout(function() {
        if (typeof window !== "undefined" && window.location) {
          window.location.reload();
        }
      }, 800);
      */
    });
  }

  // 1. DevTools detection via window dimension discrepancies (disabled to prevent refresh loops)
  /*
  (function detectDevTools() {
    var threshold = 160;
    setInterval(function() {
      if (typeof window === "undefined") return;
      var widthThreshold = window.outerWidth - window.innerWidth > threshold;
      var heightThreshold = window.outerHeight - window.innerHeight > threshold;
      if (widthThreshold || heightThreshold) {
        onTamperingDetected("devtools_open");
      }
    }, 2000);
  })();
  */

  // 2. Active debugging blocker (disabled to prevent debugger interruption and reload loops)
  /*
  (function debuggerLoop() {
    var start = Date.now();
    debugger;
    var duration = Date.now() - start;
    if (duration > 150) {
      onTamperingDetected("active_debugger_paused");
    }
    setTimeout(debuggerLoop, 1000);
  })();
  */

  // 3. API Hook/Override detection (disabled to prevent false positives from extension runtime environment)
  /*
  function verifyFunctionIntegrity(fn, expectedName) {
    if (typeof fn !== "function") return false;
    var str = fn.toString();
    return str.indexOf("[native code]") !== -1;
  }

  setInterval(function() {
    if (!verifyFunctionIntegrity(window.fetch, "fetch") ||
        !verifyFunctionIntegrity(chrome.storage.local.get, "get") ||
        !verifyFunctionIntegrity(chrome.storage.local.set, "set") ||
        !verifyFunctionIntegrity(chrome.runtime.sendMessage, "sendMessage")) {
      onTamperingDetected("api_hooks_injected");
    }
  }, 3000);
  */

  // Expose verification function globally
  window.verifyJwtClientSide = verifyJwtClientSide;
})();
