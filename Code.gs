// =============================================
// VERSION 2 — Updated from GitHub!
// =============================================

function doGet() {
  var html = `
    <html>
    <head>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 40px auto; padding: 20px; }
        .version { background: #fff3e0; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .status  { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 10px 0; }
        button   { background: #e65100; color: white; border: none; padding: 12px 24px;
                   border-radius: 6px; cursor: pointer; font-size: 16px; margin: 5px; }
        button:hover { background: #bf360c; }
        h1 { color: #e65100; }
        #result { margin-top: 15px; padding: 15px; border-radius: 8px; display: none; }
      </style>
    </head>
    <body>
      <h1>🟠 GitHub → Apps Script — UPDATED!</h1>
      <div class="version">
        <strong>Current Version:</strong> 3.0 — Updated from GitHub! 🎉
      </div>
      <div class="status">
        <strong>Message:</strong> Hello from the UPDATED code pulled from GitHub!
      </div>
      <p>This page was automatically updated by pulling code from GitHub. Pretty cool right?</p>
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
         "<br><b>Code version:</b> 2.0";
}

function pullFromGitHub() {
  var GITHUB_OWNER = "ShadowAISolutions";
  var GITHUB_REPO  = "gas-self-update-test";
  var GITHUB_BRANCH = "main";
  var FILE_PATH    = "Code.gs";
  var DEPLOYMENT_ID = "AKfycbyztYMy4pQpQmSX2We8WF7Ng9xeMBVmsJohqVe9evQZdJFzlafUati9B0DXJFXlDk-mQQ";

  var rawUrl = "https://raw.githubusercontent.com/"
    + GITHUB_OWNER + "/" + GITHUB_REPO + "/" + GITHUB_BRANCH + "/" + FILE_PATH;

  var response = UrlFetchApp.fetch(rawUrl);
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

  return "Code updated and deployed as version " + newVersion + "! Fetched " + newCode.length + " characters.";
}
