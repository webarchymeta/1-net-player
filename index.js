const {
    remote,
    ipcRenderer
} = require('electron'), {
        Menu,
        MenuItem,
        clipboard
    } = remote,
    request = require('request'),
    drop = require('drag-and-drop-files'),
    mdns = require('multicast-dns')(),
    concat = require('concat-stream'),
    vtt = require('srt-to-vtt'),
    ipc = ipcRenderer,
    http = require('http'),
    rangeParser = require('range-parser'),
    pump = require('pump'),
    fs = require('fs'),
    eos = require('end-of-stream'),
    minimist = require('minimist'),
    JSONStream = require('JSONStream'),
    network = require('network-address'),
    chromecasts = require('chromecasts')(),
    $ = require('dombo'),
    titlebar = require('titlebar')(),
    player = require('./player'),
    playlist = require('./playlist'),
    mouseidle = require('./mouseidle');

let argv = minimist(JSON.parse(window.location.toString().split('#')[1]), {
    alias: {
        follow: 'f'
    },
    boolean: ['follow']
})

let printError = function(err) {
    if (err) console.log(err)
}

let onsubs = function(data) {
    media.subtitles(data)
}

ipc.on('add-to-playlist', function(event, links) {
    links.forEach(function(link) {
        if (/\.(vtt|srt)$/i.test(link)) {
            fs.createReadStream(link).pipe(vtt()).pipe(concat(onsubs))
            return
        }
        list.add(link, printError)
    })
})

$(document).on('paste', function(e) {
    ipc.emit('add-to-playlist', e.clipboardData.getData('text').split('\n'))
})

let media = player($('#player')[0])
let list = playlist()

titlebar.appendTo('#titlebar')

drop($('body')[0], function(files) {
    for (let i = 0; i < files.length; i++) {
        if (/\.(vtt|srt)$/i.test(files[i].path)) {
            fs.createReadStream(files[i].path).pipe(vtt()).pipe(concat(onsubs))
            return
        }

        list.add(files[i].path, printError)
    }
})

let videoDown = false
let videoOffsets = [0, 0]

$('#idle').on('mousedown', function(e) {
    videoDown = true
    videoOffsets = [e.clientX, e.clientY]
})

$('#idle').on('mouseup', function() {
    videoDown = false
})

$('#idle').on('mousemove', function(e) {
    if (videoDown) remote.getCurrentWindow().setPosition(e.screenX - videoOffsets[0], e.screenY - videoOffsets[1])
})

let onTop = false

$(window).on('contextmenu', function(e) {
    e.preventDefault()
    videoDown = false

    let menu = new Menu()

    menu.append(new MenuItem({
        label: 'Always on top',
        type: 'checkbox',
        checked: onTop,
        click: function() {
            onTop = !onTop
            remote.getCurrentWindow().setAlwaysOnTop(onTop)
        }
    }))

    menu.append(new MenuItem({
        label: 'Paste link',
        click: function() {
            ipc.emit('add-to-playlist', clipboard.readText().split('\n'))
        }
    }))

    if (media.subtitles()) {
        menu.append(new MenuItem({
            label: 'Remove subtitles',
            click: function() {
                media.subtitles(null)
            }
        }))
    }

    menu.popup(remote.getCurrentWindow())
})

$('body').on('mouseover', function() {
    if (onTop) ipc.send('focus')
})

let isFullscreen = false

let onfullscreentoggle = function(e) {
    if (!isFullscreen && e.shiftKey) {
        ipc.send('resize', {
            width: media.width,
            height: media.height,
            ratio: media.ratio
        })
        return
    }

    let $icon = $('#controls-fullscreen .js-icon')
    if (isFullscreen) {
        isFullscreen = false
        $('#titlebar')[0].style.display = 'block'
        $icon.removeClass('ion-arrow-shrink')
        $icon.addClass('ion-arrow-expand')
        ipc.send('exit-full-screen')
    } else {
        isFullscreen = true
        $('#titlebar')[0].style.display = 'none'
        $icon.removeClass('ion-arrow-expand')
        $icon.addClass('ion-arrow-shrink')
        ipc.send('enter-full-screen')
    }
}

