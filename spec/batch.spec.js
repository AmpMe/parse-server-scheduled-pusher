const { sender } = require('../src/batch');

describe('batch', () => {
  describe('sender', () => {
    it('should batch', async () => {
      const msgs = [];

      const pwi = {};
      const batchSize = 100;
      const numInstallations = 1010;

      const stream = sender((msg) => msgs.push(msg), pwi, batchSize);
      stream.write(new Array(numInstallations).fill('0'));
      expect(msgs.length).toEqual(11);

      let len = 0;
      for (const msg of msgs) {
        const payload = JSON.parse(msg);
        len += payload.query.where.objectId.$in.length;
      }
      expect(len).toEqual(numInstallations);

      // Last payload should be smaller
      const payload = JSON.parse(msgs[msgs.length - 1]);
      expect(payload.query.where.objectId.$in.length).toEqual(10);
    });
  });
});
