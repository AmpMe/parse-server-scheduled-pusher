## Parse Scheduled Pusher

[![Greenkeeper badge](https://badges.greenkeeper.io/AmpMe/parse-server-scheduled-pusher.svg)](https://greenkeeper.io/)

Sends scheduled push notifications and recurring push campaigns.

### Running:
- `git clone https://github.com/AmpMe/parse-server-scheduled-pusher.git`
- [Provide IOS push certificates](http://docs.parseplatform.org/parse-server/guide/#2-configure-parse-server) at `config/development.js`.

```sh
$ PUSH_ANDROID_SENDER_ID='' PUSH_ANDROID_API_KEY='' \
    npm start
```
