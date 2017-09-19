const Promise = require('bluebird');

const { getScheduledPushes } = require('./query');
const { createPushWorkItems } = require('./schedule');
const { addOffsetCounts, markAsComplete } = require('./statusHandler');
const { flatten } = require('./util');

module.exports = {
  sendScheduledPushes(publisher, channel, now = new Date()) {
    return Promise.resolve(getScheduledPushes())
      .filter((pushStatus) => markAsComplete(pushStatus, now)
        // Pick only the incomplete pushes
        .then((res) => res === false))
      .map((pwi) => createPushWorkItems(pwi, now))
      .then(flatten)

      // We set the offsets to prevent resending in the next iteration
      .map((pwi) => addOffsetCounts(pwi.pushStatus, pwi.UTCOffset, now)
        .then(() => Promise.resolve(pwi)))
      .then(flatten)

      .each((pwi) => publisher.publish(channel, JSON.stringify(pwi)));
  },
};
