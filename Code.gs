// =============================================
// SELF-UPDATING GOOGLE APPS SCRIPT FROM GITHUB
// =============================================
//
// PAGE RELOAD AFTER DEPLOY (SOLVED)
// -----------------------------------
// The GAS sandbox iframe has "allow-top-navigation-by-user-activation",
// blocking ALL programmatic top-level navigation from async callbacks.
// This was solved by embedding the web app in an external page.
//
// SOLUTION — EMBEDDING + postMessage:
//   The web app is embedded as a full-screen iframe on:
//     https://www.shadowaisolutions.com/test
//   After a deploy, the GAS client-side JS sends:
//     window.top.postMessage({type:'gas-reload', version: ...}, '*')
//     window.parent.postMessage({type:'gas-reload', version: ...}, '*')
//   The embedding page listens for this message and reloads itself,
//   which reloads the GAS iframe with fresh content. Fully automatic.
//
//   For manual reload, a "Reload Page" button uses:
//     <form target="_top" action="https://www.shadowaisolutions.com/test">
//   This navigates back to the embedding page (user gesture required).
//   After deploy, the button turns red: "Update Available — Reload Page".
//
// WHAT DOES NOT WORK (inside the GAS sandbox, from async callbacks):
//   - window.location.reload()        → blank page
//   - window.location.href = url      → blank page
//   - window.top.location.reload()    → blocked (cross-origin)
//   - <a target="_top">.click()       → blocked (not user gesture)
//   - <form target="_top">.submit()   → blocked (not user gesture)
//   - Synthetic .click() on button    → blocked (not user gesture)
//   - navigator.userActivation check  → activation expires before deploy finishes
//   These are hard browser security constraints, not fixable.
//
// WHAT THIS IS
// ------------
// A Google Apps Script web app that pulls its own source code from
// a GitHub repository and redeploys itself. GitHub is the source of
// truth — this file (Code.gs) is the ONLY file you need to edit.
//
// There are TWO ways updates reach the live web app:
//   1. MANUAL: Click "Pull Latest" in the web app UI
//   2. AUTOMATIC: Edit Code.gs via Claude Code (or any push to a
//      claude/* branch) — a GitHub Action auto-merges to main, then
//      clicking "Pull Latest" in the web app picks up the change
//
// REPO STRUCTURE
// --------------
// Code.gs                              ← this file (the entire app)
// .claude/settings.json                ← auto-allows git commands for Claude Code
// .github/workflows/auto-merge-claude.yml ← auto-merges claude/* branches to main
//
// CI/CD: CLAUDE CODE → GITHUB → APPS SCRIPT
// ------------------------------------------
// This repo is set up so that Claude Code (Anthropic's AI coding tool)
// can edit Code.gs and have changes flow to main automatically:
//
//   1. Claude Code edits Code.gs (e.g. bumps VERSION)
//   2. Claude Code commits and pushes to a claude/* branch
//      (it cannot push directly to main — only to claude/* branches)
//   3. A GitHub Action (.github/workflows/auto-merge-claude.yml)
//      triggers on any push to claude/**, checks out main, merges
//      the claude branch, and pushes main — no PR review needed
//   4. The web app's "Pull Latest" button fetches Code.gs from
//      main via the GitHub API and redeploys the Apps Script project
//
// Key files that enable this:
//
//   .claude/settings.json:
//     { "permissions": { "allow": ["Bash(git *)"] } }
//     This tells Claude Code to auto-approve all git commands
//     without prompting the user for confirmation each time.
//
//   .github/workflows/auto-merge-claude.yml:
//     Triggers on push to claude/** branches. Checks out main,
//     merges the pushed branch via git merge, and pushes main.
//     Uses github-actions[bot] as the committer. No PR is created —
//     it's a direct merge to keep things simple and fast.
//
// TO START A NEW CLAUDE CODE SESSION:
//   1. In Claude Code, select: New session
//   2. Change from "local" to "Claude GitHub Environment 1"
//   3. Click: select repository
//   4. Select: gas-self-update-test
//   5. Type prompt: read the code in the Code.gs file and wait for further instructions
//
// TO UPDATE THIS APP VIA CLAUDE CODE:
//   Just ask Claude Code to change the VERSION variable (or anything
//   else in this file). It will commit, push to a claude/* branch,
//   and the GitHub Action will merge to main automatically. Then
//   click "Pull Latest" in the web app to deploy.
//
// IMPORTANT — KEEP THIS OVERVIEW UP TO DATE:
//   You (Claude Code) will often work on this file in a BRAND NEW chat
//   session with ZERO prior context. This overview is your ONLY source
//   of truth for understanding how the system works. If something is
//   not documented here, you will not know about it.
//
//   Therefore, whenever you make ANY of the following changes, you MUST
//   update the relevant section of this overview IN THE SAME COMMIT:
//     - New or removed functions
//     - Changes to the pull/deploy flow
//     - New integrations (APIs, services, external calls)
//     - New config variables or Script Properties
//     - Changes to how data flows (client ↔ server)
//     - New HTML elements or UI sections
//     - Changes to OAuth scopes or permissions
//     - Architectural decisions or gotchas discovered
//
//   Do NOT document trivial variable changes (bumping VERSION, changing
//   TITLE text), but DO document everything structural. When in doubt,
//   document it — a future you with no context will thank you.
//
//   Think of this overview as a self-contained briefing document. If a
//   new Claude Code session reads ONLY this comment block, it should
//   understand every function, every integration, every config value,
//   and every gotcha without needing to ask the user.
//
// IMPORTANT — ALWAYS SAY "Standby" FIRST:
//   Whenever you (Claude Code) receive a new prompt from the user, the
//   VERY FIRST thing you must output is the word "Standby" (on its own
//   line). Do this BEFORE you start thinking, planning, or formulating
//   your response. This lets the user know you received their message
//   and are not stuck. Every single prompt, no exceptions.
//
// IMPORTANT — AUTO-INCREMENT VERSION ON EVERY COMMIT:
//   Whenever you (Claude Code) make ANY change to this file and commit,
//   you MUST also increment the VERSION variable by 0.01 as part of that
//   same commit. For example, if VERSION is currently "1.01", change it
//   to "1.02" before committing. If it's "1.99", change it to "2.00".
//   This is a hard rule — no commit to Code.gs should ever leave
//   VERSION unchanged. The version number is how the user tracks that
//   updates have reached the live web app.
//
// IMPORTANT — SIGNAL WHEN READY FOR USER TO PULL:
//   When you (Claude Code) are completely done with all changes, have
//   committed and pushed successfully, your FINAL message to the user
//   MUST end with exactly:
//     ✅✅✅ Ready For User to Pull Latest Updates (vX.X)
//   where X.X is the VERSION you just pushed. This tells the user it's
//   safe to click "Pull Latest" in the web app. Do NOT send this line
//   until the push is confirmed successful.
//
// ARCHITECTURE
// ------------
// The web app uses a "dynamic loader" pattern:
//   - doGet() serves a STATIC HTML shell that never changes
//   - All visible content (version, title, etc.) is fetched at runtime
//     via a single google.script.run.getAppData() call
//   - getAppData() returns an object like { version: "2.5", title: "Welcome" }
//   - The client-side applyData() function loops through the returned keys
//     and sets the textContent of any HTML element whose id matches the key
//   - This means adding new dynamic fields only requires:
//       a. Adding a var at the top (e.g. var SUBTITLE = "...")
//       b. Including it in getAppData() return value
//       c. Adding an HTML element with a matching id (e.g. <div id="subtitle">)
//     No other client-side JS changes are needed
//   - After a pull, getAppData() is called again on the NEW server code,
//     so all dynamic values update without a page reload
//   - This bypasses Google's aggressive server-side HTML caching
//     which cannot be disabled on Apps Script web apps
//
// AUTO-PULL ON PAGE LOAD:
//   Every time the web app is loaded/reloaded, checkForUpdates() is
//   called automatically. This means the app always pulls the latest
//   code from GitHub on load — if a new version is available, it deploys
//   and refreshes the dynamic content. If already up to date, it shows
//   "Already up to date" briefly. If the pull fails (e.g. GitHub API
//   temporarily unavailable), the error IS shown to the user — do NOT
//   hide errors silently. The manual button still works too.
//
// Pull flow when the button is clicked (or on auto-pull):
//   1. pullAndDeployFromGitHub() fetches Code.gs from GitHub API
//      (uses api.github.com, NOT raw.githubusercontent.com which has
//      a 5-minute CDN cache that causes stale pulls)
//   2. Extracts VERSION from the pulled code using regex and compares
//      it with the currently running VERSION. If they match, returns
//      "Already up to date" and skips deployment entirely — this
//      prevents wasting Apps Script deployment version numbers
//   3. Overwrites the Apps Script project source via Apps Script API
//      PUT /v1/projects/{scriptId}/content
//   4. Creates a new immutable version via
//      POST /v1/projects/{scriptId}/versions
//   5. Updates the web app deployment to point to the new version via
//      PUT /v1/projects/{scriptId}/deployments/{deploymentId}
//   6. Client-side JS waits 2 seconds then re-calls getAppData()
//      via google.script.run which executes the NEW server-side code,
//      updating all dynamic values without a page reload
//   7. After getAppData() succeeds, the client also calls
//      writeVersionToSheetA1() which writes "v" + VERSION to cell A1
//      of the "Live_Sheet" tab in the linked Google Sheet.
//      IMPORTANT: This is called from the CLIENT-SIDE callback, NOT
//      from inside pullAndDeployFromGitHub(). This is critical because
//      pullAndDeployFromGitHub() runs as the OLD deployed code (VERSION still
//      holds the previous value). By calling writeVersionToSheetA1()
//      from the post-pull callback, it executes as the NEW code
//      where VERSION is correct. This pattern should be used for
//      any post-deployment side effects — always trigger them from
//      the client callback, never from pullAndDeployFromGitHub() itself.
//   8. After writeVersionToSheetA1() fires, getAppData() is called again
//      on the NEW deployed code. applyData() updates the DOM with the
//      new version and title. The "Reload Page" button turns red with
//      "Update Available — Reload Page" text.
//   9. postMessage({type:'gas-reload'}) is sent to window.top and
//      window.parent. If the app is embedded (see EMBEDDING section),
//      the embedding page catches this and reloads automatically.
//      If accessed directly (not embedded), the user clicks the
//      red "Reload Page" button which navigates via form target="_top"
//      to the embedding page URL.
//
// VERSION LIMIT MANAGEMENT (200 VERSION CAP)
// --------------------------------------------
// Apps Script has a hard 200 version limit. The API does NOT support
// deleting versions — there is no DELETE endpoint (open feature request
// since 2018). Versions can ONLY be deleted via the Apps Script editor:
//   Project History > Bulk delete versions
//
// What the code DOES do automatically after each deploy:
//   1. Deletes unused deployments via API (projects.deployments.delete)
//      — this frees their associated versions for manual deletion
//   2. Counts total versions and reports "X/200 versions" in the status
//   3. Shows a warning when versions reach 180+ (approaching limit)
//
// When the warning appears, manually clean up in the Apps Script editor:
//   1. Go to Deploy > Manage Deployments > archive unused deployments
//   2. Go to Project History > Bulk delete versions
// A version can only be deleted if no deployment references it.
//
// KEY DESIGN DECISIONS & GOTCHAS
// ------------------------------
// - V8 runtime is REQUIRED (set in appsscript.json) because the code
//   uses template literals (backticks). Without V8, you get
//   "illegal character" syntax errors.
//
// - Four OAuth scopes are required:
//     script.projects        → read/write project source code
//     script.external_request → fetch from GitHub API
//     script.deployments     → update the live deployment
//     spreadsheets           → write version to Live_Sheet tab
//   Missing any scope causes 403 "insufficient authentication scopes".
//   After adding scopes to appsscript.json, you must re-authorize by
//   running any function from the editor.
//
// - A GitHub personal access token should be stored in Script Properties
//   to avoid API rate limits (60/hr unauthenticated → 5000/hr with token).
//   Set it in the Apps Script editor: Project Settings → Script Properties
//     Key: GITHUB_TOKEN   Value: your github_pat_... token
//   The code reads it via PropertiesService.getScriptProperties() and
//   passes it as an Authorization header. If not set, requests fall back
//   to unauthenticated (which will hit rate limits quickly).
//   Generate a fine-grained token at https://github.com/settings/tokens
//   with "Public repositories" read-only access — no extra permissions needed.
//
// - The Apps Script API must be enabled in TWO places:
//     a. https://script.google.com/home/usersettings (toggle ON)
//     b. In the linked GCP project: APIs & Services → Library → Apps Script API
//   Missing either causes 403 errors.
//
// - The GCP project must be one where you have Owner role.
//   The default auto-created GCP project for Apps Script is managed by
//   Google and you cannot enable APIs on it (you get "required permission
//   serviceusage.services.enable" errors). Solution: create your own GCP
//   project, enable the API there, then link it in Apps Script via
//   Project Settings → Change project → paste the numeric project number.
//
// - Deployment must be updated programmatically. Creating a new version
//   alone is NOT enough — the deployment still points to the old version.
//   The code explicitly PUTs to the deployment endpoint with the new
//   version number.
//
// - location.reload() does NOT work in Apps Script web apps because the
//   page is served inside a sandboxed iframe. The dynamic loader pattern
//   avoids needing any page reload at all.
//
// - var VERSION at the top is the single source for the displayed version.
//   Change only this value on GitHub to update what the web app shows.
//
// CONFIG VARIABLES (in pullAndDeployFromGitHub)
// ------------------------------------
// GITHUB_OWNER  → GitHub username or organization
// GITHUB_REPO   → repository name
// GITHUB_BRANCH → branch name (usually "main")
// FILE_PATH     → path to the .gs file in the repo
// DEPLOYMENT_ID → from Deploy → Manage deployments in the Apps Script editor
//                 (this is the long AKfycb... string, NOT the web app URL)
//
// EMBEDDED SPREADSHEET + LIVE B1 DISPLAY (CACHE-BACKED)
// ------------------------------------------------------
// The Google Sheet is embedded as a read-only iframe using:
//   https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?rm=minimal
//
// Cell B1 from Live_Sheet is displayed above the iframe in #live-b1.
// It is polled every 15s via readB1FromCacheOrSheet() (cache-backed, cheap).
//
// readB1FromCacheOrSheet() reads from CacheService first (fast, no spreadsheet quota).
// Only falls back to SpreadsheetApp on cache miss (every 6hrs or first load).
//
// An installable onEdit trigger (onEditWriteB1ToCache) keeps the cache fresh:
//   - Fires on every spreadsheet edit
//   - If the edit is cell B1 on Live_Sheet, writes the new value to
//     CacheService.getScriptCache() with a 6-hour TTL
//   - This means subsequent page loads read from cache, not SpreadsheetApp
//
// IMPORTANT — INSTALLABLE TRIGGER REQUIRED:
//   onEditWriteB1ToCache must be installed manually (simple onEdit can't use CacheService):
//     1. Apps Script editor → Triggers (clock icon) → + Add Trigger
//     2. Function: onEditWriteB1ToCache, Event source: From spreadsheet, Event type: On edit
//     3. Save and authorize
//   Without this trigger, readB1FromCacheOrSheet() always falls back to SpreadsheetApp.
//
// NOTE: Client-side approaches (gviz/tq via fetch or JSONP) do NOT work
// in the Apps Script sandbox due to CSP restrictions.
//
// GITHUB ACTION → GOOGLE SHEET C1 (VIA doPost)
// -----------------------------------------------
// Every time the GitHub Action merges a claude/* branch to main, it also
// POSTs the new version to the web app's doPost() endpoint, which writes
// it to cell C1 of Live_Sheet. This happens automatically — no polling.
//
// Flow: GitHub Action → curl POST → doPost(e) → writes C1
//   POST param: action=writeC1&value=vX.XX
//   doPost() reads e.parameter.action and e.parameter.value, writes to C1.
//
// doPost() also sets a "pushed_version" cache flag. The client polls
// readPushedVersionFromCache() every 15 seconds. If the pushed version differs from
// the currently displayed version, it auto-triggers checkForUpdates() —
// so the web app deploys itself within ~15 seconds of a push, fully
// automatic with no user interaction.
//
// Full auto-deploy flow:
//   1. Claude Code pushes to claude/* branch
//   2. GitHub Action merges to main + POSTs to doPost()
//   3. doPost() writes C1 + sets "pushed_version" in cache
//   4. Client polls readPushedVersionFromCache() every 15s
//   5. Detects new version → auto-triggers checkForUpdates()
//   6. pullAndDeployFromGitHub() deploys the new code
//   7. App updates dynamically — zero manual clicks
//
// NOTE: doPost() runs on the CURRENTLY DEPLOYED code, not the just-pushed
// code. So the doPost handler must already be deployed for this to work.
//
// EMBEDDING (for auto-reload + sound notification)
// --------------------------------------------------
// The web app is embedded as a full-screen iframe on an external page:
//   https://www.shadowaisolutions.com/test
// This solves the auto-reload problem (see PAGE RELOAD AFTER DEPLOY)
// and enables sound notifications on deploy.
//
// FULL EMBEDDING PAGE HTML (keep this up to date!):
//   <!DOCTYPE html>
//   <html lang="en">
//   <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>GAS Self-Update Dashboard</title>
//     <style>
//       html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
//       iframe { width: 100%; height: 100%; border: none; }
//     </style>
//   </head>
//   <body>
//     <iframe id="gas-app"
//       src="https://script.google.com/a/macros/shadowaisolutions.com/s/AKfycbwkKbU1fJ-bsVUi9ZQ8d3MVdT2FfTsG14h52R1K_bsreaL7RgmkC4JJrMtwiq5VZEYX-g/exec"
//       allow="*">
//     </iframe>
//     <script>
//       // Pre-unlock AudioContext on first user interaction (needed for mobile)
//       var _audioCtx = null;
//       function unlockAudio() {
//         if (!_audioCtx) {
//           _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
//           // Play a silent buffer to fully unlock on iOS/Android
//           var buf = _audioCtx.createBuffer(1, 1, 22050);
//           var src = _audioCtx.createBufferSource();
//           src.buffer = buf;
//           src.connect(_audioCtx.destination);
//           src.start(0);
//         }
//         if (_audioCtx.state === 'suspended') _audioCtx.resume();
//       }
//       document.addEventListener('click', unlockAudio, { once: false });
//       document.addEventListener('touchstart', unlockAudio, { once: false });
//
//       function playBeep() {
//         try {
//           var ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
//           var osc = ctx.createOscillator();
//           var gain = ctx.createGain();
//           osc.connect(gain);
//           gain.connect(ctx.destination);
//           osc.frequency.value = 880;
//           gain.gain.value = 0.3;
//           osc.start();
//           osc.stop(ctx.currentTime + 0.15);
//         } catch(e) {}
//       }
//
//       function playSoundFromDataUrl(dataUrl) {
//         try {
//           var ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
//           if (ctx.state === 'suspended') ctx.resume();
//           var base64 = dataUrl.split(',')[1];
//           var binary = atob(base64);
//           var bytes = new Uint8Array(binary.length);
//           for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
//           ctx.decodeAudioData(bytes.buffer, function(audioBuffer) {
//             var source = ctx.createBufferSource();
//             source.buffer = audioBuffer;
//             source.connect(ctx.destination);
//             source.start(0);
//           }, function() { playBeep(); });
//         } catch(e) { playBeep(); }
//       }
//
//       // After reload: try to play stored sound (works on desktop)
//       if (sessionStorage.getItem('gas-pending-sound')) {
//         sessionStorage.removeItem('gas-pending-sound');
//         var soundData = sessionStorage.getItem('gas-sound-data');
//         if (soundData) {
//           sessionStorage.removeItem('gas-sound-data');
//           playSoundFromDataUrl(soundData);
//         } else {
//           playBeep();
//         }
//       }
//
//       window.addEventListener('message', function(e) {
//         if (e.data && e.data.type === 'gas-reload') {
//           sessionStorage.setItem('gas-pending-sound', '1');
//           if (e.data.soundDataUrl) {
//             sessionStorage.setItem('gas-sound-data', e.data.soundDataUrl);
//           }
//           window.location.reload();
//         }
//       });
//     </script>
//   </body>
//   </html>
//
// NOTE: The iframe src uses the Workspace domain-specific URL format:
//   /a/macros/shadowaisolutions.com/s/{DEPLOYMENT_ID}/exec
// NOT the generic /macros/s/{DEPLOYMENT_ID}/exec format.
// The iframe has allow="*" to permit audio, popups, etc. from GAS.
//
// SOUND ON RELOAD — HOW IT WORKS (THE WORKING SOLUTION):
//   The goal: play the Google Drive MP3 automatically when the page
//   reloads after a deploy. This required solving two hard problems:
//     a) Getting the MP3 data to the embedding page (CORS blocks
//        direct fetch from Drive on a different origin)
//     b) Playing audio on page load (browsers block autoplay)
//
//   Solution — postMessage + sessionStorage + AudioContext.decodeAudioData:
//     1. GAS app pre-loads the Drive MP3 as a base64 data URI on page
//        load via getSoundBase64() (server-side UrlFetchApp, no CORS)
//     2. After deploy, GAS sends postMessage to the embedding page:
//          {type:'gas-reload', version:'...', soundDataUrl:'data:audio/mpeg;base64,...'}
//        The soundDataUrl carries the full base64-encoded MP3.
//     3. Embedding page receives the message, stores soundDataUrl in
//        sessionStorage (survives reload, ~40KB fits easily in 5MB limit),
//        sets a pending-sound flag, and reloads.
//     4. After reload, checks the flag. If sound data exists in
//        sessionStorage, decodes the base64 into an ArrayBuffer and
//        plays it via AudioContext.decodeAudioData() + BufferSource.
//        AudioContext bypasses the browser autoplay policy that blocks
//        <audio>.play() on page load.
//     5. Falls back to an AudioContext beep if sound data is missing
//        (e.g. getSoundBase64 hadn't finished loading) or decode fails.
//
// SOUND — WHAT DID NOT WORK (AND WHY):
//   We tried many approaches before finding the working solution above.
//   Documenting these so future sessions don't re-attempt them:
//
//   1. Direct Drive URL in <audio> element:
//        new Audio('https://drive.google.com/uc?export=download&id=...')
//      FAILED: GAS sandbox CSP blocks loading audio from drive.google.com.
//      The browser silently refuses to fetch the resource.
//
//   2. Server-side base64 + new Audio(dataUri) inside GAS sandbox:
//        getSoundBase64() returns data URI → new Audio(dataUri).play()
//      WORKS for button clicks (user gesture), but:
//      - Cannot autoplay on page load (blocked by autoplay policy)
//      - The "Test Sound (Drive)" button in the GAS app uses this method
//
//   3. AudioContext oscillator beep inside GAS sandbox:
//        new AudioContext() → createOscillator() → start()
//      INCONSISTENT: AudioContext reports state "running" but produces
//      no audible sound from inside the GAS sandbox iframe. The browser
//      allows the API calls but silently mutes the actual audio output.
//      This worked in earlier versions but stopped — likely a browser
//      or GAS sandbox policy change. NOT RELIABLE inside GAS sandbox.
//      However, AudioContext DOES work on the embedding page (top-level,
//      not sandboxed), which is why the working solution uses it there.
//
//   4. Inline WAV generation via JavaScript (inside GAS sandbox):
//        Generate PCM samples → build WAV header → btoa() → data URI
//      FAILED: Same issue as #3 — new Audio(wavDataUri) works for
//      button clicks but the GAS sandbox may silently mute it. Also
//      adds code complexity for no benefit over approach #2.
//
//   5. Hardcoded SOUND_B64 variable (huge base64 string in Code.gs):
//        var SOUND_B64 = "SUQzAwAA..."; new Audio('data:audio/mpeg;base64,' + SOUND_B64)
//      WORKS for button clicks, but makes Code.gs extremely long
//      (~30KB+ of base64 for a short MP3). Rejected for code size.
//
//   6. <audio preload="auto">.play() on embedding page after reload:
//        <audio src="drive-url" preload="auto"> + sessionStorage flag
//      FAILED: Browser autoplay policy blocks <audio>.play() on page
//      load, even after a reload triggered by user action. The audio
//      element loads the file fine, but play() is rejected with
//      NotAllowedError. This is the key limitation that AudioContext
//      (approach in working solution) bypasses.
//
//   KEY INSIGHT: AudioContext.decodeAudioData() + BufferSource.start()
//   is NOT subject to the same autoplay restrictions as <audio>.play().
//   Browsers treat AudioContext more permissively, especially when the
//   user has recently interacted with the page (which they have, since
//   the reload was triggered by their activity). This is why the beep
//   worked on reload but <audio>.play() did not.
//
// RACE CONDITION — AUTO-DEPLOY CAN FIRE BEFORE CLAUDE CODE FINISHES:
//   The auto-deploy pipeline is very fast: push → GitHub Action merge →
//   doPost sets cache → client polls cache (≤15s) → deploys new code.
//   This entire chain can complete in under 30 seconds. If Claude Code
//   pushes a commit and then continues talking to the user, the web app
//   may already deploy the new version before the conversation ends.
//   This is expected and harmless — the web app simply deploys whatever
//   is on main. But it means the user may see the red "Update Available"
//   button while Claude Code is still typing. Claude Code should still
//   send the "Ready For User to Pull" message as confirmation.
//
// TOKEN / QUOTA USAGE DISPLAY
// ----------------------------
// The web app shows daily token/quota info to the right of the Live_Sheet
// title in small gray text, refreshed every 60 seconds via fetchGitHubQuotaAndLimits().
// fetchGitHubQuotaAndLimits() returns an object with github, urlFetch,
// spreadsheet, and execTime fields. Only GitHub is live; rest are static.
//
// SOUND PLAYBACK — TWO CONTEXTS
// ----------------------------------------
// The Drive MP3 (Google Drive file ID: 1bzVp6wpTHdJ4BRX8gbtDN73soWpmq1kN)
// is played in two different contexts with different mechanisms:
//
// A) INSIDE GAS SANDBOX (Test Sound button, manual click):
//    getSoundBase64() fetches the MP3 server-side via UrlFetchApp,
//    returns a base64 data URI. Client pre-loads on page load into
//    _soundDataUrl variable. Button click → new Audio(_soundDataUrl).play().
//    Works because button click is a user gesture (satisfies autoplay).
//    Costs 1 UrlFetchApp + 1 google.script.run per page load.
//
// B) ON EMBEDDING PAGE (auto-play after deploy reload):
//    The GAS app includes _soundDataUrl in the gas-reload postMessage.
//    Embedding page stores it in sessionStorage, reloads, then plays
//    via AudioContext.decodeAudioData() which bypasses autoplay policy.
//    See EMBEDDING section above for full details and failed approaches.
//
// COMPLETE CALL AUDIT — EVERY EXTERNAL CALL IN THE SYSTEM
// --------------------------------------------------------
// This section documents every API call, service call, and resource
// consumption that occurs, organized by trigger event. Use this to
// understand quota burn rate and why each optimization exists.
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: PAGE LOAD (happens once per browser load/redirect)       │
// ├─────────────────────────────────────────────────────────────────┤
// │ 1. getAppData()                                                │
// │    └─ 0 external calls (returns in-memory vars)                │
// │    └─ 1 google.script.run (execution time)                     │
// │                                                                │
// │ 2. checkForUpdates() → pullAndDeployFromGitHub()               │
// │    └─ 1 UrlFetchApp: GitHub API GET /contents/Code.gs          │
// │    └─ 1 GitHub API call (counts toward rate limit)             │
// │    IF version matches (already up to date):                    │
// │      └─ 0 more calls, returns early                            │
// │    IF new version detected (full deploy):                      │
// │      └─ 1 UrlFetchApp: Apps Script API GET /content            │
// │      └─ 1 UrlFetchApp: Apps Script API PUT /content            │
// │      └─ 1 UrlFetchApp: Apps Script API POST /versions          │
// │      └─ 1 UrlFetchApp: Apps Script API PUT /deployments        │
// │      └─ 1 google.script.run: getAppData() (post-deploy)       │
// │      └─ 1 google.script.run: writeVersionToSheetA1()          │
// │         └─ 1 SpreadsheetApp: write A1                          │
// │      └─ 1 google.script.run: getAppData() (refresh display)    │
// │    Subtotal per load: 1-5 UrlFetchApp, 1 GitHub API,           │
// │      0-1 SpreadsheetApp, 2-4 google.script.run                 │
// │                                                                │
// │ 3. pollB1FromCache() — first call                              │
// │    └─ 1 google.script.run → readB1FromCacheOrSheet()           │
// │      └─ 1 CacheService.get("live_b1")                         │
// │      └─ IF cache hit: 0 more (most common)                    │
// │      └─ IF cache miss: 1 SpreadsheetApp read B1 + cache put   │
// │                                                                │
// │ 4. pollQuotaAndLimits() — first call                           │
// │    └─ 1 google.script.run → fetchGitHubQuotaAndLimits()       │
// │      └─ 1 UrlFetchApp: GitHub API GET /rate_limit              │
// │      └─ 1 GitHub API call (counts toward rate limit)           │
// │                                                                │
// │ 5. getSoundBase64() — pre-load sound on page load              │
// │    └─ 1 google.script.run → getSoundBase64()                   │
// │      └─ 1 UrlFetchApp: Google Drive download                   │
// │      └─ Returns base64 data URI, cached in client JS variable  │
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: EVERY 15 SECONDS (two polling loops)                    │
// ├─────────────────────────────────────────────────────────────────┤
// │ 1. pollB1FromCache() → readB1FromCacheOrSheet()                │
// │    └─ 1 google.script.run (execution time ~30ms)               │
// │    └─ 1 CacheService.get("live_b1")                            │
// │    └─ IF cache hit: 0 more calls (normal path)                 │
// │    └─ IF cache miss: 1 SpreadsheetApp read (rare, every 6hrs)  │
// │                                                                │
// │ 2. pollPushedVersionFromCache() → readPushedVersionFromCache() │
// │    └─ 1 google.script.run (execution time ~30ms)               │
// │    └─ 1 CacheService.get("pushed_version")                     │
// │    └─ 0 SpreadsheetApp, 0 UrlFetchApp, 0 GitHub API            │
// │    └─ IF new version detected: triggers checkForUpdates()      │
// │       (see PAGE LOAD event #2 above for those calls)           │
// │                                                                │
// │ Per 15s tick: 2 google.script.run, 2 CacheService reads        │
// │ Per day: 5,760 google.script.run, 5,760 CacheService reads    │
// │          (×2 = 11,520 total from both loops)                   │
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: EVERY 60 SECONDS (quota display refresh)                │
// ├─────────────────────────────────────────────────────────────────┤
// │ pollQuotaAndLimits() → fetchGitHubQuotaAndLimits()             │
// │    └─ 1 google.script.run (execution time ~100ms)              │
// │    └─ 1 UrlFetchApp: GitHub API GET /rate_limit                │
// │    └─ 1 GitHub API call                                        │
// │                                                                │
// │ Per day: 1,440 google.script.run, 1,440 UrlFetchApp,           │
// │          1,440 GitHub API calls                                 │
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: SPREADSHEET B1 EDITED (installable trigger)             │
// ├─────────────────────────────────────────────────────────────────┤
// │ onEditWriteB1ToCache(e)                                        │
// │    └─ 1 CacheService.put("live_b1", value, 21600)              │
// │    └─ 0 UrlFetchApp, 0 GitHub API, 0 SpreadsheetApp            │
// │    └─ Only fires for B1 edits on Live_Sheet                    │
// └─────────────────────────────────────────────────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: GITHUB PUSH (GitHub Action → doPost)                    │
// ├─────────────────────────────────────────────────────────────────┤
// │ GitHub Action curl → doPost(e)                                 │
// │    └─ 1 SpreadsheetApp: write C1                               │
// │    └─ 1 CacheService.put("pushed_version", value, 3600)        │
// │    └─ 0 UrlFetchApp, 0 GitHub API                              │
// │    └─ Only fires once per push (not polling)                   │
// └─────────────────────────────────────────────────────────────────┘
//
// DAILY TOTALS (1 browser tab open 24hrs, no deploys)
// ---------------------------------------------------
//   GitHub API:       ~1,442/day   (limit: 5,000/hr with token)
//     └─ 1,440 from pollQuotaAndLimits (every 60s)
//     └─ 1 from page load auto-pull
//     └─ 1 from page load quota check
//
//   UrlFetchApp:      ~1,442/day   (limit: 20,000/day)
//     └─ 1,440 from pollQuotaAndLimits (every 60s)
//     └─ 1 from page load auto-pull (GitHub API)
//     └─ 1 from page load quota check
//
//   SpreadsheetApp:   ~4/day       (limit: ~20,000/day)
//     └─ ~4 from readB1FromCacheOrSheet cache misses (every 6hrs)
//     └─ 0 from polling (cache handles it)
//
//   CacheService:     ~11,520/day  (no daily limit)
//     └─ 5,760 from pollB1FromCache (every 15s)
//     └─ 5,760 from pollPushedVersionFromCache (every 15s)
//
//   google.script.run: ~12,966/day (limit: none, but burns exec time)
//     └─ 11,520 from 15s polls (2 calls × 5,760)
//     └─ 1,440 from 60s polls
//     └─ ~6 from page load
//
//   Execution time:   ~10-11 min/day  (limit: 90 min/day)
//     └─ ~11,520 CacheService reads × ~30ms = ~5.8 min
//     └─ ~1,440 UrlFetchApp calls × ~200ms = ~4.8 min
//     └─ Each additional tab multiplies this
//
// COST OPTIMIZATION MEASURES
// --------------------------
//   1. CacheService for B1 reads:
//      WITHOUT: 5,760 SpreadsheetApp reads/day (every 15s)
//      WITH:    ~4 SpreadsheetApp reads/day (cache miss every 6hrs)
//      SAVINGS: 99.9% reduction in SpreadsheetApp calls
//
//   2. CacheService for pushed_version detection:
//      WITHOUT: Would need to poll GitHub API or SpreadsheetApp C1
//               every 15s = 5,760 extra API calls/day
//      WITH:    5,760 CacheService reads (free, no quota impact)
//      SAVINGS: 5,760 fewer UrlFetchApp or SpreadsheetApp calls/day
//
//   3. Version comparison in pullAndDeployFromGitHub():
//      WITHOUT: Every page load = 5 UrlFetchApp calls (full deploy)
//      WITH:    1 UrlFetchApp call when already up to date
//      SAVINGS: 4 UrlFetchApp calls per page load (80% reduction)
//
//   4. onEditWriteB1ToCache trigger (push model):
//      WITHOUT: Must poll SpreadsheetApp to detect B1 changes
//      WITH:    Trigger pushes to cache on edit, polls read cache
//      SAVINGS: Eliminates all SpreadsheetApp polling for B1
//
//   5. doPost cache flag for push detection:
//      WITHOUT: Would need to poll GitHub API for new commits
//      WITH:    GitHub Action POSTs once → cache flag → client polls cache
//      SAVINGS: Eliminates GitHub API polling for version detection
//
// WARNING — MULTIPLE TABS:
//   Each open browser tab runs its own polling loops independently.
//   2 tabs = 2× all daily totals. With 3+ tabs, execution time
//   (90 min/day limit) becomes the binding constraint.
//   Recommendation: keep to 1-2 tabs max.
//
// API ENDPOINTS USED
// ------------------
// GitHub:
//   GET https://api.github.com/repos/{owner}/{repo}/contents/{path}
//       Header: Accept: application/vnd.github.v3.raw
//       Returns raw file content, no CDN caching
//
// Apps Script:
//   GET  /v1/projects/{id}/content     → read current files (to preserve manifest)
//   PUT  /v1/projects/{id}/content     → overwrite project source files
//   POST /v1/projects/{id}/versions    → create new immutable version
//   PUT  /v1/projects/{id}/deployments/{id} → point deployment to new version
//   All require: Authorization: Bearer {ScriptApp.getOAuthToken()}
//
// appsscript.json (must be set in the Apps Script editor):
// {
//   "timeZone": "America/New_York",
//   "runtimeVersion": "V8",
//   "dependencies": {},
//   "webapp": {
//     "executeAs": "USER_DEPLOYING",
//     "access": "ANYONE_ANONYMOUS"
//   },
//   "exceptionLogging": "STACKDRIVER",
//   "oauthScopes": [
//     "https://www.googleapis.com/auth/script.projects",
//     "https://www.googleapis.com/auth/script.external_request",
//     "https://www.googleapis.com/auth/script.deployments",
//     "https://www.googleapis.com/auth/spreadsheets"
//   ]
// }
//
// SETUP STEPS
// -----------
// 1. Create a public GitHub repo with Code.gs
// 2. Create an Apps Script project, paste this code, fill in config vars
// 3. Enable "Show appsscript.json" in Project Settings, replace contents
// 4. Create or use a GCP project where you have Owner access
// 5. Enable Apps Script API in GCP project (APIs & Services → Library)
// 6. Link GCP project in Apps Script (Project Settings → Change project)
// 7. Enable Apps Script API at script.google.com/home/usersettings
// 8. Set up OAuth Consent Screen in GCP (APIs & Services → Credentials → Consent)
// 9. Deploy as Web app (Deploy → New deployment → Web app → Anyone)
// 10. Copy Deployment ID into DEPLOYMENT_ID variable
// 11. Run any function from editor to trigger OAuth authorization
// 12. Update Code.gs on GitHub with the correct config values
//
// TROUBLESHOOTING
// ---------------
// 403 "Apps Script API has not been used"
//   → Enable the API in your GCP project (step 5)
// 403 "Insufficient authentication scopes"
//   → Ensure all 3 scopes in appsscript.json, re-authorize (step 11)
// 403 "serviceusage.services.enable"
//   → You need Owner on the GCP project. Create your own (step 4)
// 404 from GitHub
//   → Check config vars are exact and case-sensitive
// Page shows old version
//   → Dynamic loader should prevent this. If it persists, GitHub API
//     may be briefly stale — wait a moment and retry
// Blank page on reload
//   → window.location.reload() inside the GAS sandbox iframe reloads the
//     sandbox URL which comes back blank. Do NOT use location.reload().
//     The app is embedded on https://www.shadowaisolutions.com/test and
//     uses postMessage to tell the embedding page to reload. For manual
//     reload, the "Reload Page" button uses <form target="_top"> pointing
//     to the embedding page URL.
// "Illegal character" on line with backtick
//   → V8 runtime not enabled. Set "runtimeVersion": "V8" in appsscript.json
//
// =============================================

