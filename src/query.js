const Parse = require('parse/node');
const Promise = require('bluebird');
const { flatten, logger } = require('./util');

function batchQuery(where, batchSize, count, order = 'objectId') {
  const items = [];
  for (let skip = 0; skip < count; skip += batchSize) {
    if (skip > count) {
      skip = count;
    }

    items.push({
      where,
      limit: batchSize,
      skip,
      order,
    });
  }
  return items;
}

async function getObjectIds(where, querySize, previousQueryLast) {
  const installationsQ = Parse.Query.fromJSON('_Installation', {
    where,
  });
  installationsQ.exists('deviceToken');
  installationsQ.limit(querySize);
  installationsQ.select([ 'objectId' ]);
  installationsQ.ascending('objectId');
  if (previousQueryLast) {
    installationsQ.greaterThan('objectId', previousQueryLast);
  }
  const installations = await installationsQ.find({ useMasterKey: true });
  return installations.map((inst) => inst.id);
}

function getScheduledPushes() {
  const pushStatusesQ = new Parse.Query('_PushStatus');
  pushStatusesQ.containedIn('status', [ 'scheduled' ]);

  return Promise.resolve(pushStatusesQ.count({ useMasterKey: true }))
    .then((count) =>
      batchQuery(pushStatusesQ.toJSON().where, 1000, count)
        .map((batch) => Parse.Query.fromJSON('_PushStatus', batch)))

    .mapSeries((query) => Promise.resolve(query.find({ useMasterKey: true }))
      .filter((pushStatus) => {
        // Filter out immediate pushes which are currently running
        if (pushStatus.get('status') === 'running' && !pushStatus.has('sentPerUTCOffset')) {
          logger.debug('Filtered out pushStatus', {
            type: 'immediate',
            pushStatus: pushStatus.toJSON(),
          });
          return false;
        }

        return true;
      }
    ))
    .then(flatten)
    .tap((pushStatuses) => {
      logger.info(`Found ${pushStatuses.length} potential pushes`, {
        pushStatuses: pushStatuses.map((p) => p.id),
      });
    });
}

function getPushesByCampaign(campaign) {
  const pushes = campaign.relation('pushes');
  return pushes.query()
    .descending('createdAt')
    .find({ useMasterKey: true });
}

function getActiveCampaigns() {
  logger.debug('Finding active campaigns');
  const campaignsQ = new Parse.Query('PushCampaign');
  return campaignsQ
    .equalTo('status', 'active')
    .include('nextPush')
    .find({ useMasterKey: true });
}

module.exports = {
  getActiveCampaigns,
  getScheduledPushes,
  getPushesByCampaign,
  batchQuery,
  getObjectIds,
};
