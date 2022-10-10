require('log-timestamp');

const config = require('./config.js');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

(async function () {
  console.log('init')

  cron.schedule(config.schedule, () => onSchedule())

  console.log('exit')
})();

async function onSchedule() {

  console.log('start');

  await bos()
  await terminal()
  await amboss()

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

  var node = getNode(terminalStats)

  if (node === undefined) {
    console.log(`Node ${config.public_key} not found in terminal`)
    return
  }
  
  node.rank = 1
  for (var i in terminalStats.scored) {
    if (terminalStats.scored[i].score > node.score) {
      node.rank++
    }
  }

  writeTerminalPoint(timestamp, node)
}

function getNode(terminalStats) {
  if (terminalStats.scored.hasOwnProperty(config.public_key))
    return terminalStats.scored[config.public_key]

  if (terminalStats.stable.hasOwnProperty(config.public_key))
    return terminalStats.stable[config.public_key]

  if (terminalStats.unstable.hasOwnProperty(config.public_key))
    return terminalStats.unstable[config.public_key]

  if (terminalStats.unconnectable.hasOwnProperty(config.public_key))
    return terminalStats.unconnectable[config.public_key]

  return  
}

function getTerminalStats() {
  return new Promise(function(resolve, reject) {
    https.get("https://nodes.lightning.computer/availability/v3/btc_summary.json", { headers : { "accept" : "application/json" }}, res => {
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
    `score=${node.score ??= 0},` +
    `rank=${node.rank ??= 0},` +
    `total_capacity=${node.total_capacity ??= 0},` +
    `aged_capacity=${node.aged_capacity ??= 0},` +
    `centrality=${node.centrality ??= 0},` +
    `centrality_normalized=${node.centrality_normalized},` +
    `stable_inbound_peers=${safeLength(node.stable_inbound_peers)},` +
    `stable_outbound_peers=${safeLength(node.stable_outbound_peers)},` +
    `good_inbound_peers=${safeLength(node.good_inbound_peers)},` +
    `good_outbound_peers=${safeLength(node.good_outbound_peers)},` +
    `max_channel_age=${node.max_channel_age ??= 0},` +
    `total_peers=${node.total_peers ??= 0} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function safeLength(a) {
  return a === undefined ? 0 : a.length
}

async function amboss() {
  var ambossStats = await getAmbossStats()

  if (typeof ambossStats.errors !== 'undefined') {
    console.log(ambossStats)
  }

  var timestamp = Date.parse(ambossStats.data.getNode.graph_info.last_update)

  writeAmbossAgePoint(timestamp, ambossStats)
  writeAmbossFeeLocalPoint(timestamp, ambossStats)
  writeAmbossFeeRemotePoint(timestamp, ambossStats)
  writeLnNodeInsightsPoint(timestamp, ambossStats)
}

function writeAmbossAgePoint(timestamp, stats) {
  var alias = stats.data.getNodeAlias
  var channelInfo = stats.data.getNode.graph_info.channels.channel_info
  var age = channelInfo.age
  var data = 
    `amboss,stats=age,alias=${alias},publicKey=${config.public_key} ` +
    `channel_count=${age.count},` +
    `max=${age.max},` +
    `mean=${age.mean},` +
    `median=${age.median},` +
    `min=${age.min} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function writeAmbossFeeLocalPoint(timestamp, stats) {
  var alias = stats.data.getNodeAlias
  var feeLocalInfo = stats.data.getNode.graph_info.channels.fee_info.local
  var data = 
    `amboss,stats=fee_local,alias=${alias},publicKey=${config.public_key} ` +
    `max=${feeLocalInfo.max},` +
    `mean=${feeLocalInfo.mean},` +
    `median=${feeLocalInfo.median},` +
    `min=${feeLocalInfo.min},` +
    `weighted=${feeLocalInfo.weighted},` +
    `weighted_corrected=${feeLocalInfo.weighted_corrected} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function writeAmbossFeeRemotePoint(timestamp, stats) {
  var alias = stats.data.getNodeAlias
  var feeLocalInfo = stats.data.getNode.graph_info.channels.fee_info.remote
  var data = 
    `amboss,stats=fee_remote,alias=${alias},publicKey=${config.public_key} ` +
    `max=${feeLocalInfo.max},` +
    `mean=${feeLocalInfo.mean},` +
    `median=${feeLocalInfo.median},` +
    `min=${feeLocalInfo.min},` +
    `weighted=${feeLocalInfo.weighted},` +
    `weighted_corrected=${feeLocalInfo.weighted_corrected} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function writeLnNodeInsightsPoint(timestamp, stats) {
  var alias = stats.data.getNodeAlias
  var scores = stats.data.getNode.socials.lnnodeinsights_info.scores
  var data = 
    `lnnodeinsight,alias=${alias},publicKey=${config.public_key} ` +
    `cent_between_rank=${scores.cent_between_rank},` +
    `cent_between_weight_rank=${scores.cent_between_weight_rank},` +
    `cent_close_rank=${scores.cent_close_rank},` +
    `cent_close_weight_rank=${scores.cent_close_weight_rank},` +
    `cent_eigen_rank=${scores.cent_eigen_rank},` +
    `cent_eigen_weight_rank=${scores.cent_eigen_weight_rank} ` +
    `${timestamp}000000`;

  postInflux(data);
}

function getAmbossStats() {
  const data = {
    variables: {
      pubkey: config.public_key,
    },
    query: `
    query($pubkey: String!) {
      getNode(pubkey: $pubkey) {
        graph_info {
          last_update
          channels {
            channel_info {
              age {
                count
                max
                mean
                median
                min
              }
            }
            fee_info {
              local {
                max
                mean
                median
                min
                sd
                weighted
                weighted_corrected
              }
              remote {
                max
                mean
                median
                min
                sd
                weighted
                weighted_corrected
              }
            }
          }
        }
        socials {
          lnnodeinsights_info {
            scores {
              cent_between_rank
              cent_between_weight_rank
              cent_close_rank
              cent_close_weight_rank
              cent_eigen_rank
              cent_eigen_weight_rank
            }
          }
        }
      }
      getNodeAlias(pubkey: $pubkey)
    }`}

  const dataString = JSON.stringify(data)         

  const options = {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${config.amboss_api}`,
      'Content-Type': 'application/json',
      'Content-Length': dataString.length,
    },
    timeout: 5000
  }

  return new Promise(function(resolve, reject) {
    const req = https.request('https://api.amboss.space/graphql', options, res => {
      let body = "";
      res.on("data", data => {
        body += data;
      });
      res.on("end", () => {
        resolve(JSON.parse(body));
      });
    });

    req.on('error', (err) => {
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request time out'))
    })

    req.write(dataString)
    req.end()
  });
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