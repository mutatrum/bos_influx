require('log-timestamp');

const config = require('./config.js');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

(function () {
  console.log('init')
  cron.schedule(config.schedule, () => onSchedule());
})();

async function onSchedule() {

  console.log('start');

  var bosStats = await getBosStats();  

  console.log(bosStats.lastUpdated);

  var timestamp = Date.parse(bosStats.lastUpdated);

  for (var node of bosStats.data) {
    if (node.publicKey == config.public_key) {
      writePoint(timestamp, node);
    }
  }

  console.log('finish');
}

function getBosStats() {
  return new Promise(function(resolve, reject) {
    https.get("https://bos.lightning.jorijn.com/data/export.json", { headers : { "accept" : "application/json" }}, res => {
      let body = "";
      res.on("data", data => {
        body += data;
      });
      res.on("end", () => {
        resolve(JSON.parse(body));
      });
    });
  });
}

function writePoint(timestamp, node) {

  var data = 
    `bos,alias=${node.alias},publicKey=${node.publicKey} ` +
    `score=${node.score},` +
    `capacity=${node.capacity},` +
    `channelCount=${node.channelCount},` +
    `rankCapacity=${node.rankCapacity},` +
    `rankChannelCount=${node.rankChannelCount},` +
    `rankAge=${node.rankAge},` +
    `rankGrowth=${node.rankGrowth},` +
    `rankAvailability=${node.rankAvailability} ` +
    `${timestamp}000000`;

  console.log(data);

  var post_options = {
    host: config.influx_host,
    port: '8086',
    path: `/write?db=${config.influx_db}`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
    }
  };

  var post_req = http.request(post_options, res => {
    let body = "";
    res.on("data", data => {
      body += data;
    });
    res.on("end", () => {
      console.log(body);
    });
  });

  post_req.write(data);
  post_req.end();
}