var VERSION = "2.01";
var TITLE = "Attempt 24";

function doGet() {
  var html = `
    <html>
    <head>
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
      <style>
        html, body { height: 100%; margin: 0; overflow: auto; }
        body { font-family: Arial; display: flex; flex-direction: column; align-items: center; padding: 10px 0; box-sizing: border-box; }
        #splash { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #0d47a1; z-index: 9999; transition: opacity 0.3s ease; display: flex; align-items: center; justify-content: center; }
        #splash img { max-width: 500px; max-height: 500px; }
        #version { font-size: 80px; font-weight: bold; color: #e65100; line-height: 1; }
        button { background: #e65100; color: white; border: none; padding: 8px 20px;
                 border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 10px; }
        button:hover { background: #bf360c; }
        #result { margin-top: 8px; padding: 8px 15px; border-radius: 8px; font-size: 13px; }
        #sheet-container { margin-top: 10px; width: 90%; max-width: 600px; position: relative; }
        #sheet-container h3 { text-align: center; color: #333; margin: 0 0 4px 0; }
        #token-info { position: absolute; right: -170px; top: 0; font-size: 11px; color: #666; text-align: left; line-height: 1.6; white-space: nowrap; }
        #token-info div { margin-bottom: 2px; }
        #sheet-container iframe { width: 100%; height: 300px; border: 1px solid #ddd; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div id="splash"><img src="https://www.shadowaisolutions.com/SAIS%20Logo.png" alt=""></div>
      <h1 id="title" style="font-size: 28px; margin: 0 0 4px 0;">...</h1>
      <div id="version">...</div>
      <button onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button>
      <form id="redirect-form" method="GET" action="https://www.shadowaisolutions.com/test" target="_top" style="display:inline;">
        <button id="reload-btn" type="submit" style="background:#2e7d32;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:14px;margin-top:10px;">🔄 Reload Page</button>
      </form>
      <div id="result"></div>
      <div id="versionCount" style="margin-top: 6px; font-size: 12px; color: #888;"></div>

      <div id="sheet-container">
        <h3>Live_Sheet</h3>
        <div id="token-info">...</div>
        <div id="live-b1" style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 4px; text-align: center;">...</div>
        <iframe src="https://docs.google.com/spreadsheets/d/11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI/edit?rm=minimal"></iframe>
      </div>

      <div style="margin-top: 10px; font-size: 14px; color: #333;">
        <span style="font-weight: bold;">Did it redirect?</span>
        <label style="margin-left: 10px;"><input type="radio" name="redirected" value="yes"> Yes</label>
        <label style="margin-left: 10px;"><input type="radio" name="redirected" value="no"> No</label>
      </div>
      <div style="margin-top: 10px;">
        <button onclick="playReadySound()" style="background:#1565c0;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;">🔊 Test Sound (Drive)</button>
        <button onclick="playBeep()" style="background:#6a1b9a;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;margin-left:6px;">🔔 Test Beep (Old)</button>
      </div>
      <div style="margin-top: 10px; font-size: 14px; color: #333;">
        <span style="font-weight: bold;">Is this awesome?</span>
        <label style="margin-left: 10px;"><input type="radio" name="awesome" value="yes"> Yes</label>
        <label style="margin-left: 10px;"><input type="radio" name="awesome" value="no"> No</label>
      </div>

      <script>
        // Pre-load Drive sound from server on page load
        var _soundDataUrl = null;
        var _soundError = null;
        google.script.run
          .withSuccessHandler(function(dataUrl) { _soundDataUrl = dataUrl; })
          .withFailureHandler(function(err) { _soundError = err.message; })
          .getSoundBase64();

        function playReadySound() {
          var status = document.getElementById('result');
          if (_soundError) {
            status.style.background = '#ffebee';
            status.textContent = 'Server error loading sound: ' + _soundError;
            return;
          }
          if (!_soundDataUrl) {
            status.style.background = '#fff3e0';
            status.textContent = 'Sound still loading from server...';
            return;
          }
          status.style.background = '#fff3e0';
          status.textContent = 'Playing... (length: ' + _soundDataUrl.length + ')';
          try {
            var audio = new Audio(_soundDataUrl);
            audio.play().then(function() {
              status.style.background = '#e8f5e9';
              status.textContent = 'Drive sound playing (length: ' + _soundDataUrl.length + ')';
            }).catch(function(e) {
              status.style.background = '#ffebee';
              status.textContent = 'Play rejected: ' + e.message;
            });
          } catch(e) {
            status.style.background = '#ffebee';
            status.textContent = 'Audio error: ' + e.message;
          }
        }

        // Exact v1.67 beep code (AudioContext) — restored unchanged
        function playBeep() {
          try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.3;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } catch(e) {}
        }

        function applyData(data) {
          for (var key in data) {
            var el = document.getElementById(key);
            if (el) {
              el.textContent = data[key];
              if (key === 'versionCount' && data[key].indexOf('LIMIT') !== -1) {
                el.style.color = '#d32f2f';
                el.style.fontWeight = 'bold';
              }
            }
          }
        }

        google.script.run
          .withSuccessHandler(function(data) { applyData(data); })
          .getAppData();

        // Poll cell B1 from cache every 15s (cache is updated by onEditWriteB1ToCache trigger)
        function pollB1FromCache() {
          google.script.run
            .withSuccessHandler(function(val) {
              document.getElementById('live-b1').textContent = val;
            })
            .readB1FromCacheOrSheet();
        }
        pollB1FromCache();
        setInterval(pollB1FromCache, 15000);

        // Poll for new pushed version every 15s (set by doPost via GitHub Action)
        // If a new version was pushed, auto-pull without user intervention
        var _autoPulling = false;
        function pollPushedVersionFromCache() {
          if (_autoPulling) return;
          google.script.run
            .withSuccessHandler(function(pushed) {
              if (!pushed) return;
              var current = (document.getElementById('version').textContent || '').trim();
              if (pushed !== current && pushed !== '') {
                _autoPulling = true;
                checkForUpdates();
                setTimeout(function() { _autoPulling = false; }, 30000);
              }
            })
            .readPushedVersionFromCache();
        }
        setInterval(pollPushedVersionFromCache, 15000);

        // Auto-pull from GitHub on every page load
        checkForUpdates();

        // Poll token/quota usage (on load + every 60s)
        function pollQuotaAndLimits() {
          google.script.run
            .withSuccessHandler(function(t) {
              document.getElementById('token-info').innerHTML =
                '<div>GitHub: ' + t.github + '</div>'
                + '<div>UrlFetch: ' + t.urlFetch + '</div>'
                + '<div>Sheets: ' + t.spreadsheet + '</div>'
                + '<div>Exec: ' + t.execTime + '</div>';
            })
            .fetchGitHubQuotaAndLimits();
        }
        pollQuotaAndLimits();
        setInterval(pollQuotaAndLimits, 60000);

        // Dark blue splash screen — fade out after 1 second
        setTimeout(function() {
          var splash = document.getElementById('splash');
          splash.style.opacity = '0';
          setTimeout(function() { splash.style.display = 'none'; }, 300);
        }, 1000);

        function checkForUpdates() {
          document.getElementById('result').style.background = '#fff3e0';
          document.getElementById('result').innerHTML = '⏳ Pulling...';
          google.script.run
            .withSuccessHandler(function(msg) {
              var wasUpdated = msg.indexOf('Updated to') === 0;
              document.getElementById('result').style.background = '#e8f5e9';
              document.getElementById('result').innerHTML = '✅ ' + msg;
              if (!wasUpdated) {
                // Already up to date — just refresh data, no redirect
                setTimeout(function() { document.getElementById('result').innerHTML = ''; }, 2000);
                return;
              }
              // New version deployed — update dynamic content and highlight reload button
              setTimeout(function() {
                google.script.run.writeVersionToSheetA1();
                google.script.run.writeVersionToSheetC1();
                google.script.run
                  .withSuccessHandler(function(data) {
                    applyData(data);
                    // Highlight the Reload Page button red to signal update is ready
                    var btn = document.getElementById('reload-btn');
                    btn.style.background = '#d32f2f';
                    btn.textContent = '⚠️ Update Available — Reload Page';
                    // Tell parent/top page (if embedded) to reload
                    // GAS double-iframes: your page > Google wrapper > sandbox (this code)
                    // So window.parent = Google wrapper, window.top = your page
                    var reloadMsg = {type: 'gas-reload', version: data.version};
                    if (_soundDataUrl) reloadMsg.soundDataUrl = _soundDataUrl;
                    try { window.top.postMessage(reloadMsg, '*'); } catch(e) {}
                    try { window.parent.postMessage(reloadMsg, '*'); } catch(e) {}
                  })
                  .getAppData();
              }, 2000);
            })
            .withFailureHandler(function(err) {
              document.getElementById('result').style.background = '#ffebee';
              document.getElementById('result').innerHTML = '❌ ' + err.message;
            })
            .pullAndDeployFromGitHub();
        }
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html)
    .setTitle("Claude GitHub")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// POST endpoint — called by GitHub Action after merging to main.
// Writes a value to cell C1 of Live_Sheet.
// Usage: curl -L -X POST "WEB_APP_URL" -d "action=writeC1&value=v1.09"
function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  if (action === "writeC1") {
    var value = (e.parameter.value) || "";
    var ss = SpreadsheetApp.openById("11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI");
    var sheet = ss.getSheetByName("Live_Sheet");
    if (!sheet) sheet = ss.insertSheet("Live_Sheet");
    sheet.getRange("C1").setValue(value + " — " + new Date().toLocaleString());
    // Signal to the web app client that a new version is available
    CacheService.getScriptCache().put("pushed_version", value, 3600);
    return ContentService.createTextOutput("OK");
  }
  return ContentService.createTextOutput("Unknown action");
}

function getAppData() {
  var data = { version: "v" + VERSION, title: TITLE };
  var vStatus = CacheService.getScriptCache().get("version_count_status");
  if (vStatus) data.versionCount = vStatus;
  return data;
}

function getSoundBase64() {
  var url = "https://drive.google.com/uc?export=download&id=1bzVp6wpTHdJ4BRX8gbtDN73soWpmq1kN";
  var response = UrlFetchApp.fetch(url, { followRedirects: true });
  var blob = response.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  var contentType = blob.getContentType() || "audio/mpeg";
  return "data:" + contentType + ";base64," + base64;
}

function fetchGitHubQuotaAndLimits() {
  var result = {};

  // GitHub API rate limit (queryable)
  var GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  var headers = {};
  if (GITHUB_TOKEN) {
    headers["Authorization"] = "token " + GITHUB_TOKEN;
  }
  try {
    var resp = UrlFetchApp.fetch("https://api.github.com/rate_limit", { headers: headers });
    var data = JSON.parse(resp.getContentText());
    var core = data.resources.core;
    result.github = core.remaining + "/" + core.limit + "/hr";
  } catch(e) {
    result.github = "error";
  }

  // UrlFetchApp: 20,000/day (not queryable — show limit only)
  result.urlFetch = "20,000/day";

  // SpreadsheetApp: ~20,000/day (not queryable — show limit only)
  result.spreadsheet = "~20,000/day";

  // Apps Script execution time: 90 min/day (not queryable)
  result.execTime = "90 min/day";

  return result;
}

function readPushedVersionFromCache() {
  return CacheService.getScriptCache().get("pushed_version") || "";
}

function readB1FromCacheOrSheet() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("live_b1");
  if (cached !== null) return cached;

  var ss = SpreadsheetApp.openById("11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI");
  var sheet = ss.getSheetByName("Live_Sheet");
  if (!sheet) return "";
  var val = sheet.getRange("B1").getValue();
  var result = val !== null && val !== undefined ? String(val) : "";
  cache.put("live_b1", result, 21600);
  return result;
}

// Installable onEdit trigger. Writes B1 value to CacheService when edited.
// Install: Apps Script editor → Triggers → + Add Trigger →
//   Function: onEditWriteB1ToCache, Event source: From spreadsheet, Event type: On edit
function onEditWriteB1ToCache(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== "Live_Sheet") return;
  if (e.range.getRow() !== 1 || e.range.getColumn() !== 2) return;
  var val = e.range.getValue();
  var result = val !== null && val !== undefined ? String(val) : "";
  CacheService.getScriptCache().put("live_b1", result, 21600);
}

function writeVersionToSheetA1() {
  var ss = SpreadsheetApp.openById("11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI");
  var sheet = ss.getSheetByName("Live_Sheet");
  if (!sheet) {
    sheet = ss.insertSheet("Live_Sheet");
  }
  sheet.getRange("A1").setValue("v" + VERSION + " — " + new Date().toLocaleString());
}

function writeVersionToSheetC1() {
  var ss = SpreadsheetApp.openById("11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI");
  var sheet = ss.getSheetByName("Live_Sheet");
  if (!sheet) {
    sheet = ss.insertSheet("Live_Sheet");
  }
  sheet.getRange("C1").setValue("v" + VERSION + " — " + new Date().toLocaleString());
}

function pullAndDeployFromGitHub() {
  var GITHUB_OWNER = "ShadowAISolutions";
  var GITHUB_REPO  = "gas-self-update-test";
  var GITHUB_BRANCH = "main";
  var FILE_PATH    = "Code.gs";
  var DEPLOYMENT_ID = "AKfycbwkKbU1fJ-bsVUi9ZQ8d3MVdT2FfTsG14h52R1K_bsreaL7RgmkC4JJrMtwiq5VZEYX-g";

  // GitHub token stored in Script Properties (not in source code for security)
  // Set it in Apps Script editor: Project Settings → Script Properties → Add
  //   Key: GITHUB_TOKEN   Value: your github_pat_... token
  var GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");

  var apiUrl = "https://api.github.com/repos/"
    + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + FILE_PATH
    + "?ref=" + GITHUB_BRANCH + "&t=" + new Date().getTime();

  var fetchHeaders = { "Accept": "application/vnd.github.v3.raw" };
  if (GITHUB_TOKEN) {
    fetchHeaders["Authorization"] = "token " + GITHUB_TOKEN;
  }

  var response = UrlFetchApp.fetch(apiUrl, {
    headers: fetchHeaders
  });
  var newCode = response.getContentText();

  // Extract VERSION from the pulled code
  var versionMatch = newCode.match(/var VERSION\s*=\s*"([^"]+)"/);
  var pulledVersion = versionMatch ? versionMatch[1] : null;

  // If the pulled version matches what's already running, skip deployment
  if (pulledVersion && pulledVersion === VERSION) {
    return "Already up to date (v" + VERSION + ")";
  }

  var scriptId = ScriptApp.getScriptId();
  var url = "https://script.googleapis.com/v1/projects/" + scriptId + "/content";
  var current = UrlFetchApp.fetch(url, {
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() }
  });
  var currentFiles = JSON.parse(current.getContentText()).files;
  var manifest = currentFiles.find(function(f) { return f.name === "appsscript"; });

  var payload = {
    files: [
      { name: "Code", type: "SERVER_JS", source: newCode },
      manifest
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(payload)
  });

  var versionUrl = "https://script.googleapis.com/v1/projects/" + scriptId + "/versions";
  var versionResponse = UrlFetchApp.fetch(versionUrl, {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ description: "v" + pulledVersion + " — from GitHub " + new Date().toLocaleString() })
  });
  var newVersion = JSON.parse(versionResponse.getContentText()).versionNumber;

  var deployUrl = "https://script.googleapis.com/v1/projects/" + scriptId
    + "/deployments/" + DEPLOYMENT_ID;
  UrlFetchApp.fetch(deployUrl, {
    method: "put",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      deploymentConfig: {
        scriptId: scriptId,
        versionNumber: newVersion,
        description: "v" + pulledVersion + " (deployment " + newVersion + ")"
      }
    })
  });

  // Clean up old deployments and report version count.
  // NOTE: Apps Script API does NOT support deleting versions (no DELETE endpoint).
  // Versions can ONLY be deleted via the Apps Script editor web UI:
  //   Project History > Bulk delete versions
  // But we CAN delete unused deployments via API, which frees versions for manual deletion.
  var cleanupInfo = "";
  try {
    // 1. Delete unused deployments (frees versions for manual deletion in UI)
    var deletedDeploys = 0;
    var deployPageToken = null;
    var allDeploys = [];
    do {
      var dListUrl = "https://script.googleapis.com/v1/projects/" + scriptId + "/deployments"
        + (deployPageToken ? "?pageToken=" + deployPageToken : "");
      var dListResp = UrlFetchApp.fetch(dListUrl, {
        headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() }
      });
      var dListData = JSON.parse(dListResp.getContentText());
      if (dListData.deployments) {
        allDeploys = allDeploys.concat(dListData.deployments);
      }
      deployPageToken = dListData.nextPageToken || null;
    } while (deployPageToken);

    for (var d = 0; d < allDeploys.length; d++) {
      var dep = allDeploys[d];
      // Skip the active web app deployment and the HEAD deployment
      if (dep.deploymentId === DEPLOYMENT_ID) continue;
      if (dep.deploymentConfig && dep.deploymentConfig.versionNumber === 0) continue;
      try {
        var dDelUrl = "https://script.googleapis.com/v1/projects/" + scriptId
          + "/deployments/" + dep.deploymentId;
        UrlFetchApp.fetch(dDelUrl, {
          method: "delete",
          headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() }
        });
        deletedDeploys++;
      } catch(dDelErr) {
        // Skip deployments that can't be deleted
      }
    }

    // 2. Count total versions so user knows when to manually clean up
    var totalVersions = 0;
    var vPageToken = null;
    do {
      var vListUrl = "https://script.googleapis.com/v1/projects/" + scriptId + "/versions"
        + (vPageToken ? "?pageToken=" + vPageToken : "");
      var vListResp = UrlFetchApp.fetch(vListUrl, {
        headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() }
      });
      var vListData = JSON.parse(vListResp.getContentText());
      if (vListData.versions) {
        totalVersions += vListData.versions.length;
      }
      vPageToken = vListData.nextPageToken || null;
    } while (vPageToken);

    cleanupInfo = " | " + totalVersions + "/200 versions";
    if (deletedDeploys > 0) cleanupInfo += ", freed " + deletedDeploys + " old deployment(s)";
    // Cache the version count so getAppData() can display it persistently
    var versionStatus = totalVersions + "/200 versions";
    if (totalVersions >= 180) versionStatus += " — APPROACHING LIMIT! Manually delete old versions in Apps Script editor: Project History > Bulk delete versions";
    CacheService.getScriptCache().put("version_count_status", versionStatus, 21600);
  } catch(cleanupErr) {
    cleanupInfo = " | Version cleanup error: " + cleanupErr.message;
  }

  return "Updated to v" + pulledVersion + " (deployment " + newVersion + ")" + cleanupInfo;
}
