const Promise = require('bluebird');

const { getScheduledPushes } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, markAsComplete } = require('./statusHandler');
const { flatten } = require('./util');

module.exports = {
  sendScheduledPushes(publisher, channel, now = new Date()) {
    return Promise.resolve(getScheduledPushes())
      // Pick only the incomplete pushes
      .filter((pushStatus) => markAsComplete(pushStatus, now).then((res) => !res))
      .map((pwi) => createPushWorkItems(pwi, now))
      .then(flatten)

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus.id, pwi.offset, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)

      .each((pwi) => publisher.publish(channel, JSON.stringify(pwi)));
  },
};