let onplaytoggle = function() {
    if (media.playing) media.pause()
    else media.play()
}

let onnexttrack = function() {
    let shouldLoop = true
    list.selectNext(shouldLoop)
}

let onprevioustrack = function() {
    let shouldLoop = true
    list.selectPrevious(shouldLoop)
}

let onrepeatcycle = function() {
    let $controlsRepeat = $('#controls-repeat')
    if (!list.repeating) {
        $controlsRepeat.addClass('repeating')
        list.repeat()
        return
    }

    if (!list.repeatingOne) {
        $controlsRepeat.addClass('one')
        list.repeatOne()
        return
    }

    $controlsRepeat.removeClass('repeating')
    $controlsRepeat.removeClass('one')
    list.unrepeat()
}

$('#idle').on('dblclick', onfullscreentoggle)
$('#controls-fullscreen').on('click', onfullscreentoggle)

$('#controls-timeline').on('click', function(e) {
    let time = e.pageX / $('#controls-timeline')[0].offsetWidth * media.duration
    media.time(time)
})

function updateTimelineTooltip(e) {
    let tooltip = $('#controls-timeline-tooltip')[0]
    let percentage = e.pageX / $('#controls-timeline')[0].offsetWidth
    let time = formatTime(percentage * media.duration)
    tooltip.innerHTML = time
    tooltip.style.left = (e.pageX - tooltip.offsetWidth / 2) + "px"
}

$('#controls-timeline').on('mousemove', function(e) {
    updateTimelineTooltip(e)
})

$('#controls-timeline').on('mouseover', function(e) {
    let tooltip = $('#controls-timeline-tooltip')[0]
    tooltip.style.opacity = 1
    updateTimelineTooltip(e)
})

$('#controls-timeline').on('mouseout', function(e) {
    let tooltip = $('#controls-timeline-tooltip')[0]
    tooltip.style.opacity = 0
})

let isVolumeSliderClicked = false
let isPbrateSliderClicked = false

function updateAudioVolume(value) {
    media.volume(value)
}

function updateVolumeSlider(volume) {
    let val = volume.value * 100
    volume.style.background = '-webkit-gradient(linear, left top, right top, color-stop(' + val.toString() + '%, #31A357), color-stop(' + val.toString() + '%, #727374))'
}

function updatePlaybackRate(value) {
    media.playbackRate(value)
}

function updatePlaybackRateSlider(volume) {
    let min = 0.5
    let max = 4
    let scaled = (volume.value - min) / (max - min)
    let val = scaled * 100
    volume.style.background = '-webkit-gradient(linear, left top, right top, color-stop(' + val.toString() + '%, #31A357), color-stop(' + val.toString() + '%, #727374))'
}

$('#controls-volume-slider').on('mousemove', function(e) {
    if (isVolumeSliderClicked) {
        let volume = $('#controls-volume-slider')[0]
        updateAudioVolume(volume.value)
        updateVolumeSlider(volume)
    }
})

$('#controls-volume-slider').on('mousedown', function(e) {
    isVolumeSliderClicked = true
})

$('#controls-volume-slider').on('mouseup', function(e) {
    let volume = $('#controls-volume-slider')[0]
    updateAudioVolume(volume.value)
    updateVolumeSlider(volume)
    isVolumeSliderClicked = false
})

$('#controls-pbrate-slider').on('mousemove', function(e) {
    if (isPbrateSliderClicked) {
        let volume = $('#controls-pbrate-slider')[0]
        updatePlaybackRate(volume.value)
        updatePlaybackRateSlider(volume)
    }
})

$('#controls-pbrate-slider').on('mousedown', function(e) {
    isPbrateSliderClicked = true
})

$('#controls-pbrate-slider').on('mouseup', function(e) {
    let volume = $('#controls-pbrate-slider')[0]
    updatePlaybackRate(volume.value)
    updatePlaybackRateSlider(volume)
    isPbrateSliderClicked = false
})

