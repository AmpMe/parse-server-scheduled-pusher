const { pushTimeHasTimezoneComponent } = require('parse-server/lib/Controllers/PushController').default;

const { ABSOLUTE_TIME } = require('./schedule');

module.exports = {
  addOffsetCounts(pushStatusId, offset, database, now) {
    now = now || new Date();

    const update = { updatedAt: now };
    const increment = (key, amount) => update[key] = { __op: 'Increment', amount };

    if (offset === ABSOLUTE_TIME) {
      increment('count', 0);
      increment('numSent', 0);
      update['status'] = 'running';
    } else {
      increment(`sentPerUTCOffset.${offset}`, 0);
      increment(`failedPerUTCOffset.${offset}`, 0);
    }

    return database.update('_PushStatus', { objectId: pushStatusId }, update);
  },

  trackSent(pushStatus, offset, pushResults, database, now, log) {
    now = now || new Date();

    let numSent = 0;
    let numFailed = 0;
    for (const result of pushResults) {
      if (result.transmitted) {
        numSent++;
      } else {
        numFailed++;
      }
    }

    let pushTime = pushStatus.get('pushTime');
    if (pushTime instanceof Date) {
      pushTime = pushTime.toISOString();
    }

    const update = { updatedAt: now };
    const increment = (key, amount) => update[key] = { __op: 'Increment', amount };
    if (!pushTimeHasTimezoneComponent(pushTime)) {
      increment(`sentPerUTCOffset.${offset}`, numSent);
      increment(`failedPerUTCOffset.${offset}`, numFailed);
    } else {
      increment('numSent', numSent);
      increment('numFailed', numFailed);
      increment('count', -pushResults.length);
    }

    return database.update('_PushStatus', { objectId: pushStatus.id }, update);
  },

  markAsComplete(pushStatus, database, now) {
    now = now || new Date();

    const ttl = now - 24 * 60 * 60 * 1000;
    // If push was supposed to be sent more than 24 hours ago.
    if (+pushStatus.get('pushTime') < ttl) {
      const sentPerUTCOffset = pushStatus.get('sentPerUTCOffset') || {};
      let sentSum = 0;
      for (const offset of Object.keys(sentPerUTCOffset)) {
        sentSum += sentPerUTCOffset[offset];
      }

      // NOTE: The status is only updated after 24 hours.
      // This may need to be fixed.
      const numSent = pushStatus.get('numSent');
      if (!isNaN(numSent)) {
        sentSum += numSent;
      }

      const status = sentSum === 0 ? 'failed' : 'succeeded';
      return database.update('_PushStatus', { objectId: pushStatus.id }, { status, updatedAt: now })
        .then(() => true);
    }
    return Promise.resolve(false);
  },
};
