const Promise = require('bluebird');
const Parse = require('parse/node');

const { getScheduledPushes, getActiveCampaigns } = require('./query');
const { createPushWorkItems, batchPushWorkItem } = require('./schedule');
const { addOffsetCounts, trackSent, markAsComplete } = require('./statusHandler');
const { createScheduledPush } = require('./campaign');

const flatten = (arr) => arr.reduce((a, b) => (
  Array.isArray(b) ? a.concat(flatten(b))
    : a.concat(b)
), []);

module.exports = {
  sendScheduledPushes(parseConfig, publisher, now) {
    now = now || new Date();
    return Promise.resolve(getScheduledPushes())
      // Pick only the incomplete pushes
      .filter((push) => markAsComplete(push, parseConfig.database, now).then((res) => !res))
      .map((pwi) => createPushWorkItems(pwi, now))
      .then(flatten)

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus.id, pwi.offset, parseConfig.database, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)

      .map((pwi) => batchPushWorkItem(pwi, parseConfig, 100))
      .then(flatten)
      .each((pwi) => publisher.publish('pushWorkItem', JSON.stringify(pwi)));
  },

  processPushBatch({ offset, query, body, pushStatus }, parseConfig, pushAdapter, now) {
    pushStatus = Parse.Object.fromJSON(Object.assign({ className: '_PushStatus' }, pushStatus));
    return parseConfig.database.find('_Installation', query.where, query)
      .then((installations) => pushAdapter.send(
        { data: JSON.parse(body), where: query.where },
        installations
      ))
      .then((pushResults) => trackSent(pushStatus, offset, pushResults, parseConfig.database, now));
  },

  runPushCampaigns(parseConfig) {
    return Promise.resolve(getActiveCampaigns())
      .each((campaign) => createScheduledPush(campaign, parseConfig.database));
  },
};
