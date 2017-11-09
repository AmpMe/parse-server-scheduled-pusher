const Parse = require('parse/node');
const Promise = require('bluebird');
const { flatten, logger } = require('./util');

function batchQuery(where, batchSize, count, order = 'createdAt') {
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

function batchPushWorkItem(pushWorkItem, batchSize = 100) {
  const installationsQ = Parse.Query.fromJSON('_Installation', {
    where: pushWorkItem.query.where,
  });

  return installationsQ.count({ useMasterKey: true })
    .then((count) => {
      logger.info('Installations count', { count, pushWorkItem });
      return batchQuery(pushWorkItem.query.where, batchSize, count)
        .map((batch) => Object.assign({}, pushWorkItem, { query: batch }));
    });
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
      logger.info('Found ${pushStatuses.length} potential pushes', {
        pushStatuses: pushStatuses.map((p) => p.toJSON()),
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
  return campaignsQ.equalTo('status', 'active')
    .find({ useMasterKey: true });
}

module.exports = {
  getActiveCampaigns,
  getScheduledPushes,
  getPushesByCampaign,
  batchQuery,
  batchPushWorkItem,
};
