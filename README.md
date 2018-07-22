## Parse Scheduled Pusher

Sender for scheduled push notifications and recurring push campaigns through Parse.

## Relevant docs:
- https://docs.parseplatform.org/parse-server/guide/#push-notifications-quick-start

### Running:
- `git clone https://github.com/AmpMe/parse-server-scheduled-pusher.git`

```sh
PARSE_APPLICATION_ID='' \
PARSE_JAVASCRIPT_KEY-'' \
PARSE_MASTER_KEY='' \
PARSE_URL='' \
PARSE_MESSAGE_QUEUE_ADAPTER='' \
PARSE_PUSH_CHANNEL='' \
  npm start
```

`PARSE_MESSAGE_QUEUE_ADAPTER` can be one of
  [`@parse/sqs-mq-adapter`](https://github.com/parse-community/parse-server-sqs-mq-adapter), 
  [`parse-server-gcloud-pubsub`](https://github.com/parse-server-modules/parse-server-gcloud-pubsub), 
  or [an equivalent implementation](https://github.com/parse-community/parse-server/blob/master/src/Adapters/MessageQueue/EventEmitterMQ.js).

