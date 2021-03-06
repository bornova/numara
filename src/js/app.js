// Get element by id
const $ = (id) => document.getElementById(id);

// localStorage
const ls = {
    get: (key) => JSON.parse(localStorage.getItem(key)),
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value))
}

const DateTime = luxon.DateTime;

// Prep input
const cm = CodeMirror.fromTextArea($('inputArea'), {
    theme: 'numara',
    coverGutterNextToScrollbar: true,
    inputStyle: 'textarea',
    viewportMargin: Infinity
});

cm.setValue(ls.get('input') || '');
cm.execCommand('goDocEnd');

$('udfInput').setAttribute('placeholder', `// Define new functions and variables:\nmyvalue: 42,\nhello: (name) => {\n\treturn 'hello, ' + name + '!'\n}`);
const udfInput = CodeMirror.fromTextArea($('udfInput'), {
    mode: 'javascript',
    autoCloseBrackets: true,
    smartIndent: false
});

$('uduInput').setAttribute('placeholder', `// Define new units:\nfoo: {\n\tprefixes: 'long',\n\tbaseName: 'essence-of-foo'\n},\nbar: '40 foo',\nbaz: {\n\tdefinition: '1 bar/hour',\n\tprefixes: 'long'\n}`);
const uduInput = CodeMirror.fromTextArea($('uduInput'), {
    mode: 'javascript',
    autoCloseBrackets: true,
    smartIndent: false
});

let settings;

