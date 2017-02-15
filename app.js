#!/usr/bin/env electron

const
    path = require('path'),
    {
        app,
        BrowserWindow,
        dialog,
        ipcMain,
        powerSaveBlocker,
        globalShortcut,
        shell
    } = require('electron'),
    crypto = require('crypto'),
    inter_proc_ipc = require('node-ipc'),
    mainDbApi = require(__dirname + '/libs/main-db-api'),
    winStateUpdator = require(__dirname + '/libs/state-updator');

const mainWindowId = 'main-window';
const ipc = ipcMain;

let mainWindow = null;
let mainDB, stateUpdator;
let win
let link
let ready = false

/*
if (process.env.SOCKS5_ADDRESS) {
    app.commandLine.appendSwitch('proxy-server', 'socks5://' + process.env.SOCKS5_ADDRESS + ':' + process.env.SOCKS5_PORT);
    if (!process.env.SOCKS5_LOCAL_DNS) {
        app.commandLine.appendSwitch('host-resolver-rules', 'MAP * 0.0.0.0, EXCLUDE ' + process.env.SOCKS5_ADDRESS);
    }
}
*/

const get_app_id = () => {
    let md5 = crypto.createHash('md5');
    md5.update(__filename.toLowerCase());
    return md5.digest('hex');
};

app.on('window-all-closed', () => {
    inter_proc_ipc.of.inter_app_services.emit('socks-client-status', {
        id: get_app_id(),
        pid: process.pid,
        started: false
    });
    stateUpdator.flush().then(() => {
        return mainDB.close().then(() => {
            if (process.platform != 'darwin') {
                app.quit();
            }
        });
    });
});

const register_app = () => {
    inter_proc_ipc.config.id = 'socks_app_register';
    inter_proc_ipc.config.retry = 1500;
    inter_proc_ipc.connectTo('inter_app_services', () => {
        inter_proc_ipc.of.inter_app_services.on('connect', () => {
            inter_proc_ipc.log('## connected to inter_app_services ##'.rainbow, inter_proc_ipc.config.delay);
            let data = {
                id: get_app_id(),
                categ: 'socks',
                type: process.env.APP_TYPE || 'browser',
                runtime: 'electron',
                name: app.getName(),
                appPath: __dirname,
                pid: process.pid,
                started: true,
            };
            inter_proc_ipc.of.inter_app_services.emit('socks-client-register', data);
        });
        inter_proc_ipc.of.inter_app_services.on('disconnect', () => {
            inter_proc_ipc.log('disconnected from socks_app_register'.notice);
        });
        inter_proc_ipc.of.inter_app_services.on('socks-client-register-ack', (data) => {
            inter_proc_ipc.log('got a message from socks_app_register : '.debug, data);
        });
    });
};

const onopen = function(e, lnk) {
    e.preventDefault()

    if (ready) {
        win.send('add-to-playlist', [].concat(lnk))
        return
    }

    link = lnk
}

app.on('open-file', onopen)
app.on('open-url', onopen)

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
        })
    });

    win.on('move', () => {
        stateUpdator.updateWindowState(mainWindowId, {
            bounds: win.getBounds()
        })
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
    register_app();
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

});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});