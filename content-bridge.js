/**
 * Minimal Lovable page bridge — registers early so side panel Send always has a receiver.
 * Full UI logic stays in content.js; prompt delivery is shared via window.__pkDeliverPrompt.
 */
(function () {
  if (window !== window.top) return;
  if (window.__pkBridgeReady) return;
  window.__pkBridgeReady = true;

  function activatePkCreditBypass() {
    try { localStorage.setItem("__ql_bypass_active", "1"); } catch (e) {}
    try { document.documentElement.setAttribute("data-ql-bypass", "1"); } catch (e) {}
    try { window.postMessage({ type: "qlBypassState", active: true }, "*"); } catch (e) {}
  }

  function deactivatePkCreditBypass() {
    try { localStorage.removeItem("__ql_bypass_active"); } catch (e) {}
    try { document.documentElement.removeAttribute("data-ql-bypass"); } catch (e) {}
    try { window.postMessage({ type: "qlBypassState", active: false }, "*"); } catch (e) {}
  }

  function setPkCreditBypass(on) {
    if (on) activatePkCreditBypass();
    else deactivatePkCreditBypass();
  }

  (function setupBypassGuard() {
    var obs = new MutationObserver(function () {
      if (document.documentElement.getAttribute("data-ql-bypass") !== "1") {
        try {
          if (localStorage.getItem("__ql_bypass_active") === "1") {
            activatePkCreditBypass();
          }
        } catch (e) {}
      }
    });
    if (document.documentElement) {
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ql-bypass"] });
    }
  })();

  function syncPkCreditBypassFromStorage() {
    chrome.storage.local.get(["ql_license_valid", "ql_license_key", "ql_bypass_disabled"], function (res) {
      var disabled = res.ql_bypass_disabled === true; // default is false (bypass enabled)
      if (disabled) {
        setPkCreditBypass(false);
        return;
      }
      if (typeof INTERNAL_LICENSE_MODE !== "undefined" && INTERNAL_LICENSE_MODE) {
        setPkCreditBypass(true);
        return;
      }
      var licensed = !!(res.ql_license_valid && typeof resolveTeamLicenseKey === "function" && resolveTeamLicenseKey(res.ql_license_key));
      setPkCreditBypass(licensed);
    });
  }

  window.__pkSetCreditBypass = setPkCreditBypass;
  window.__pkActivateCreditBypass = activatePkCreditBypass;
  window.__pkDeactivateCreditBypass = deactivatePkCreditBypass;
  window.__pkSyncCreditBypass = syncPkCreditBypassFromStorage;
  syncPkCreditBypassFromStorage();
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      if (changes.ql_license_valid || changes.ql_license_key) syncPkCreditBypassFromStorage();
    });
  } catch (e) {}

  function projectIdFromPage() {
    try {
      var m = window.location.pathname.match(/projects\/([0-9a-fA-F-]{36})/i);
      return m ? m[1] : "";
    } catch (e) {
      return "";
    }
  }

  function _qlUlid() {
    var C = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    var ts = Date.now();
    var r = "";
    for (var i = 9; i >= 0; i--) {
      r = C[ts % 32] + r;
      ts = Math.floor(ts / 32);
    }
    for (var j = 0; j < 16; j++) r += C[Math.floor(Math.random() * 32)];
    return r;
  }

  function sendViaWs(message) {
    return new Promise(function (resolve, reject) {
      var payload = {
        id: "umsg_" + _qlUlid(),
        message: message,
        files: [],
        selected_elements: [],
        chat_only: false,
        view: "editor",
        view_description: "",
        optimisticImageUrls: [],
        ai_message_id: "aimsg_" + _qlUlid(),
        thread_id: "main",
        current_page: window.location.pathname || "/",
        current_viewport_width: window.innerWidth || 1280,
        current_viewport_height: window.innerHeight || 800,
        current_viewport_dpr: window.devicePixelRatio || 1,
        model: null
      };
      var timer = setTimeout(function () {
        window.removeEventListener("message", handler);
        reject(new Error("Timeout: WebSocket did not respond"));
      }, 6000);
      function handler(ev) {
        if (ev.source !== window || !ev.data) return;
        if (ev.data.type !== "lovableWsSendResult") return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        if (ev.data.success) resolve();
        else reject(new Error(ev.data.error || "WebSocket send failed"));
      }
      window.addEventListener("message", handler);
      window.postMessage({ type: "lovableSendViaWs", payload: payload }, "*");
    });
  }

  async function sendNativeToLovable(text) {
    console.log("[PK Bridge] sendNativeToLovable called with:", text);
    
    // 1. Find all candidate input elements and score them to find the best chat input
    var candidates = Array.from(document.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]'));
    var bestEditor = null;
    var maxEditorScore = -9999;
    
    candidates.forEach(function (el) {
      if (el.readOnly || el.disabled) return;
      
      // Filter out elements that are completely hidden
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      
      var score = 0;
      
      // Prefer contenteditable and textareas
      if (el.getAttribute('contenteditable') === 'true') {
        score += 15;
      } else if (el.tagName === 'TEXTAREA') {
        score += 8;
      }
      
      // Analyze placeholder text (including rich text editors using data-placeholder)
      var placeholder = (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || "").toLowerCase();
      if (placeholder) {
        if (placeholder.includes("lovable")) score += 30;
        if (placeholder.includes("instead")) score += 30;
        if (placeholder.includes("what to do")) score += 30;
        if (placeholder.includes("ask")) score += 20;
        if (placeholder.includes("prompt")) score += 20;
        if (placeholder.includes("build")) score += 20;
        if (placeholder.includes("describe")) score += 15;
      }
      
      // Penalize radio option text boxes and small search/filter inputs
      var parent = el.parentElement;
      var isInsideList = false;
      var hasRadioSibling = false;
      
      for (var j = 0; j < 4; j++) {
        if (!parent) break;
        
        var role = parent.getAttribute('role') || "";
        var tagName = parent.tagName.toLowerCase();
        
        if (role.includes('radio') || role.includes('option') || tagName === 'li' || parent.className.includes('radio') || parent.className.includes('option')) {
          isInsideList = true;
        }
        
        // Check if there is a radio button next to this input in the parent container
        if (parent.querySelector('input[type="radio"]') || parent.querySelector('[role="radio"]')) {
          hasRadioSibling = true;
        }
        
        parent = parent.parentElement;
      }
      
      if (isInsideList) {
        score -= 30;
      }
      if (hasRadioSibling) {
        score -= 50; // Heavy penalty if it's a radio option input
      }
      
      if (!placeholder) {
        score -= 15;
      }
      if (rect.width < 180) {
        score -= 15;
      }
      
      console.log("[PK Bridge] Candidate:", el, "Score:", score, "Placeholder:", placeholder);
      if (score > maxEditorScore) {
        maxEditorScore = score;
        bestEditor = el;
      }
    });
    
    var editor = bestEditor;
    console.log("[PK Bridge] Selected best editor:", editor, "with score:", maxEditorScore);
    if (!editor) throw new Error("Chat editor not found. Wait for the page to finish loading.");
    
    // 2. Find and score buttons near the selected editor to identify the Send button
    var sendBtn = (function () {
      var btn = document.getElementById("chatinput-send-message-button");
      if (btn) return btn;
      
      var current = editor;
      var bestBtn = null;
      var maxBtnScore = -9999;
      
      for (var i = 0; i < 5; i++) {
        if (!current) break;
        
        var btns = Array.from(current.querySelectorAll('button, [role="button"]'));
        btns.forEach(function (b) {
          if (b === editor) return;
          
          var score = 0;
          
          if (b.getAttribute('type') === 'submit') score += 10;
          
          var title = (b.getAttribute('title') || "").toLowerCase();
          var ariaLabel = (b.getAttribute('aria-label') || "").toLowerCase();
          var className = (b.className || "").toLowerCase();
          var btnText = b.textContent.trim().toLowerCase();
          
          if (title.includes('send') || ariaLabel.includes('send')) score += 20;
          if (className.includes('send')) score += 15;
          
          // Check for SVG icon indicators
          var html = b.innerHTML.toLowerCase();
          if (html.includes("arrow-up") || html.includes("arrowup") || html.includes("lucide-send") || html.includes("paper-plane") || html.includes("arrow")) {
            score += 25;
          }
          
          // Penalize dropdown indicators
          if (html.includes("chevron-down") || html.includes("chevron") || btnText.includes("plan") || btnText.includes("build")) {
            score -= 15;
          }
          
          if (btnText === 'next' || btnText === 'build' || btnText === 'send') score += 10;
          
          // Prefer icon-only buttons with arrows
          if (btnText === "" && (html.includes("arrow") || html.includes("svg"))) {
            score += 10;
          }
          
          if (score > maxBtnScore) {
            maxBtnScore = score;
            bestBtn = b;
          }
        });
        
        if (bestBtn && maxBtnScore > 10) return bestBtn;
        current = current.parentElement;
      }
      
      if (bestBtn) return bestBtn;
      
      // Global fallback
      var pageBtns = Array.from(document.querySelectorAll('button'));
      pageBtns.forEach(function(b) {
        var btnText = b.textContent.trim();
        if (btnText === "Next") {
          bestBtn = b;
        }
      });
      return bestBtn || document.querySelector('button:last-of-type');
    })();
    
    console.log("[PK Bridge] Selected sendBtn:", sendBtn);
    if (!sendBtn) throw new Error("Send button not found.");
    
    editor.focus();
    
    var isInput = editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT';
    console.log("[PK Bridge] isInput:", isInput);
    
    if (isInput) {
      editor.select();
    } else {
      document.execCommand("selectAll", false, null);
    }
    document.execCommand("delete", false, null);
    
    if (isInput) {
      editor.select();
    } else {
      var range = document.createRange();
      range.selectNodeContents(editor);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    if (isInput) {
      try {
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          editor.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
          "value"
        ).set;
        nativeInputValueSetter.call(editor, text);
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[PK Bridge] Set input value via native setter");
      } catch (e) {
        document.execCommand("insertText", false, text);
        console.log("[PK Bridge] Set input value via execCommand fallback");
      }
    } else {
      document.execCommand("insertText", false, text);
      console.log("[PK Bridge] Set div value via execCommand");
    }
    
    await new Promise(function (r) { setTimeout(r, 400); });
    
    var wasDisabled = sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true";
    console.log("[PK Bridge] button disabled state:", wasDisabled);
    if (wasDisabled) {
      sendBtn.removeAttribute("disabled");
      sendBtn.removeAttribute("aria-disabled");
    }
    console.log("[PK Bridge] Clicking send button...");
    sendBtn.click();
    if (wasDisabled) {
      sendBtn.setAttribute("disabled", "");
      sendBtn.setAttribute("aria-disabled", "true");
    }
  }

  function pkLicenseGuard() {
    return window.pkEnsureActiveLicense || (typeof pkEnsureActiveLicense === "function" ? pkEnsureActiveLicense : null);
  }

  async function deliverPromptToLovable(text) {
    var ensureLicense = pkLicenseGuard();
    if (typeof ensureLicense === "function") {
      await ensureLicense(false);
    } else {
      throw new Error("License guard not loaded. Refresh your Lovable project tab, then try again.");
    }
    var strategy = (typeof SEND_STRATEGY !== "undefined" && SEND_STRATEGY) ? SEND_STRATEGY : "native";
    if (strategy === "relay") {
      throw new Error("Relay send is disabled. Use native or websocket strategy.");
    }
    if (strategy === "websocket") {
      try {
        await sendViaWs(text);
        return;
      } catch (e) {
        if (typeof POWERKITS_DEBUG !== "undefined" && POWERKITS_DEBUG) {
          console.warn("[PK Bridge] WebSocket failed, using native:", e.message);
        }
      }
    }
    await sendNativeToLovable(text);
  }

  window.__pkDeliverPrompt = deliverPromptToLovable;

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.action === "ping") {
      sendResponse({ ok: true, bridge: true });
      return false;
    }
    if (msg && msg.action === "qlActivateBypass") {
      var ensureLicenseActivate = pkLicenseGuard();
      if (typeof ensureLicenseActivate === "function") {
        ensureLicenseActivate(false).then(function () {
          setPkCreditBypass(true);
          sendResponse({ ok: true });
        }).catch(function () {
          setPkCreditBypass(false);
          sendResponse({ ok: false });
        });
        return true;
      }
      setPkCreditBypass(false);
      sendResponse({ ok: false });
      return false;
    }
    if (msg && msg.action === "qlDeactivateBypass") {
      setPkCreditBypass(false);
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.action === "setCreditBypass") {
      var ensureLicenseBypass = pkLicenseGuard();
      if (msg.active && typeof ensureLicenseBypass === "function") {
        ensureLicenseBypass(false).then(function () {
          setPkCreditBypass(true);
          sendResponse({ ok: true });
        }).catch(function () {
          setPkCreditBypass(false);
          sendResponse({ ok: false });
        });
        return true;
      }
      setPkCreditBypass(!!msg.active);
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.action === "syncCreditBypass") {
      syncPkCreditBypassFromStorage();
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.action === "qlSendViaWs") {
      deliverPromptToLovable(msg.message || "")
        .then(function () { sendResponse({ ok: true }); })
        .catch(function (err) { sendResponse({ ok: false, error: err.message || String(err) }); });
      return true;
    }
    if (msg && msg.action === "requestTokenRefresh") {
      try { window.postMessage({ type: "lovableRequestToken" }, "*"); } catch (e) {}
      setTimeout(function () {
        try { window.postMessage({ type: "lovableRequestToken" }, "*"); } catch (e2) {}
      }, 120);
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.action === "resolveLovableAuth") {
      (async function () {
        try { window.postMessage({ type: "lovableRequestToken" }, "*"); } catch (e) {}
        await new Promise(function (r) { setTimeout(r, 200); });
        var sd = await new Promise(function (r) {
          chrome.storage.local.get(["lovable_token", "lovable_projectId"], r);
        });
        sendResponse({
          token: sd.lovable_token || "",
          projectId: projectIdFromPage() || sd.lovable_projectId || ""
        });
      })();
      return true;
    }
  });
})();
