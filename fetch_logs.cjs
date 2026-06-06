const http = require('https');
http.get('https://us-central1-avance-1334e.cloudfunctions.net/getDebugLogsHttp?t=' + Date.now(), (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});
