#!/usr/bin/env electron

const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    powerSaveBlocker,
    globalShortcut,
    shell
} = require('electron'),
    path = require('path'),
    app_register = require(__dirname + '/libs/app-register'),
    mainDbApi = require(__dirname + '/libs/main-db-api'),
    winStateUpdator = require(__dirname + '/libs/state-updator');

const mainWindowId = 'main-window';
const ipc = ipcMain;

if (process.env.SOCKS5_ADDRESS) {
    global.__proxy = {
        socks5_address: process.env.SOCKS5_ADDRESS,
        socks5_port: typeof process.env.SOCKS5_PORT === 'string' ? parseInt(process.env.SOCKS5_PORT) : process.env.SOCKS5_PORT
    }
}

let mainWindow = null;
let mainDB, stateUpdator;
let win, link, ready = false;

app.on('window-all-closed', () => {
    app_register.close();
    stateUpdator.flush().then(() => {
        return mainDB.close().then(() => {
            if (process.platform != 'darwin') {
                app.quit();
            }
        });
    });
});

const onopen = function(e, lnk) {
    e.preventDefault();
    if (ready) {
        win.send('add-to-playlist', [].concat(lnk))
        return;
    }
    link = lnk;
};

app.on('open-file', onopen);
app.on('open-url', onopen);

const frame = process.platform === 'win32';

const createWindow = (initBounds) => {
    const wopts = {
        title: 'playback',
        width: initBounds ? initBounds.width : 860,
        height: initBounds ? initBounds.height : 470,
        frame: process.platform === 'win32',
        show: false,
        transparent: true
    };
    if (initBounds) {
        wopts.x = initBounds.loc_x;
        wopts.y = initBounds.loc_y;
    }
    win = new BrowserWindow(wopts);
    win.loadURL('file://' + path.join(__dirname, 'index.html#' + JSON.stringify(process.argv.slice(2))));

    win.on('resize', () => {
        stateUpdator.updateWindowState(mainWindowId, {
            bounds: win.getBounds()
        });
    });

    win.on('move', () => {
        stateUpdator.updateWindowState(mainWindowId, {
            bounds: win.getBounds()
        });
    });

    ipc.on('close', () => {
        win.close();
    });

    ipc.on('open-file-dialog', () => {
        let files = dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections']
        });
        if (files) {
            files.forEach(app.addRecentDocument);
            win.send('add-to-playlist', files);
        }
    });

    ipc.on('open-url-in-external', function(event, url) {
        shell.openExternal(url);
    });

    ipc.on('focus', () => {
        win.focus();
    });

    ipc.on('minimize', () => {
        win.minimize();
    });

    ipc.on('maximize', () => {
        win.maximize();
    });

    ipc.on('resize', function(e, message) {
        if (win.isMaximized()) return;
        let wid = win.getSize()[0];
        let hei = (wid / message.ratio) | 0;
        win.setSize(wid, hei);
    });

    ipc.on('enter-full-screen', () => {
        win.setFullScreen(true);
    });

    ipc.on('exit-full-screen', () => {
        win.setFullScreen(false);
        win.show();
    });

    ipc.on('ready', () => {
        ready = true;
        if (link) win.send('add-to-playlist', [].concat(link));
        win.show();
    });

    ipc.on('prevent-sleep', () => {
        app.sleepId = powerSaveBlocker.start('prevent-display-sleep');
    });

    ipc.on('allow-sleep', () => {
        powerSaveBlocker.stop(app.sleepId);
    });

    globalShortcut.register('MediaPlayPause', () => {
        win.send('media-play-pause');
    });

    globalShortcut.register('MediaNextTrack', () => {
        win.send('media-next-track');
    });

    globalShortcut.register('MediaPreviousTrack', () => {
        win.send('media-previous-track');
    });
};

app.on('ready', () => {
    if (app_register.regist(app)) {
        mainDB = new mainDbApi({
            home: app.getPath('appData'),
            path: app.getName() + '/databases'
        });
        mainDB.open().then(() => {
            stateUpdator = new winStateUpdator(mainDB);
            mainDB.find({
                table: 'window-states',
                predicate: '"window_id"=\'' + mainWindowId + '\''
            }).then((wstate) => {
                createWindow(wstate);
            });
        });
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});