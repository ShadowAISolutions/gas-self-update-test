// =============================================
// VERSION 1 — The original code
// =============================================

function doGet() {
  var html = `
    <html>
    <head>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 40px auto; padding: 20px; }
        .version { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .status  { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 10px 0; }
        button   { background: #1976d2; color: white; border: none; padding: 12px 24px;
                   border-radius: 6px; cursor: pointer; font-size: 16px; margin: 5px; }
        button:hover { background: #1565c0; }
        h1 { color: #1976d2; }
        #result { margin-top: 15px; padding: 15px; border-radius: 8px; display: none; }
      </style>
    </head>
    <body>
      <h1>🔵 GitHub → Apps Script Test</h1>
      <div class="version">
        <strong>Current Version:</strong> 1.0 — Original deployment
      </div>
      <div class="status">
        <strong>Message:</strong> Hello from the ORIGINAL code!
      </div>
      <p>This page is served by Google Apps Script. The code comes from GitHub.</p>
      <button onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button>
      <button onclick="getInfo()">ℹ️ Show Script Info</button>
      <div id="result"></div>

      <script>
        function checkForUpdates() {
          document.getElementById('result').style.display = 'block';
          document.getElementById('result').style.background = '#fff3e0';
          document.getElementById('result').innerHTML = '⏳ Pulling code from GitHub...';
          google.script.run
            .withSuccessHandler(function(msg) {
              document.getElementById('result').style.background = '#e8f5e9';
              document.getElementById('result').innerHTML = '✅ ' + msg + '<br><br>🔄 <b>Refresh this page</b> to see the new version!';
            })
            .withFailureHandler(function(err) {
              document.getElementById('result').style.background = '#ffebee';
              document.getElementById('result').innerHTML = '❌ Error: ' + err.message;
            })
            .pullFromGitHub();
        }
        function getInfo() {
          document.getElementById('result').style.display = 'block';
          document.getElementById('result').style.background = '#f3e5f5';
          document.getElementById('result').innerHTML = '⏳ Loading info...';
          google.script.run
            .withSuccessHandler(function(info) {
              document.getElementById('result').innerHTML = info;
            })
            .getScriptInfo();
        }
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setTitle("GitHub Sync Test");
}

function getScriptInfo() {
  return "<b>Script ID:</b> " + ScriptApp.getScriptId() +
         "<br><b>Last updated:</b> " + new Date().toLocaleString() +
         "<br><b>Code version:</b> 1.0";
}

function pullFromGitHub() {
  // ─── CONFIGURE THESE ───
  var GITHUB_OWNER = "YOUR_GITHUB_USERNAME";
  var GITHUB_REPO  = "gas-self-update-test";
  var GITHUB_BRANCH = "main";
  var FILE_PATH    = "Code.gs";
  // ────────────────────────

  var rawUrl = "https://raw.githubusercontent.com/"
    + GITHUB_OWNER + "/" + GITHUB_REPO + "/" + GITHUB_BRANCH + "/" + FILE_PATH;

  // 1. Fetch the latest code from GitHub
  var response = UrlFetchApp.fetch(rawUrl);
  var newCode = response.getContentText();

  // 2. Get the current manifest so we don't lose it
  var scriptId = ScriptApp.getScriptId();
  var url = "https://script.googleapis.com/v1/projects/" + scriptId + "/content";
  var current = UrlFetchApp.fetch(url, {
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() }
  });
  var currentFiles = JSON.parse(current.getContentText()).files;
  var manifest = currentFiles.find(function(f) { return f.name === "appsscript"; });

  // 3. Push the new code via Apps Script API
  var payload = {
    files: [
      {
        name: "Code",
        type: "SERVER_JS",
        source: newCode
      },
      manifest  // keep the existing manifest
    ]
  };

  UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(payload)
  });

  return "Code updated from GitHub! Fetched " + newCode.length + " characters.";
}
