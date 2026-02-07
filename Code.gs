// =============================================
// SELF-UPDATING GOOGLE APPS SCRIPT FROM GITHUB
// =============================================
//
// WHAT THIS IS
// ------------
// A Google Apps Script web app that pulls its own source code from
// a GitHub repository and redeploys itself via a single button click.
// GitHub is the source of truth. Editing Code.gs on GitHub and clicking
// "Pull Latest" in the web app updates the live deployment instantly.
//
// ARCHITECTURE
// ------------
// The web app uses a "dynamic loader" pattern:
//   - doGet() serves a STATIC HTML shell that never changes
//   - All visible content (version number etc.) is fetched at runtime
//     via google.script.run calls to server-side functions
//   - This bypasses Google's aggressive server-side HTML caching
//     which cannot be disabled on Apps Script web apps
//
// Pull flow when the button is clicked:
//   1. pullFromGitHub() fetches Code.gs from GitHub API
//      (uses api.github.com, NOT raw.githubusercontent.com which has
//      a 5-minute CDN cache that causes stale pulls)
//   2. Overwrites the Apps Script project source via Apps Script API
//      PUT /v1/projects/{scriptId}/content
//   3. Creates a new immutable version via
//      POST /v1/projects/{scriptId}/versions
//   4. Updates the web app deployment to point to the new version via
//      PUT /v1/projects/{scriptId}/deployments/{deploymentId}
//   5. Client-side JS waits 2 seconds then re-calls getVersion()
//      via google.script.run which executes the NEW server-side code,
//      updating the displayed version without a page reload
//
// KEY DESIGN DECISIONS & GOTCHAS
// ------------------------------
// - V8 runtime is REQUIRED (set in appsscript.json) because the code
//   uses template literals (backticks). Without V8, you get
//   "illegal character" syntax errors.
//
// - Three OAuth scopes are required:
//     script.projects        → read/write project source code
//     script.external_request → fetch from GitHub API
//     script.deployments     → update the live deployment
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
//     "https://www.googleapis.com/auth/script.deployments"
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

var VERSION = "1.7";

function doGet() {
  var html = `
    <html>
    <head>
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
      <style>
        body { font-family: Arial; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        #version { font-size: 120px; font-weight: bold; color: #e65100; }
        button { background: #e65100; color: white; border: none; padding: 12px 24px;
                 border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 20px; }
        button:hover { background: #bf360c; }
        #result { margin-top: 15px; padding: 15px; border-radius: 8px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div id="version">...</div>
      <button onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button>
      <div id="result"></div>

      <script>
        google.script.run
          .withSuccessHandler(function(v) { document.getElementById('version').textContent = v; })
          .getVersion();

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
                  .withSuccessHandler(function(v) {
                    document.getElementById('version').textContent = v;
                    document.getElementById('result').innerHTML = '';
                  })
                  .getVersion();
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
    .setTitle("GitHub Sync Test")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getVersion() {
  return VERSION;
}

function pullFromGitHub() {
  var GITHUB_OWNER = "ShadowAISolutions";
  var GITHUB_REPO  = "gas-self-update-test";
  var GITHUB_BRANCH = "main";
  var FILE_PATH    = "Code.gs";
  var DEPLOYMENT_ID = "AKfycbwkKbU1fJ-bsVUi9ZQ8d3MVdT2FfTsG14h52R1K_bsreaL7RgmkC4JJrMtwiq5VZEYX-g";

  var apiUrl = "https://api.github.com/repos/"
    + GITHUB_OWNER + "/" + GITHUB_REPO + "/contents/" + FILE_PATH
    + "?ref=" + GITHUB_BRANCH + "&t=" + new Date().getTime();

  var response = UrlFetchApp.fetch(apiUrl, {
    headers: { "Accept": "application/vnd.github.v3.raw" }
  });
  var newCode = response.getContentText();

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
    payload: JSON.stringify({ description: "Auto-updated from GitHub " + new Date().toLocaleString() })
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
        description: "v" + newVersion + " — auto-deployed from GitHub"
      }
    })
  });

  return "Done! Version " + newVersion;
}
