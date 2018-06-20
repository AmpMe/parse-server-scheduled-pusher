const { getObjectIds } = require('./query');
const { logger } = require('./util');
const { Readable, Writable } = require('stream');

const QUERY_SIZE = 1000;

const queryResults = (where) => new Readable({
  objectMode: true,
  decodeStrings: false,

  async read() {
    const ids = await getObjectIds(where, QUERY_SIZE, this._lastElement);
    logger.info('Object IDs', { where, ids, resultSize: ids.length, QUERY_SIZE });
    if (ids.length === 0) {
      this.push(null);
      return;
    }

    this._lastElement = ids[ids.length - 1];
    this.push(ids);
  },
});

const sender = (publish, pwi, batchSize) => new Writable({
  objectMode: true,
  decodeStrings: false,

  write(ids, enc, cb) {
    let numBatches = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = { objectId: { $in: ids.slice(i, i + batchSize) } };
      logger.info('Created batch', { ids: batch.objectId.$in });

      const batchedPwi = Object.assign({}, pwi, { query: { where: batch } });
      const message = JSON.stringify(batchedPwi);
      publish(message);

      numBatches += 1;
    }

    this._numInstallationsSent = this._numInstallationsSent || 0;
    this._numInstallationsSent += ids.length;
    logger.info('Batched push work items', {
      expectedbatchSize: batchSize,
      numBatches,
      numInstallationsSent: this._numInstallationsSent,
    });

    process.nextTick(cb);
  },
});

module.exports = { queryResults, sender };
