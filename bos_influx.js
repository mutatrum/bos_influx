require('log-timestamp');

const config = require('./config.js');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

(async function () {
  console.log('init')

  await terminal()
  // cron.schedule(config.schedule, () => onSchedule());

  console.log('exit')
})();

async function onSchedule() {

  console.log('start');

  await bos()
  await terminal()

  console.log('finish');
}

async function bos() {
  var bosStats = await getBosStats();  

  console.log(bosStats.lastUpdated);

  var timestamp = Date.parse(bosStats.lastUpdated);

  for (var node of bosStats.data) {
    if (node.publicKey == config.public_key) {
      writeBosPoint(timestamp, node);
    }
  }
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

function writeBosPoint(timestamp, node) {

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

  postInflux(data);
}

async function terminal() {
  var terminalStats = await getTerminalStats()

  console.log(terminalStats.last_updated)

  var timestamp = Date.parse(terminalStats.last_updated)

  var node = terminalStats.scored[config.public_key]

  var rank = 1
  for (var i in terminalStats.scored) {
    if (terminalStats.scored[i].score > node.score) {
      rank++
    }
  }

  node.rank = rank

  writeTerminalPoint(timestamp, node)
}

function getTerminalStats() {
  return new Promise(function(resolve, reject) {
    https.get("https://ln-scores.prod.lightningcluster.com/availability/v1/btc_summary.json", { headers : { "accept" : "application/json" }}, res => {
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

function writeTerminalPoint(timestamp, node) {

  var data = 
    `terminal,alias=${node.alias},publicKey=${config.public_key} ` +
    `score=${node.score},` +
    `rank=${node.rank},` +
    `total_capacity=${node.total_capacity},` +
    `aged_capacity=${node.aged_capacity},` +
    `centrality=${node.centrality},` +
    `centrality_normalized=${node.centrality_normalized},` +
    `stable_inbound_peers=${node.stable_inbound_peers.length},` +
    `stable_outbound_peers=${node.stable_outbound_peers.length},` +
    `good_inbound_peers=${node.good_inbound_peers.length},` +
    `good_outbound_peers=${node.good_outbound_peers.length},` +
    `max_channel_age=${node.max_channel_age},` +
    `total_peers=${node.total_peers} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function postInflux(data) {

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

  // var post_req = http.request(post_options, res => {
  //   let body = "";
  //   res.on("data", data => {
  //     body += data;
  //   });
  //   res.on("end", () => {
  //     console.log(body);
  //   });
  // });

  // post_req.write(data);
  // post_req.end();
}