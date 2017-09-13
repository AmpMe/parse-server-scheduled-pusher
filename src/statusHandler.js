const Parse = require('parse/node');

const { ABSOLUTE_TIME } = require('./schedule');

module.exports = {
  markAsComplete(pushStatus, now) {
    // TODO Assert now

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
      pushStatus.set('status', status);
      return pushStatus.save(null, { useMasterKey: true });
    }
    return Promise.resolve(false);
  },

  addOffsetCounts(pushStatusId, offset, now) {
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

    // Parse JS SDK doesn't allow nested increment.
    // So we have to call the rest endpoint directly.
    return Parse._request(
      'PUT',
      `classes/_PushStatus/${pushStatusId}`,
      update,
      { useMasterKey: true }
    );
  },
};