$(document).on('keydown', function(e) {
    if (e.keyCode === 27 && isFullscreen) return onfullscreentoggle(e)
    if (e.keyCode === 13 && e.metaKey) return onfullscreentoggle(e)
    if (e.keyCode === 13 && e.shiftKey) return onfullscreentoggle(e)
    if (e.keyCode === 32) return onplaytoggle(e)

    if ($('#controls-playlist').hasClass('selected')) $('#controls-playlist').trigger('click')
    if ($('#controls-chromecast').hasClass('selected')) $('#controls-chromecast').trigger('click')
})

mouseidle($('#idle')[0], 3000, 'hide-cursor')

list.on('select', function() {
    $('#controls-name')[0].innerText = list.selected.name
    media.play('http://127.0.0.1:' + server.address().port + '/' + list.selected.id)
    if (list.selected.subtitles) onsubs(list.selected.subtitles)
    updatePlaylist()
})

let updatePlaylist = function() {
    let html = ''

    list.entries.forEach(function(entry, i) {
        html += '<div class="playlist-entry ' + (i % 2 ? 'odd ' : '') + (list.selected === entry ? 'selected ' : '') + '" data-index="' + i + '" data-id="' + entry.id + '">' +
            '<span>' + entry.name + '</span><span class="status"></span></div>'
    })

    $('#playlist-entries')[0].innerHTML = html
}

let updateChromecast = function() {
    let html = ''

    chromecasts.players.forEach(function(player, i) {
        html += '<div class="chromecast-entry ' + (i % 2 ? 'odd ' : '') + (media.casting === player ? 'selected ' : '') + '" data-index="' + i + '" data-id="' + i + '">' +
            '<span>' + player.name + '</span>'
    })

    $('#chromecast-entries')[0].innerHTML = html
}

chromecasts.on('update', updateChromecast)

let updateSpeeds = function() {
    $('#player-downloadspeed')[0].innerText = ''
    list.entries.forEach(function(entry, i) {
        if (!entry.downloadSpeed) return

        $('.playlist-entry[data-index="' + i + '"] .status').addClass('ion-loop')

        let kilobytes = entry.downloadSpeed() / 1024
        let megabytes = kilobytes / 1024
        let text = megabytes > 1 ? megabytes.toFixed(1) + ' mb/s' : Math.floor(kilobytes) + ' kb/s'

        if (list.selected === entry) $('#player-downloadspeed')[0].innerText = text
    })
}
setInterval(updateSpeeds, 750)

list.on('update', updatePlaylist)

list.once('update', function() {
    list.select(0)
})

let popupSelected = function() {
    return $('#controls-playlist').hasClass('selected') || $('#controls-chromecast').hasClass('selected')
}

let closePopup = function(e) {
    if (e && (e.target === $('#controls-playlist .js-icon')[0] || e.target === $('#controls-chromecast .chromecast')[0])) return
    $('#popup')[0].style.opacity = 0
    $('#controls-playlist').removeClass('selected')
    $('#controls-chromecast').removeClass('selected')
}

$('#controls').on('click', closePopup)
$('#idle').on('click', closePopup)

$('#playlist-entries').on('click', '.playlist-entry', function(e) {
    let id = Number(this.getAttribute('data-id'))
    list.select(id)
})

$('#chromecast-entries').on('click', '.chromecast-entry', function(e) {
    let id = Number(this.getAttribute('data-id'))
    let player = chromecasts.players[id]

    if (media.casting === player) {
        $('body').removeClass('chromecasting')
        media.chromecast(null)
        return updateChromecast()
    }

    $('body').addClass('chromecasting')
    media.chromecast(player)
    updateChromecast()
})

let updatePopup = function() {
    if (popupSelected()) {
        $('#popup')[0].style.display = 'block'
        $('#popup')[0].style.opacity = 1
    } else {
        $('#popup')[0].style.opacity = 0
    }
}

$('#controls-chromecast').on('click', function(e) {
    if ($('#controls-chromecast').hasClass('selected')) {
        closePopup()
        return
    }

    $('#popup')[0].className = 'chromecast'
    $('#controls .controls-secondary .selected').removeClass('selected')
    $('#controls-chromecast').addClass('selected')
    chromecasts.update()
    updatePopup()
})

$('#controls-playlist').on('click', function(e) {
    if ($('#controls-playlist').hasClass('selected')) {
        closePopup()
        return
    }

    $('#popup')[0].className = 'playlist'
    $('#controls .controls-secondary .selected').removeClass('selected')
    $('#controls-playlist').addClass('selected')
    updatePopup()
})

