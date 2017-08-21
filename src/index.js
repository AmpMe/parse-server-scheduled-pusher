const Promise = require('bluebird');

const { getScheduledPushes } = require('./query');
const { createPushWorkItems, batchPushWorkItem } = require('./schedule');
const { addOffsetCounts, trackSent, markAsComplete } = require('./statusHandler');

const flatten = (arr) => arr.reduce((a, b) => a.concat(b), []);

const PUSH_SEND_CONCURRENCY = process.env.PUSH_SEND_CONCURRENCY || 1;

module.exports = {
  sendScheduledPushes(parseConfig, pushAdapter) {
    return Promise.resolve(getScheduledPushes())
      // Pick only the incomplete pushes
      .filter((push) => markAsComplete(push, parseConfig.database).then((res) => !res))
      .map((pwi) => createPushWorkItems(pwi))
      .then(flatten)

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus.id, pwi.offset, parseConfig.database)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)

      .map((pwi) => batchPushWorkItem(pwi, parseConfig, 100))
      .then(flatten)

      .map(({ offset, query, body, pushStatus }) => (
        parseConfig.database.find('_Installation', query.where, query)
          .then((installations) => pushAdapter.send(
            { data: JSON.parse(body), where: query.where },
            installations
          ))
          .then((pushResults) => trackSent(pushStatus.id, offset, pushResults, parseConfig.database))
      ), { concurrency: PUSH_SEND_CONCURRENCY });
  },
};
