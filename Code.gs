// =============================================
// VERSION 9.1 — GitHub API fetch, no CDN cache
// =============================================

function doGet() {
  var html = `
    <html>
    <head>
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
      <meta http-equiv="Pragma" content="no-cache">
      <meta http-equiv="Expires" content="0">
      <style>
        body { font-family: Arial; max-width: 600px; margin: 40px auto; padding: 20px; }
        .version { padding: 15px; border-radius: 8px; margin: 10px 0; }
        .status  { padding: 15px; border-radius: 8px; margin: 10px 0; }
        button   { color: white; border: none; padding: 12px 24px;
                   border-radius: 6px; cursor: pointer; font-size: 16px; margin: 5px; }
        #result { margin-top: 15px; padding: 15px; border-radius: 8px; display: none; }
        #loading { text-align: center; padding: 40px; font-size: 18px; }
      </style>
    </head>
    <body>
      <div id="loading">⏳ Loading latest version...</div>
      <div id="app" style="display:none;"></div>
      <div id="result"></div>

      <script>
        function renderApp(data) {
          document.getElementById('loading').style.display = 'none';
          var app = document.getElementById('app');
          app.style.display = 'block';
          app.innerHTML =
            '<h1 style="color:' + data.accentColor + ';">' + data.title + '</h1>' +
            '<div class="version" style="background:' + data.versionBg + ';"><strong>Current Version:</strong> ' + data.version + '</div>' +
            '<div class="status" style="background:' + data.statusBg + ';"><strong>Message:</strong> ' + data.message + '</div>' +
            '<p>' + data.description + '</p>' +
            '<button style="background:' + data.accentColor + ';" onclick="checkForUpdates()">🔄 Pull Latest from GitHub</button> ' +
            '<button style="background:' + data.accentColor + ';" onclick="getInfo()">ℹ️ Show Script Info</button>';
        }

        // On page load, fetch the dynamic content from the server
        google.script.run
          .withSuccessHandler(renderApp)
          .withFailureHandler(function(err) {
            document.getElementById('loading').innerHTML = '❌ Failed to load: ' + err.message;
          })
          .getPageData();

        function checkForUpdates() {
          document.getElementById('result').style.display = 'block';
          document.getElementById('result').style.background = '#fff3e0';
          document.getElementById('result').innerHTML = '⏳ Pulling code from GitHub...';
          google.script.run
            .withSuccessHandler(function(msg) {
              document.getElementById('result').style.background = '#e8f5e9';
              document.getElementById('result').innerHTML = '✅ ' + msg + '<br><br>⏳ Reloading in 3 seconds...';
              setTimeout(function() {
                document.getElementById('app').style.display = 'none';
                document.getElementById('loading').style.display = 'block';
                document.getElementById('loading').innerHTML = '⏳ Loading new version...';
                document.getElementById('result').style.display = 'none';
                google.script.run
                  .withSuccessHandler(renderApp)
                  .getPageData();
              }, 3000);
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
  return HtmlService.createHtmlOutput(html)
    .setTitle("GitHub Sync Test")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getPageData() {
  return {
    title: "🟠 GitHub → Apps Script — v9.1",
    version: "9.1 — GitHub API fetch, no CDN cache 🎉",
    message: "Hello from the dynamically loaded content!",
    description: "This page loads its content dynamically via google.script.run — zero caching issues. Now using GitHub API instead of raw URLs.",
    accentColor: "#e65100",
    versionBg: "#fff3e0",
    statusBg: "#e8f5e9",
    bgColor: "#ffffff"
  };
}

function getScriptInfo() {
  return "<b>Script ID:</b> " + ScriptApp.getScriptId() +
         "<br><b>Last updated:</b> " + new Date().toLocaleString() +
         "<br><b>Code version:</b> 9.1";
}

function pullFromGitHub() {
  var GITHUB_OWNER = "ShadowAISolutions";
  var GITHUB_REPO  = "gas-self-update-test";
  var GITHUB_BRANCH = "main";
  var FILE_PATH    = "Code.gs";
  var DEPLOYMENT_ID = "AKfycbyztYMy4pQpQmSX2We8WF7Ng9xeMBVmsJohqVe9evQZdJFzlafUati9B0DXJFXlDk-mQQ";

  // Use GitHub API instead of raw.githubusercontent.com to avoid CDN caching
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

  return "Code updated and deployed as version " + newVersion + "! Fetched " + newCode.length + " characters.";
}
