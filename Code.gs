// =============================================
// SELF-UPDATING GOOGLE APPS SCRIPT FROM GITHUB
// =============================================
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
// TO UPDATE THIS APP VIA CLAUDE CODE:
//   Just ask Claude Code to change the VERSION variable (or anything
//   else in this file). It will commit, push to a claude/* branch,
//   and the GitHub Action will merge to main automatically. Then
//   click "Pull Latest" in the web app to deploy.
//
// IMPORTANT — KEEP THIS OVERVIEW UP TO DATE:
//   Whenever you (Claude Code) make a STRUCTURAL change to this file
//   (new functions, changed architecture, new integrations, new config
//   variables like SPREADSHEET_ID or DEPLOYMENT_ID, changed pull flow,
//   etc.), you MUST update the relevant section of this overview in
//   the same commit. Do NOT document simple variable changes (like
//   bumping VERSION or changing TITLE), but DO document anything that
//   affects how the system works. This overview is the only context
//   a future Claude Code session will have — keep it accurate.
//
// IMPORTANT — AUTO-INCREMENT VERSION ON EVERY COMMIT:
//   Whenever you (Claude Code) make ANY change to this file and commit,
//   you MUST also increment the VERSION variable by 0.1 as part of that
//   same commit. For example, if VERSION is currently "1.8", change it
//   to "1.9" before committing. If it's "1.9", change it to "2.0".
//   This is a hard rule — no commit to Code.gs should ever leave
//   VERSION unchanged. The version number is how the user tracks that
//   updates have reached the live web app.
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
// Pull flow when the button is clicked:
//   1. pullFromGitHub() fetches Code.gs from GitHub API
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
//      writeVersionToSheet() which writes "v" + VERSION to cell A1
//      of the "Live_Sheet" tab in the linked Google Sheet.
//      IMPORTANT: This is called from the CLIENT-SIDE callback, NOT
//      from inside pullFromGitHub(). This is critical because
//      pullFromGitHub() runs as the OLD deployed code (VERSION still
//      holds the previous value). By calling writeVersionToSheet()
//      from the post-pull callback, it executes as the NEW code
//      where VERSION is correct. This pattern should be used for
//      any post-deployment side effects — always trigger them from
//      the client callback, never from pullFromGitHub() itself.
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
// CONFIG VARIABLES (in pullFromGitHub)
// ------------------------------------
// GITHUB_OWNER  → GitHub username or organization
// GITHUB_REPO   → repository name
// GITHUB_BRANCH → branch name (usually "main")
// FILE_PATH     → path to the .gs file in the repo
// DEPLOYMENT_ID → from Deploy → Manage deployments in the Apps Script editor
//                 (this is the long AKfycb... string, NOT the web app URL)
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
//   → Apps Script iframe blocks location.reload(). This architecture
//     avoids reloads entirely by re-calling getVersion() dynamically
// "Illegal character" on line with backtick
//   → V8 runtime not enabled. Set "runtimeVersion": "V8" in appsscript.json
//
// =============================================

var VERSION = "3.8";
var TITLE = "Whatup";

function doGet() {
  var html = `
    <html>
    <head>
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
      <style>
        body { font-family: Arial; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px 0; }
        #version { font-size: 120px; font-weight: bold; color: #e65100; }
        button { background: #e65100; color: white; border: none; padding: 12px 24px;
                 border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 20px; }
        button:hover { background: #bf360c; }
        #result { margin-top: 15px; padding: 15px; border-radius: 8px; font-size: 14px; }
        #sheet-container { margin-top: 25px; width: 90%; max-width: 600px; }
        #sheet-container h3 { text-align: center; color: #333; margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <h1 id="title" style="font-size: 36px; margin-bottom: 10px;">...</h1>
      <div id="version">...</div>
      <button onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button>
      <div id="result"></div>

      <div id="sheet-container">
        <h3>Live_Sheet</h3>
        <iframe src="https://docs.google.com/spreadsheets/d/11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI/edit?rm=minimal"
          style="width:100%; height:300px; border:1px solid #ddd; border-radius:6px;"></iframe>
      </div>

      <script>
        function applyData(data) {
          for (var key in data) {
            var el = document.getElementById(key);
            if (el) el.textContent = data[key];
          }
        }

        google.script.run
          .withSuccessHandler(applyData)
          .getAppData();

        function checkForUpdates() {
          document.getElementById('result').style.background = '#fff3e0';
          document.getElementById('result').innerHTML = '⏳ Pulling...';
          google.script.run
            .withSuccessHandler(function(msg) {
              document.getElementById('result').style.background = '#e8f5e9';
              document.getElementById('result').innerHTML = '✅ ' + msg;
              setTimeout(function() {
                document.getElementById('result').innerHTML = '⏳ Loading new version...';
                google.script.run
                  .withSuccessHandler(function(data) {
                    applyData(data);
                    document.getElementById('result').innerHTML = '';
                    // Write to spreadsheet using the NEW deployed code
                    google.script.run.writeVersionToSheet();
                  })
                  .getAppData();
              }, 2000);
            })
            .withFailureHandler(function(err) {
              document.getElementById('result').style.background = '#ffebee';
              document.getElementById('result').innerHTML = '❌ ' + err.message;
            })
            .pullFromGitHub();
        }
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html)
    .setTitle("Claude GitHub")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getVersion() {
  return VERSION;
}

function getTitle() {
  return TITLE;
}

function getAppData() {
  return { version: "v" + VERSION, title: TITLE };
}

function writeVersionToSheet() {
  var ss = SpreadsheetApp.openById("11bgXlf8renF2MUwRAs9QXQjhrv3AxJu5b66u0QLTAeI");
  var sheet = ss.getSheetByName("Live_Sheet");
  if (!sheet) {
    sheet = ss.insertSheet("Live_Sheet");
  }
  sheet.getRange("A1").setValue("v" + VERSION);
}

function pullFromGitHub() {
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
