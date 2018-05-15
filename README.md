# V-NET Playback

Derived from [playback](https://github.com/mafintosh/playback).

#### Remote video player on V-NET based on [electron](http://electron.atom.io/) and [node.js](https://nodejs.org/)

V-NET trans- local area network (trans-LAN) video player built using electron and node.js

## Features

- Plays .MP4 and .WebM videos
- Streaming to Chromecast
- Streaming from http links, torrent magnet links, and IPFS links
- [WebTorrent](https://webtorrent.io/) support – can torrent from/to WebRTC peers ("web peers")

## Installation

To run this code, follow these steps:

```
git clone https://github.com/webarchymeta/v-net-player
cd v-net-player
npm install
npm run bootstrap
```

The last command will start a tray icon on user's desktop. When clicked, a list of active V-NET gateway ports available to the current LAN will be listed.

```
npm start
```

Starts the browser in normal mode, without going through a the V-NET gateway tunnel.

```
npm run register
```

Registers the player with a running V-NET desktop client, which can be used to launch the browser for a specific V-NET gateway tunnel (port) from within.

## Currently supported releases:

* OS X
* Windows
* Linux (not supported yet)

Pull requests are welcome that adds builds for other platforms.

If you think it is missing a feature or you've found a bug feel free to open an issue, or even better sending a PR that fixes that.

## License

MIT
