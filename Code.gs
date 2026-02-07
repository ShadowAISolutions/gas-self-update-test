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
// EMBEDDING (for auto-reload)
// ----------------------------
// The web app is embedded as a full-screen iframe on an external page:
//   https://www.shadowaisolutions.com/test
// This solves the auto-reload problem (see PAGE RELOAD AFTER DEPLOY).
// The embedding page needs this HTML:
//   <iframe id="gas-app" src="EXEC_URL" style="width:100%;height:100vh;border:none;"></iframe>
//   <script>
//     window.addEventListener('message', function(e) {
//       if (e.data && e.data.type === 'gas-reload') {
//         window.location.reload();
//       }
//     });
//   </script>
// When the GAS app deploys an update, it sends postMessage to the
// embedding page, which reloads itself (and the iframe). Fully automatic.
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

var VERSION = "1.69";
var TITLE = "Attempt 10";

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
      <h1 id="title" style="font-size: 28px; margin: 0 0 4px 0;">...</h1>
      <div id="version">...</div>
      <button onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button>
      <form id="redirect-form" method="GET" action="https://www.shadowaisolutions.com/test" target="_top" style="display:inline;">
        <button id="reload-btn" type="submit" style="background:#2e7d32;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:14px;margin-top:10px;">🔄 Reload Page</button>
      </form>
      <div id="result"></div>

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
        <button onclick="playReadySound()" style="background:#1565c0;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;">🔊 Test Sound</button>
      </div>
      <div style="margin-top: 10px; font-size: 14px; color: #333;">
        <span style="font-weight: bold;">Is this awesome?</span>
        <label style="margin-left: 10px;"><input type="radio" name="awesome" value="yes"> Yes</label>
        <label style="margin-left: 10px;"><input type="radio" name="awesome" value="no"> No</label>
      </div>

      <script>
        var SOUND_B64 = "SUQzAwAAAAAHdlRDT04AAAAHAAAAT3RoZXIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7pAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFZCUkkAAQkxAGQAAFtQAAAAXQBcAAEAAgABAeAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAYACQAJAAkACQAJAAeACQAHgAkAB4AJAAqACQAJAAeACQAJAAeACQAJAAkACQAJAAeACQAHgAkACQAHgAVAA8ADwAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAAAAAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAAeAAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAA8AAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FABaAAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAB4AAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FACWAAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAC0AAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FADSAAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FADwAADoAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP//////////////////////////////////////f+yDQAAgBiyBABtLv/p/+U9Xl3/sg0AAIAYsgQAbS//7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABL/6f/lPV5dCRttFVdQAhAZtySWgrwgYyI6RVS761OKmn5dbWD/liQc9ayZBG9ymVIQkbbRVXUAIQGbckv/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABFoK8IGMiOkVUu+tTipp+XW1g/5YkHPWsmQRvcplSE8qhaYAADj/gZw4uHQ+baH2Vyiz9ByuJxRNxd9Iff/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABLMUpTyqFpgAAOP+BnDi4dD5tofZXKLP0HK4nFE3F30h9sxSkSRyNtF+QD7BgQI7tothBG4DHETfcx6K6f/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABKk9ZUkmxf/hkSRyNtF+QD7BgQI7tothBG4DHETfcx6K6ak9ZUkmxf/hkFf7+VpQBFjjYlBKUAqjQhODgP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABM5qSi2vvSnI3rLLW5Mc918811KFTZALANCv9/K0oAixxsSglKAVRoQnBwGc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rVpSz9DUf/712ID////////7FAACgAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAAggAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAA+gAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FABcgAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAB6gAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FACYgAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAC2gAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FADUgAAAAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FADygAEQAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP/////////////////////////////////////////////////////////////////////////////////7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABP//////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7FAD/gAHgAEuAAAAIAAAJcAAAAQAAAS4AAAAgAAAlwAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFRBRwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM";
        function playReadySound() {
          try {
            var audio = new Audio('data:audio/mpeg;base64,' + SOUND_B64);
            audio.play().catch(function(e) { console.log("Sound play failed:", e); });
          } catch(e) {}
        }

        function applyData(data) {
          for (var key in data) {
            var el = document.getElementById(key);
            if (el) el.textContent = data[key];
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
                    try { window.top.postMessage({type: 'gas-reload', version: data.version}, '*'); } catch(e) {}
                    try { window.parent.postMessage({type: 'gas-reload', version: data.version}, '*'); } catch(e) {}
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
  return { version: "v" + VERSION, title: TITLE };
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

  return "Updated to v" + pulledVersion + " (deployment " + newVersion + ")";
}