$('#playlist-add-media').on('click', function() {
    ipc.send('open-file-dialog')
})

$('#popup').on('transitionend', function() {
    if (!popupSelected()) $('#popup')[0].style.display = 'none'
})

titlebar.on('close', function() {
    ipc.send('close')
})

titlebar.on('minimize', function() {
    ipc.send('minimize')
})

titlebar.on('maximize', function() {
    ipc.send('maximize')
})

titlebar.on('fullscreen', onfullscreentoggle)

let appmenu_template = [{
    label: 'Playback',
    submenu: [{
        label: 'About Playback',
        click: function() {
            ipc.send('open-url-in-external', 'https://mafintosh.github.io/playback/')
        }
    }, {
        type: 'separator'
    }, {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: function() {
            ipc.send('close')
        }
    }]
}, {
    label: 'File',
    submenu: [{
        label: 'Add media',
        accelerator: 'Command+O',
        click: function() {
            ipc.send('open-file-dialog')
        }
    }, {
        label: 'Add link from clipboard',
        accelerator: 'CommandOrControl+V',
        click: function() {
            ipc.emit('add-to-playlist', clipboard.readText().split('\n'))
        }
    }]
}, {
    label: 'Window',
    submenu: [{
        label: 'Minimize',
        accelerator: 'Command+M',
        click: function() {
            ipc.send('minimize')
        }
    }, {
        label: 'Toggle Full Screen',
        accelerator: 'Command+Enter',
        click: onfullscreentoggle
    }]
}, {
    label: 'Help',
    submenu: [{
        label: 'Report Issue',
        click: function() {
            ipc.send('open-url-in-external', 'https://github.com/mafintosh/playback/issues')
        }
    }, {
        label: 'View Source Code on GitHub',
        click: function() {
            ipc.send('open-url-in-external', 'https://github.com/mafintosh/playback')
        }
    }, {
        type: 'separator'
    }, {
        label: 'Releases',
        click: function() {
            ipc.send('open-url-in-external', 'https://github.com/mafintosh/playback/releases')
        }
    }]
}]
let appmenu = Menu.buildFromTemplate(appmenu_template)
Menu.setApplicationMenu(appmenu)

let formatTime = function(secs) {
    let hours = (secs / 3600) | 0
    let mins = ((secs - hours * 3600) / 60) | 0
    secs = (secs - (3600 * hours + 60 * mins)) | 0
    if (mins < 10) mins = '0' + mins
    if (secs < 10) secs = '0' + secs
    return (hours ? hours + ':' : '') + mins + ':' + secs
}

let updateInterval
media.on('metadata', function() {
    // TODO: comment in again when not quirky
    // if (!isFullscreen) {
    //   ipc.send('resize', {
    //     width: media.width,
    //     height: media.height,
    //     ratio: media.ratio
    //   })
    // }

    $('#controls-main')[0].style.display = 'block'
    $('#controls-time-total')[0].innerText = formatTime(media.duration)
    $('#controls-time-current')[0].innerText = formatTime(media.time())

    clearInterval(updateInterval)
    updateInterval = setInterval(function() {
        $('#controls-timeline-position')[0].style.width = (100 * (media.time() / media.duration)) + '%'
        $('#controls-time-current')[0].innerText = formatTime(media.time())
    }, 250)
})

$('#controls-play').on('click', onplaytoggle)
$('#controls-repeat').on('click', onrepeatcycle)
ipc.on('media-play-pause', onplaytoggle)
ipc.on('media-next-track', onnexttrack)
ipc.on('media-previous-track', onprevioustrack)

media.on('end', function() {
    ipc.send('allow-sleep')
    list.selectNext()
})

media.on('play', function() {
    ipc.send('prevent-sleep')
    $('#splash').toggleClass('hidden', !media.casting)
    $('#player').toggleClass('hidden', media.casting)
    $('#controls-play .js-icon').removeClass('ion-play')
    $('#controls-play .js-icon').addClass('ion-pause')
})