(() => {
    // User agent
    let isMac = navigator.userAgent.toLowerCase().includes('mac');
    let isNode = navigator.userAgent.toLowerCase().includes('electron');
    let ipc = isNode ? require('electron').ipcRenderer : null;

    // Set app info
    document.title = appInfo.description;
    $('dialog-about-title').innerHTML = appInfo.description;
    $('dialog-about-copyright').innerHTML = `Copyright ©️ ${DateTime.local().year} ${appInfo.author}`;
    $('dialog-about-appVersion').innerHTML = isNode ? 'Version ' + appInfo.version :
        `Version ${appInfo.version}
        <div class="versionCtnr">
            <div><a href="https://github.com/bornova/numara-calculator/releases" target="_blank">Download desktop version</a></div>
        </div>`;
    $('gitLink').setAttribute('href', appInfo.homepage);
    $('webLink').setAttribute('href', appInfo.website);
    $('licenseLink').setAttribute('href', appInfo.homepage + '/blob/master/LICENSE');

    if (isNode) {
        ipc.on('themeUpdate', () => applySettings());
        ipc.on('fullscreen', (event, isFullscreen) => {
            if (isFullscreen) ipc.send('maximize');
        });
    } else {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('./sw.js')
                .catch(() => console.log("Service worker registration failed"));
        }
    }

    // Set headers
    if (isNode && !isMac) {
        $('header-mac').remove();
        $('header-win').style.display = 'block';
        $('header-win-title').innerHTML = appInfo.productName;

        $('max').style.display = ipc.sendSync('isMaximized') ? 'none' : 'block';
        $('unmax').style.display = ipc.sendSync('isMaximized') ? 'block' : 'none';

        $('winButtons').addEventListener('click', (e) => {
            switch (e.target.id) {
                case 'min':
                    ipc.send('minimize');
                    break
                case 'max':
                    ipc.send('maximize');
                    break
                case 'unmax':
                    ipc.send('unmaximize');
                    break
                case 'close':
                    ipc.send('close');
                    break
            }
            e.stopPropagation();
        });

        ipc.on('isMax', (event, isMax) => {
            $('unmax').style.display = isMax ? 'block' : 'none';
            $('max').style.display = !isMax ? 'block' : 'none';
        });

        $('header-win').addEventListener('dblclick', toggleMax);
    } else {
        $('header-win').remove();
        $('header-mac').style.display = 'block';
        $('header-mac-title').innerHTML = appInfo.productName;

        if (isNode) $('header-mac').addEventListener('dblclick', toggleMax);
    }

    function toggleMax() {
        ipc.send(ipc.sendSync('isMaximized') ? 'unmaximize' : 'maximize');
    }

    feather.replace();

    // App settings
    const defaultSettings = {
        app: {
            autocomplete: true,
            closeBrackets: true,
            currencies: true,
            dateDay: false,
            dateFormat: 'M/d/yyyy',
            divider: true,
            fontSize: '1.1rem',
            fontWeight: '400',
            keywordTips: true,
            lineErrors: true,
            lineNumbers: true,
            lineWrap: true,
            matchBrackets: true,
            matrixType: 'Matrix',
            numericOutput: 'number',
            precision: '4',
            predictable: false,
            syntax: true,
            theme: 'system',
            thouSep: true,
            timeFormat: 'h:mm a'
        },
        inputWidth: 60,
        plot: {
            plotArea: false,
            plotCross: false,
            plotGrid: false
        }
    }

    settings = ls.get('settings');

    if (!settings) {
        settings = defaultSettings;
        ls.set('settings', defaultSettings);
    } else {
        // Check for and apply default settings changes
        DeepDiff.observableDiff(settings, defaultSettings, (d) => {
            if (d.kind !== 'E') {
                DeepDiff.applyChange(settings, defaultSettings, d);
                ls.set('settings', settings);
            }
        });
    }

    // Exchange rates
    math.createUnit('USD', {
        aliases: ['usd']
    });

    let currencyRates = {};

    function getRates() {
        var url = 'https://www.floatrates.com/widget/1030/cfc5515dfc13ada8d7b0e50b8143d55f/usd.json';
        if (navigator.onLine) {
            $('lastUpdated').innerHTML = '<div uk-spinner="ratio: 0.3"></div>';
            fetch(url)
                .then((response) => response.json())
                .then((rates) => {
                    currencyRates = rates;
                    var dups = ['cup'];
                    Object.keys(rates).map((currency) => {
                        math.createUnit(rates[currency].code, {
                            definition: math.unit(rates[currency].inverseRate + 'USD'),
                            aliases: [dups.includes(rates[currency].code.toLowerCase()) ? '' : rates[currency].code.toLowerCase()]
                        }, {
                            override: true
                        });
                        ls.set('rateDate', rates[currency].date);
                    });
                    applySettings();
                    $('lastUpdated').innerHTML = ls.get('rateDate');
                }).catch((e) => {
                    $('lastUpdated').innerHTML = 'n/a';
                    notify('Failed to get exchange rates (' + e + ')', 'warning');
                })
        } else {
            $('lastUpdated').innerHTML = 'No internet connection.';
            notify('No internet connection. Could not update exchange rates.', 'warning');
        }
    }

    let udfList = [];
    let uduList = [];

    // Codemirror syntax templates
    CodeMirror.defineMode('numara', () => {
        return {
            token: (stream, state) => {
                if (stream.match(/\/\/.*/) || stream.match(/#.*/)) return 'comment';
                if (stream.match(/\d/)) return 'number';
                if (stream.match(/(?:\+|\-|\*|\/|,|;|\.|:|@|~|=|>|<|&|\||_|`|'|\^|\?|!|%)/)) return 'operator';

                stream.eatWhile(/\w/);
                var str = stream.current();

                if (settings.app.currencies && (str.toLowerCase() in currencyRates || str.toLowerCase() == 'usd')) return 'currency';

                try {
                    if (math.unit(str).units.length > 0) return 'unit';
                } catch (e) {}

                if (udfList.includes(str)) return 'udf';
                if (uduList.includes(str)) return 'udu';

                if (typeof math[str] === 'function' && Object.getOwnPropertyNames(math[str]).includes('signatures')) return 'function';
                if (str.match(/\b(?:ans|total|subtotal|avg|today|now|line\d+)\b/)) return 'scope';

                try {
                    math.evaluate(str);
                } catch (e) {
                    return 'variable'
                }

                stream.next()
                return 'space'
            }
        }
    });

    CodeMirror.defineMode('plain', () => {
        return {
            token: (stream, state) => {
                stream.next();
                return 'text'
            }
        }
    });

    // Codemirror autocomplete hints
    let numaraHints = ['ans', 'now', 'today', 'total', 'subtotal', 'avg'];
    Object.getOwnPropertyNames(math).forEach((f) => {
        if (typeof math[f] === 'function' && Object.getOwnPropertyNames(math[f]).includes('signatures')) {
            numaraHints.push(f);
        }
    });

    CodeMirror.registerHelper('hint', 'numaraHints', (editor) => {
        var cur = editor.getCursor();
        var curLine = editor.getLine(cur.line);
        var start = cur.ch;
        var end = start;
        while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
        while (start && /[\w$]/.test(curLine.charAt(start - 1))) --start;
        var curWord = start !== end && curLine.slice(start, end);
        var regex = new RegExp('^' + curWord, 'i');
        return {
            list: (!curWord ? [] : numaraHints.filter((item) => item.match(regex))).sort(),
            from: CodeMirror.Pos(cur.line, start),
            to: CodeMirror.Pos(cur.line, end)
        }
    });

    CodeMirror.commands.autocomplete = (cm) => {
        CodeMirror.showHint(cm, CodeMirror.hint.numaraHints, {
            completeSingle: false
        });
    }

    cm.on('changes', calculate);
    cm.on('inputRead', (cm, event) => {
        if (settings.app.autocomplete) CodeMirror.commands.autocomplete(cm);
    });
    cm.on('update', () => {
        var funcs = document.getElementsByClassName('cm-function');
        if (funcs.length > 0 && settings.app.keywordTips) {
            for (var f of funcs) {
                try {
                    var res = JSON.stringify(math.help(f.innerHTML).toJSON());
                    var obj = JSON.parse(res);
                    UIkit.tooltip(f, {
                        title: obj.description,
                        pos: 'top-left'
                    });
                } catch (e) {
                    UIkit.tooltip(f, {
                        title: 'Description not available.',
                        pos: 'top-left'
                    });
                }
            }
        }

        var udfs = document.getElementsByClassName('cm-udf');
        if (udfs.length > 0 && settings.app.keywordTips) {
            for (var f of udfs) {
                UIkit.tooltip(f, {
                    title: `User defined function.`,
                    pos: 'top-left'
                });
            }
        }

        var udus = document.getElementsByClassName('cm-udu');
        if (udus.length > 0 && settings.app.keywordTips) {
            for (var u of udus) {
                UIkit.tooltip(u, {
                    title: `User defined unit.`,
                    pos: 'top-left'
                });
            }
        }

        var curr = document.getElementsByClassName('cm-currency');
        if (curr.length > 0 && settings.app.keywordTips) {
            for (var c of curr) {
                try {
                    var curr = c.innerHTML.toLowerCase();
                    var currName = curr == 'usd' ? 'U.S. Dollar' : currencyRates[curr].name;
                    UIkit.tooltip(c, {
                        title: currName,
                        pos: 'top-left'
                    });
                } catch (e) {
                    UIkit.tooltip(c, {
                        title: 'Description not available.',
                        pos: 'top-left'
                    });
                }
            }
        }

        var units = document.getElementsByClassName('cm-unit');
        if (units.length > 0 && settings.app.keywordTips) {
            for (var u of units) {
                UIkit.tooltip(u, {
                    title: `Unit '${u.innerHTML}'`,
                    pos: 'top-left'
                });
            }
        }
    });

    // Apply settings
    function applySettings() {
        settings = ls.get('settings');

        $('style').setAttribute('href',
            settings.app.theme == 'system' ? (isNode ? (ipc.sendSync('isDark') ? 'css/dark.css' : 'css/light.css') : 'css/light.css') :
            settings.app.theme == 'light' ? 'css/light.css' : 'css/dark.css');

        if (isNode) ipc.send('setTheme', settings.app.theme);

        var elements = document.querySelectorAll('.panelFont, .CodeMirror');
        for (var el of elements) {
            el.style.fontSize = settings.app.fontSize;
            el.style.fontWeight = settings.app.fontWeight;
        }

        $('input').style.width = (settings.app.divider ? settings.inputWidth : defaultSettings.inputWidth) + '%';
        $('divider').style.display = settings.app.divider ? 'block' : 'none';
        $('output').style.textAlign = settings.app.divider ? 'left' : 'right';

        cm.setOption('mode', settings.app.syntax ? 'numara' : 'plain');
        cm.setOption('lineNumbers', settings.app.lineNumbers);
        cm.setOption('lineWrapping', settings.app.lineWrap);
        cm.setOption('autoCloseBrackets', settings.app.closeBrackets);
        cm.setOption('matchBrackets', settings.app.syntax && settings.app.matchBrackets ? {
            'maxScanLines': 1
        } : false);

        udfInput.setOption('theme', settings.app.theme == 'system' ? (isNode ? (ipc.sendSync('isDark') ? 'material-darker' : 'default') : 'default') :
            settings.app.theme == 'light' ? 'default' : 'material-darker');

        uduInput.setOption('theme', settings.app.theme == 'system' ? (isNode ? (ipc.sendSync('isDark') ? 'material-darker' : 'default') : 'default') :
            settings.app.theme == 'light' ? 'default' : 'material-darker');

        math.config({
            matrix: settings.app.matrixType,
            number: settings.app.numericOutput,
            predictable: settings.app.predictable
        });

        setTimeout(calculate, 15);
    }
    applySettings();
    if (settings.app.currencies) getRates();

    // Tooltip defaults
    UIkit.mixin({
        data: {
            delay: 500,
            offset: 5
        }
    }, 'tooltip');

    // Show modal dialog
    function showModal(id) {
        UIkit.modal(id, {
            bgClose: false,
            stack: true
        }).show();
    }

    UIkit.util.on('.modal', 'hidden', () => cm.focus());
    UIkit.util.on('.uk-switcher', 'show', () => cm.getInputField().blur());

    // Update open button count
    const savedCount = () => Object.keys(ls.get('saved') || {}).length;

    function updateSavedCount() {
        UIkit.tooltip('#openButton', {
            title: 'Open (' + savedCount() + ')'
        });
    }
    updateSavedCount();

    $('openButton').className = savedCount() > 0 ? 'action' : 'noAction';

    // App button actions
    $('actions').addEventListener('click', (e) => {
        switch (e.target.id) {
            case 'clearButton': // Clear board
                if (cm.getValue() != '') {
                    cm.setValue('');
                    cm.focus();
                    calculate();
                }
                break
            case 'printButton': // Print calculations
                UIkit.tooltip('#printButton').hide();
                if (cm.getValue() != '') {
                    $('print-title').innerHTML = appInfo.productName;
                    $('printBox').innerHTML = $('panel').innerHTML;
                    if (isNode) {
                        ipc.send('print');
                        ipc.on('printReply', (event, response) => {
                            if (response) notify(response);
                            $('printBox').innerHTML = '';
                        });
                    } else {
                        window.print();
                    }
                }
                break
            case 'saveButton': // Save calcualtions
                if (cm.getValue() != '') {
                    $('saveTitle').value = '';
                    showModal('#dialog-save');
                    $('saveTitle').focus();
                }
                break
            case 'openButton': // Open saved calculations
                if (Object.keys(ls.get('saved') || {}).length > 0) showModal('#dialog-open');
                break
            case 'udfuButton': // Open custom functions dialog
                showModal('#dialog-udfu');
                break
            case 'settingsButton': // Open settings dialog
                showModal('#dialog-settings');
                break
            case 'helpButton': // Open help dialog
                showModal('#dialog-help')
                $('searchBox').focus();
                break
            case 'aboutButton': // Open app info dialog
                showModal('#dialog-about');
                break
        }
        e.stopPropagation();
    });

    // Output actions
    $('output').addEventListener('click', (e) => {
        switch (e.target.className) {
            case 'answer':
                var copyText = e.target.innerText;
                navigator.clipboard.writeText(copyText);
                notify(`Copied '${copyText}' to clipboard.`);
                break
            case 'plotButton': // Plot function
                func = e.target.getAttribute('data-func');
                try {
                    $('plotGrid').checked = settings.plot.plotGrid;
                    $('plotCross').checked = settings.plot.plotCross;
                    $('plotArea').checked = settings.plot.plotArea;
                    plot();
                    showModal('#dialog-plot');
                } catch (error) {
                    showError(error);
                }
                break
            case 'lineError': // Show line error
                var num = e.target.getAttribute('data-line');
                var err = e.target.getAttribute('data-error');
                showError(err, 'Error on Line ' + num);
                break
        }
        e.stopPropagation();
    });

    $('output').addEventListener('mousedown', () => {
        var sels = document.getElementsByClassName('CodeMirror-selected');
        while (sels[0]) sels[0].classList.remove('CodeMirror-selected');
    });

    // Dialog button actions
    document.addEventListener('click', (e) => {
        switch (e.target.id) {
            case 'dialog-save-save': // Save calculation
                var id = DateTime.local().toFormat('yyyyMMddHHmmssSSS');
                var obj = ls.get('saved') || {};
                var data = cm.getValue();
                var title = $('saveTitle').value.replace(/<|>/g, '').trim() || 'No title';

                obj[id] = [title, data];
                ls.set('saved', obj);
                UIkit.modal('#dialog-save').hide();
                $('openButton').className = 'action';
                updateSavedCount();
                notify('Saved');
                break
            case 'dialog-open-deleteAll': // Delete all saved calculations
                confirm('All saved calculations will be deleted.', () => {
                    localStorage.removeItem('saved');
                    populateSaved();
                    UIkit.modal('#dialog-open').hide();
                    notify('Deleted all saved calculations');
                });
                break
            case 'dialog-udfu-save-f': // Save custom functions
                var udf = udfInput.getValue().trim();
                applyUdf(udf);
                break
            case 'dialog-udfu-save-u': // Save custom functions
                var udu = uduInput.getValue().trim();
                applyUdu(udu);
                break
            case 'defaultSettingsButton': // Revert back to default settings
                confirm('All settings will revert back to defaults.', () => {
                    settings.app = defaultSettings.app;
                    ls.set('settings', settings);
                    applySettings();
                    if (!$('currencyButton').checked) getRates();
                    prepSettings();
                });
                break
            case 'dialog-settings-reset': // Reset app
                confirm('All user settings and data will be lost.', () => {
                    if (isNode) {
                        ipc.send('resetApp');
                    } else {
                        localStorage.clear();
                        location.reload();
                    }
                });
                break
            case 'resetSizeButton': // Reset window size
                if (isNode) ipc.send('resetSize');
                break
            case 'syntaxButton':
                syntaxToggle();
                break
            case 'bigNumWarn': // BigNumber warning
                showError(`Using the BigNumber may break function plotting and is not compatible with some math functions. 
                It may also cause unexpected behavior and affect overall performance.<br><br>
                <a target="_blank" href="https://mathjs.org/docs/datatypes/bignumbers.html">Read more on BigNumbers</a>`,
                    'Caution: BigNumber Limitations');
                break
            case 'currencyButton': // Enable currency rates
                $('currencyUpdate').style.display = $('currencyButton').checked ? 'block' : 'none';
                break
                // Plot settings
            case 'plotGrid':
                settings.plot.plotGrid = $('plotGrid').checked;
                ls.set('settings', settings);
                plot();
                break
            case 'plotCross':
                settings.plot.plotCross = $('plotCross').checked;
                ls.set('settings', settings);
                plot();
                break
            case 'plotArea':
                settings.plot.plotArea = $('plotArea').checked;
                ls.set('settings', settings);
                plot();
                break

            case 'restartButton': // Restart to update
                ipc.send('updateApp');
                break

            case 'demoButton': // Load demo
                cm.setValue(demo);
                calculate();
                UIkit.modal('#dialog-help').hide();
                break
        }
    });

    // Open saved calculations dialog actions
    $('dialog-open').addEventListener('click', (e) => {
        var pid;
        var saved = ls.get('saved');
        if (e.target.parentNode.getAttribute('data-action') == 'load') {
            pid = e.target.parentNode.parentNode.id;
            cm.setValue(saved[pid][1]);
            calculate();
            UIkit.modal('#dialog-open').hide();
        }
        if (e.target.getAttribute('data-action') == 'delete') {
            pid = e.target.parentNode.id;
            confirm('Calculation "' + saved[pid][0] + '" will be deleted.', () => {
                delete saved[pid];
                ls.set('saved', saved);
                populateSaved();
            });
        }
    });

    // Populate saved calculation
    UIkit.util.on('#dialog-open', 'beforeshow', () => populateSaved());

    function populateSaved() {
        var obj = ls.get('saved') || {};
        var savedItems = Object.entries(obj);
        $('dialog-open-body').innerHTML = '';
        if (savedItems.length > 0) {
            $('dialog-open-deleteAll').disabled = false;
            savedItems.map(([id, val]) => {
                $('dialog-open-body').innerHTML += `
                <div class="dialog-open-wrapper" id="${id}">
                    <div data-action="load">
                        <div class="dialog-open-title">${val[0]}</div>
                        <div class="dialog-open-date">${DateTime.fromFormat(id, 'yyyyMMddHHmmssSSS').toFormat('ff')}</div>
                    </div>
                    <span class="dialog-open-delete" data-action="delete"><i data-feather="x-circle"></i></span>
                </div>`;
            });
            feather.replace();
        } else {
            $('dialog-open-deleteAll').disabled = true;
            $('dialog-open-body').innerHTML = 'No saved calculations.';
            $('openButton').className = 'noAction';
        }
        updateSavedCount();
    }

    // User defined functions and units
    UIkit.util.on('#dialog-udfu', 'beforeshow', () => {
        $('udfSyntaxError').innerHTML = '';
        $('uduSyntaxError').innerHTML = '';
        var udf = ls.get('udf').trim();
        var udu = ls.get('udu').trim();
        udfInput.setValue(udf);
        uduInput.setValue(udu);
    })
    UIkit.util.on('#dialog-udfu', 'shown', () => {
        udfInput.refresh();
        uduInput.refresh();
    });

    function applyUdf(udf) {
        try {
            loadUdf = new Function(`"use strict";math.import({${udf}}, {override: true})`);
            loadUdf();
            calculate();
            ls.set('udf', udf);

            var udfs = eval('[{' + udf + '}]');
            udfList = [];
            udfs.forEach((f) => Object.keys(f).forEach((k) => udfList.push(k)));

            UIkit.modal('#dialog-udfu').hide();
        } catch (e) {
            $('udfSyntaxError').innerHTML = e;
        }
    }

    function applyUdu(udu) {
        try {
            loadUdu = new Function(`"use strict";math.createUnit({${udu}}, {override: true})`);
            loadUdu();
            calculate();
            ls.set('udu', udu);

            var udus = eval('[{' + udu + '}]');
            uduList = [];
            udus.forEach((f) => Object.keys(f).forEach((k) => uduList.push(k)));

            UIkit.modal('#dialog-udfu').hide();
        } catch (e) {
            $('uduSyntaxError').innerHTML = e;
        }
    }

    if (!ls.get('udf')) ls.set('udf', '');
    if (!ls.get('udu')) ls.set('udu', '');
    applyUdf(ls.get('udf'));
    applyUdu(ls.get('udu'));

    // Initiate settings dialog
    UIkit.util.on('#setswitch', 'beforeshow', (e) => e.stopPropagation());
    UIkit.util.on('#dialog-settings', 'beforeshow', () => prepSettings());
    UIkit.util.on('#dialog-settings', 'hidden', () => cm.focus());

    function prepSettings() {
        // Appearance
        var dateFormats = ['M/d/yyyy', 'd/M/yyyy', 'MMM d, yyyy'];
        var timeFormats = ['h:mm a', 'H:mm'];
        var matrixTypes = ['Matrix', 'Array'];
        var numericOutputs = ['number', 'BigNumber', 'Fraction'];

        $('themeList').value = settings.app.theme;
        $('fontSize').value = settings.app.fontSize;
        $('fontWeight').value = settings.app.fontWeight;
        $('dateFormat').innerHTML = '';
        for (var d of dateFormats) $('dateFormat').innerHTML += `<option value="${d}">${DateTime.local().toFormat(d)}</option>`;
        $('dateFormat').value = settings.app.dateFormat;
        $('timeFormat').innerHTML = '';
        for (var t of timeFormats) $('timeFormat').innerHTML += `<option value="${t}">${DateTime.local().toFormat(t)}</option>`;
        $('timeFormat').value = settings.app.timeFormat;
        $('dateDay').checked = settings.app.dateDay;
        $('syntaxButton').checked = settings.app.syntax;
        syntaxToggle();
        $('keywordTipsButton').checked = settings.app.keywordTips;
        $('matchBracketsButton').checked = settings.app.matchBrackets;
        // Calculator
        $('precisionRange').value = settings.app.precision;
        $('precision-label').innerHTML = settings.app.precision;
        $('numericOutput').innerHTML = '';
        for (var n of numericOutputs) $('numericOutput').innerHTML += `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`;
        $('numericOutput').value = settings.app.numericOutput;
        if (settings.app.numericOutput == 'BigNumber') bigNumberWarning();
        $('matrixType').innerHTML = '';
        for (var m of matrixTypes) $('matrixType').innerHTML += `<option value="${m}">${m}</option>`;
        $('matrixType').value = settings.app.matrixType;
        $('predictableButton').checked = settings.app.predictable;
        $('thouSepButton').checked = settings.app.thouSep;
        $('currencyButton').checked = settings.app.currencies;
        $('lastUpdated').innerHTML = settings.app.currencies ? ls.get('rateDate') : '';
        $('currencyUpdate').style.display = settings.app.currencies ? 'block' : 'none';
        // Panel UI
        $('autocompleteButton').checked = settings.app.autocomplete;
        $('closeBracketsButton').checked = settings.app.closeBrackets;
        $('dividerButton').checked = settings.app.divider;
        $('lineNoButton').checked = settings.app.lineNumbers;
        $('lineErrorButton').checked = settings.app.lineErrors;
        $('lineWrapButton').checked = settings.app.lineWrap;

        checkDefaultSettings();
        checkWindowSize();
    }

    function checkDefaultSettings() {
        $('defaultSettingsButton').style.display = DeepDiff.diff(settings.app, defaultSettings.app) ? 'inline' : 'none';
    }

    function checkWindowSize() {
        $('resetSizeButton').style.display = isNode ? (ipc.sendSync('isResized') && !ipc.sendSync('isMaximized') ? 'block' : 'none') : 'none';
    }

    function syntaxToggle() {
        $('keywordTipsButton').disabled = $('syntaxButton').checked ? false : true;
        $('matchBracketsButton').disabled = $('syntaxButton').checked ? false : true;

        $('keywordTipsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5';
        $('matchBracketsButton').parentNode.style.opacity = $('syntaxButton').checked ? '1' : '0.5';
    }

    function bigNumberWarning() {
        $('bigNumWarn').style.display = $('numericOutput').value == 'BigNumber' ? 'inline-block' : 'none';
    }

    $('numericOutput').addEventListener('change', bigNumberWarning);
    $('precisionRange').addEventListener('input', () => $('precision-label').innerHTML = $('precisionRange').value);

    function saveSettings() {
        // Appearance
        settings.app.theme = $('themeList').value;
        settings.app.fontSize = $('fontSize').value;
        settings.app.fontWeight = $('fontWeight').value;
        settings.app.dateFormat = $('dateFormat').value;
        settings.app.timeFormat = $('timeFormat').value;
        settings.app.dateDay = $('dateDay').checked;
        settings.app.syntax = $('syntaxButton').checked;
        settings.app.keywordTips = $('keywordTipsButton').checked;
        settings.app.matchBrackets = $('matchBracketsButton').checked;
        // Calculator
        settings.app.precision = $('precisionRange').value;
        settings.app.numericOutput = $('numericOutput').value;
        settings.app.matrixType = $('matrixType').value;
        settings.app.predictable = $('predictableButton').checked;
        settings.app.thouSep = $('thouSepButton').checked;
        if (!settings.app.currencies && $('currencyButton').checked) {
            getRates();
        } else if (!$('currencyButton').checked) {
            localStorage.removeItem('rateDate');
            currencyRates = {};
        }
        settings.app.currencies = $('currencyButton').checked;
        // Panel UI
        settings.app.autocomplete = $('autocompleteButton').checked;
        settings.app.closeBrackets = $('closeBracketsButton').checked;
        settings.app.divider = $('dividerButton').checked;
        settings.app.lineNumbers = $('lineNoButton').checked;
        settings.app.lineErrors = $('lineErrorButton').checked;
        settings.app.lineWrap = $('lineWrapButton').checked;

        ls.set('settings', settings);
        checkDefaultSettings();
        applySettings();
    }

    document.querySelectorAll('.settingItem').forEach((el) => el.addEventListener('change', () => saveSettings()));

    // Help dialog content
    $('searchBox').addEventListener('input', () => {
        var str = $('searchBox').value.trim();
        if (str) {
            try {
                $('searchResults').innerHTML = '';
                var res = JSON.stringify(math.help(str).toJSON());
                var obj = JSON.parse(res);
                $('searchResults').innerHTML = `
                    <div>Name:</div><div>${obj.name}</div>
                    <div>Description:</div><div>${obj.description}</div>
                    <div>Category:</div><div>${obj.category}</div>
                    <div>Syntax:</div><div>${String(obj.syntax).split(',').join(', ')}</div>
                    <div>Examples:</div><div>${String(obj.examples).split(',').join(', ')}</div>
                    <div>Also see:</div><div>${String(obj.seealso).split(',').join(', ')}</div>
                `;
            } catch (error) {
                $('searchResults').innerHTML = `No results for "${str}"`;
            }
        } else {
            $('searchResults').innerHTML = 'Start typing above to search...';
        }
    });

    // Panel resizer
    let resizeDelay;
    let isResizing = false;

    const panel = $('panel');
    const divider = $('divider');

    $('divider').addEventListener('dblclick', resetDivider);
    $('divider').addEventListener('mousedown', (e) => isResizing = e.target == divider);
    $('panel').addEventListener('mouseup', () => isResizing = false);
    $('panel').addEventListener('mousemove', (e) => {
        var offset = settings.app.lineNumbers ? 12 : 27;
        var pointerRelativeXpos = e.clientX - panel.offsetLeft - offset;
        var iWidth = pointerRelativeXpos / panel.clientWidth * 100;
        var inputWidth = iWidth < 0 ? 0 : iWidth > 100 ? 100 : iWidth;
        if (isResizing) {
            $('input').style.width = inputWidth + '%';
            settings.inputWidth = inputWidth;
            ls.set('settings', settings);
            clearTimeout(resizeDelay);
            resizeDelay = setTimeout(calculate, 10);
        }
    });

    function resetDivider() {
        settings.inputWidth = defaultSettings.inputWidth;
        ls.set('settings', settings);
        applySettings();
    }

    // Plot
    let func;
    let activePlot;

    const numaraPlot = window.functionPlot;

    function plot() {
        $('plotTitle').innerHTML = func;

        var f = func.split('=')[1];
        var domain = math.abs(math.evaluate(f, {
            x: 0
        })) * 2;

        if (domain == Infinity || domain == 0) domain = 10;

        var xDomain = activePlot ? activePlot.meta.xScale.domain() : [-domain, domain];
        var yDomain = activePlot ? activePlot.meta.yScale.domain() : [-domain, domain];

        activePlot = numaraPlot({
            target: '#plot',
            height: $('plot').clientHeight,
            width: $('plot').clientWidth,
            xAxis: {
                domain: xDomain
            },
            yAxis: {
                domain: yDomain
            },
            tip: {
                xLine: settings.plot.plotCross,
                yLine: settings.plot.plotCross,
            },
            grid: settings.plot.plotGrid,
            data: [{
                fn: f,
                graphType: 'polyline',
                closed: settings.plot.plotArea
            }],
            plugins: [numaraPlot.plugins.zoomBox()]
        });
    }

    UIkit.util.on('#dialog-plot', 'shown', () => plot());
    UIkit.util.on('#dialog-plot', 'hide', () => activePlot = false);

    // Relayout plot on window resize
    let windowResizeDelay;
    window.addEventListener('resize', () => {
        if (activePlot && $('dialog-plot').classList.contains('uk-open')) plot();
        clearTimeout(windowResizeDelay);
        windowResizeDelay = setTimeout(calculate, 10);
        checkWindowSize();
    });

    // Show confirmation dialog
    function confirm(msg, action) {
        $('confirmMsg').innerHTML = msg;
        showModal('#dialog-confirm');
        var yesAction = (e) => {
            action();
            e.stopPropagation();
            UIkit.modal('#dialog-confirm').hide();
            $('confirm-yes').removeEventListener('click', yesAction);
        }
        $('confirm-yes').addEventListener('click', yesAction);
        UIkit.util.on('#dialog-confirm', 'hidden', () => $('confirm-yes').removeEventListener('click', yesAction));
    }

    // Show error dialog
    function showError(e, title) {
        UIkit.util.on('#dialog-error', 'beforeshow', () => {
            $('errTitle').innerHTML = title || 'Error';
            $('errMsg').innerHTML = e;
        })
        showModal('#dialog-error');
    }

    // Show app messages
    function notify(msg, stat) {
        UIkit.notification({
            message: msg,
            status: stat || 'primary',
            pos: 'bottom-center',
            timeout: 3000
        });
    }

    // Sync scroll
    let inputScroll = false;
    let outputScroll = false;

    const leftSide = document.getElementsByClassName('CodeMirror-scroll')[0];
    const rightSide = $('output');

    leftSide.addEventListener('scroll', () => {
        if (!inputScroll) {
            outputScroll = true;
            rightSide.scrollTop = leftSide.scrollTop;
        }
        inputScroll = false;
    });

    rightSide.addEventListener('scroll', () => {
        if (!outputScroll) {
            inputScroll = true;
            leftSide.scrollTop = rightSide.scrollTop;
        }
        outputScroll = false;
        $('scrollTop').style.display = $('output').scrollTop > 50 ? 'block' : 'none';
    });

    $('scrollTop').addEventListener('click', () => $('output').scrollTop = 0);

    // Mousetrap
    const traps = {
        clearButton: ['command+d', 'ctrl+d'],
        printButton: ['command+p', 'ctrl+p'],
        saveButton: ['command+s', 'ctrl+s'],
        openButton: ['command+o', 'ctrl+o']
    }

    Object.entries(traps).map(([b, c]) => {
        Mousetrap.bindGlobal(c, (e) => {
            e.preventDefault();
            if (document.getElementsByClassName('uk-open').length === 0) $(b).click();
        });
    });

    // Check for updates
    if (isNode) {
        ipc.send('checkUpdate');
        ipc.on('notifyUpdate', (event) => {
            notify(`Updating Numara to latest version... <a class="updateLink" onclick="$('aboutButton').click()">View update status</a>`);
            $('notificationDot').style.display = 'block';
        });
        ipc.on('updateStatus', (event, status) => {
            if (status == 'ready') {
                $('dialog-about-updateStatus').innerHTML = 'Restart Numara to finish updating.';
                $('restartButton').style.display = 'inline-block';
                if (!$('dialog-about').classList.contains('uk-open')) {
                    notify(`Restart Numara to finish updating. <a class="updateLink" onclick="$('restartButton').click()">Restart Now</a>`);
                }
            } else {
                $('dialog-about-updateStatus').innerHTML = status;
            }
        });
    }

    const demo = `1+2

# In addition to mathjs functions, you can do:
ans // Get last answer
total // Total up to this point
avg // Average up to this point
line4 // Get answer from a line#
subtotal // Subtotal last block

# Percentages:
10% of 20
40 + 30%

# Dates
today
now
today - 3 weeks
now + 36 hours - 2 days

# Currency conversion
1 usd to try
20 cad to usd

# Plot functions
f(x) = sin(x)
f(x) = 2x^2 + 3x - 5
`;
})();

window.addEventListener('load', () => {
    setTimeout(() => document.getElementsByClassName('CodeMirror-code')[0].lastChild.scrollIntoView(), 250);
    setTimeout(() => cm.focus(), 500);
});