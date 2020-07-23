/**
 * @copyright 2020 Timur Atalay 
 * @Homepage https://github.com/bornova/numara
 * @license MIT https://github.com/bornova/numara/blob/master/LICENSE
 */

const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    Menu,
    nativeTheme,
    session,
    shell
} = require('electron');

const {
    is
} = require('electron-util');

const fs = require('fs-extra');

const store = require('electron-store');
const schema = {
    appWidth: {
        type: 'number',
        default: 600
    },
    appHeight: {
        type: 'number',
        default: 480
    },
    theme: {
        type: 'string',
        default: 'system'
    },
    fullSize: {
        type: 'boolean',
        default: false
    }
};
const dims = new store({
    schema,
    fileExtension: ''
});

require('electron-context-menu')({
    prepend: (params, browserWindow) => [],
    showSearchWithGoogle: false
});

let win;

var theme = dims.get('theme');
var light = '#ffffff';
var dark = '#1f1f1f';
var bg = theme == 'system' ? (nativeTheme.shouldUseDarkColors ? dark : light) : (theme == 'dark' ? dark : light);

function appWindow() {
    win = new BrowserWindow({
        width: parseInt(dims.get('appWidth')),
        height: parseInt(dims.get('appHeight')),
        minWidth: 500,
        minHeight: 400,
        frame: false,
        show: false,
        paintWhenInitiallyHidden: false,
        hasShadow: true,
        backgroundColor: bg,
        useContentSize: true,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            nodeIntegration: true,
            spellcheck: false,
            devTools: is.development
        }
    });
    win.loadFile('docs/index.html');
    win.on('close', () => {
        if (win.isMaximized()) {
            dims.set('fullSize', true);
        } else {
            var size = win.getSize();
            dims.set('appWidth', size[0]);
            dims.set('appHeight', size[1]);
            dims.set('fullSize', false);
        }
    });
    win.webContents.on('did-finish-load', () => {
        if (dims.get('fullSize') & is.windows) win.webContents.send('fullscreen', true);
        win.setHasShadow(true);
        win.show();
    });
    win.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    if (!is.development) {
        win.on('focus', (event) => globalShortcut.registerAll(['CommandOrControl+R', 'F5'], () => {}));
        win.on('blur', (event) => globalShortcut.unregisterAll());
    }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => win.focus());
}

app.whenReady().then(appWindow);

ipcMain.on('close', () => app.quit());
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('maximize', () => win.maximize());
ipcMain.on('unmaximize', () => win.unmaximize());
ipcMain.on('isNormal', (event) => event.returnValue = win.isNormal());
ipcMain.on('isMaximized', (event) => event.returnValue = win.isMaximized());
ipcMain.on('getName', (event) => event.returnValue = app.name);
ipcMain.on('getVersion', (event) => event.returnValue = app.getVersion());
ipcMain.on('print', (event) => {
    win.webContents.print({}, (success) => event.sender.send('printReply', success ? 'Sent to printer' : false));
});
ipcMain.on('resetApp', () => {
    session.defaultSession.clearStorageData()
        .then(() => {
            app.relaunch();
            app.quit();
        }).then(() => fs.remove(app.getPath('userData')));
});
ipcMain.on('setTheme', (event, mode) => dims.set('theme', mode));
ipcMain.on('isDark', (event) => event.returnValue = nativeTheme.shouldUseDarkColors);

nativeTheme.on('updated', () => win.webContents.send('themeUpdate', nativeTheme.shouldUseDarkColors));

if (is.macos) {
    const template = [{
            label: app.name,
            submenu: [{
                    role: 'about'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'hide'
                },
                {
                    role: 'hideothers'
                },
                {
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'quit'
                }
            ]
        },
        {
            label: 'File',
            submenu: [{
                role: 'close'
            }]
        },
        {
            label: 'Edit',
            submenu: [{
                    role: 'undo'
                },
                {
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'cut'
                },
                {
                    role: 'copy'
                },
                {
                    role: 'paste'
                },
                {
                    role: 'pasteAndMatchStyle'
                },
                {
                    role: 'delete'
                },
                {
                    role: 'selectAll'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Speech',
                    submenu: [{
                            role: 'startspeaking'
                        },
                        {
                            role: 'stopspeaking'
                        }
                    ]
                }
            ]
        },
        {
            label: 'View',
            submenu: [{
                    role: 'reload'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'resetzoom'
                },
                {
                    role: 'zoomin'
                },
                {
                    role: 'zoomout'
                },
                {
                    type: 'separator'
                }
            ]
        },
        {
            label: 'Window',
            submenu: [{
                    role: 'minimize'
                },
                {
                    role: 'zoom'
                },
                {
                    role: 'togglefullscreen'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'front'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'window'
                }
            ]
        },
        {
            role: 'help',
            submenu: [{
                label: 'Learn More',
                click: async () => await shell.openExternal('https://github.com/bornova/numara')
            }]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}