media.on('pause', function() {
    ipc.send('allow-sleep')
    $('#controls-play .js-icon').removeClass('ion-pause')
    $('#controls-play .js-icon').addClass('ion-play')
})

let server = http.createServer(function(req, res) {
    if (req.headers.origin)
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

    if (req.url === '/subtitles') {
        let buf = media.subtitles();

        if (buf) {
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            res.setHeader('Content-Length', buf.length);
            res.end(buf);
        } else {
            res.statusCode = 404;
            res.end();
        }
    }

    if (req.url === '/follow') { // TODO: do not hardcode /0
        if (!list.selected)
            return res.end();
        let stringify = JSONStream.stringify();

        let onseek = function() {
            stringify.write({
                type: 'seek',
                time: media.time()
            });
        };

        let onsubs = function(data) {
            stringify.write({
                type: 'subtitles',
                data: data.toString('base64')
            });
        };

        stringify.pipe(res);
        stringify.write({
            type: 'open',
            url: 'http://' + network() + ':' + server.address().port + '/' + list.selected.id,
            time: media.time()
        });

        media.on('subtitles', onsubs);
        media.on('seek', onseek);
        eos(res, function() {
            media.removeListener('subtitles', onsubs)
            media.removeListener('seek', onseek)
        });
        return;
    }

    let id = Number(req.url.slice(1));
    let file = list.get(id);

    if (!file) {
        res.statusCode = 404;
        res.end();
        return;
    }

    let content_length = file.length || Number.MAX_SAFE_INTEGER;
    let range = req.headers.range && rangeParser(content_length, req.headers.range)[0];

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');

    if (!range) {
        if (file.length) {
            res.setHeader('Content-Length', file.length);
        }
        if (req.method === 'HEAD')
            return res.end();
        pump(file.createReadStream(), res);
        return;
    }

    res.statusCode = 206;
    res.setHeader('Content-Length', range.end - range.start + 1);
    res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + (file.length ? file.length : '*'));
    if (req.method === 'HEAD')
        return res.end();
    pump(file.createReadStream(range), res);
})

server.listen(0, function() {
    console.log('Playback server running on port ' + server.address().port);
    argv._.forEach(function(file) {
        if (file)
            list.add(file, printError);
    });

    if (argv.follow) {
        mdns.on('response', function onresponse(response) {
            response.answers.forEach(function(a) {
                if (a.name !== 'playback')
                    return;
                clearInterval(interval);
                mdns.removeListener('response', onresponse);

                let host = a.data.target + ':' + a.data.port;

                request('http://' + host + '/follow').pipe(JSONStream.parse('*')).on('data', function(data) {
                    if (data.type === 'open') {
                        media.play(data.url);
                        media.time(data.time);
                    }

                    if (data.type === 'seek') {
                        media.time(data.time);
                    }

                    if (data.type === 'subtitles') {
                        media.subtitles(data.data);
                    }
                })
            })
        })

        let query = function() {
            mdns.query({
                questions: [{
                    name: 'playback',
                    type: 'SRV'
                }]
            });
        }

        let interval = setInterval(query, 5000);
        query();
    } else {
        mdns.on('query', function(query) {
            let valid = query.questions.some(function(q) {
                return q.name === 'playback'
            })

            if (!valid) return

            mdns.respond({
                answers: [{
                    type: 'SRV',
                    ttl: 5,
                    name: 'playback',
                    data: {
                        port: server.address().port,
                        target: network()
                    }
                }]
            })
        });
    }

    setTimeout(function() {
        ipc.send('ready')
    }, 10);
})

let volumeSlider = $('#controls-volume-slider')[0]
volumeSlider.setAttribute("value", 0.5)
volumeSlider.setAttribute("min", 0)
volumeSlider.setAttribute("max", 1)
volumeSlider.setAttribute("step", 0.05)
updateAudioVolume(0.5)
updateVolumeSlider(volumeSlider)

let pbrateSlider = $('#controls-pbrate-slider')[0]
pbrateSlider.setAttribute("value", 1)
pbrateSlider.setAttribute("min", 0.5)
pbrateSlider.setAttribute("max", 4)
pbrateSlider.setAttribute("step", 0.25)
updatePlaybackRate(1)
updatePlaybackRateSlider(pbrateSlider)