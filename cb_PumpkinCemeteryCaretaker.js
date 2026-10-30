// =====================================
// Pumpkin Cemetery Caretaker
// Author: China Blue
// Version: 0.2.9
// Copyright © 2026 CodeByCB (China Blue)
//
// Navigation and pumpkin-refill tool for the TSO client.
// Adds "CB Pumpkin Cemetery Caretaker" to the Tools menu.
// Finds Noble, Common and Small Pumpkin Cemeteries on the viewed island,
// including friends' islands, and centres the map on a chosen cemetery.
// The Refilling tab shows current deposits and calculates linked Add/Total
// values. Apply individual top-ups or use Add all, with drops spaced at
// random 1-3 second intervals and one server refresh after the batch.
// Top-ups are limited to 1000 per field and 1000 across each adding run.
// Negative Add values are skipped.
// Optionally centres the map when entering an Add or Total field.
// Optional same-type editing copies Add/Total choices and refills that type together.
// Shows your available pumpkin refills; local Refresh rereads the client data.
// Remembers refill choices, the last tab, and optional display on friend visits.
// Clear and Clear all remove saved refill values. Server responses and fresh
// deposit/inventory data verify the result; unconfirmed requests are not retried.
//
// If you like my work, you can support me:
// https://buymeacoffee.com/china_blue
//
// Visit CodeByCB on GitHub to discover other current and future projects:
// https://github.com/CodeByCB
//
// Suggestions, feedback, comments or ideas for improvements are welcome.
// Please contact China_Blue on Discord.
//
// Community maintenance notice:
// The community is welcome to continue improving, fixing,
// modifying and redistributing it, while preserving credits
// to China Blue in the source code.
//
// Provided as-is, without warranty.
// =====================================
(function () {
    var previous = window.cbPumpkinCemeteryCaretaker || window.cbCemeteryAssistant || window.cbPumpkinNavigator;
    if (previous && previous.destroy) previous.destroy();
    var id = 'cbPumpkinNavigatorPanel', hostId = id + 'Host', scope = 'cbCemeteryAssistant';
    var state = { rows: [], zone: null, map: null, selected: -1, ready: false,
        status: 'Waiting for the island to load.', autoShow: false, moveOnEdit: false, sameType: false, open: false };
    var timer, bootTimer, lastKey = null, stable = 0, retries = 0, destroyed = false, autoPending = true;
    var types = ['Noble', 'Common', 'Small', 'Other cemeteries'];
    var version = '0.2.9', tab = 'navigation', choices = {}, job = null, uncertain = false, recovery = null;
    var dropTimer = null;
    var lastRefill = null, serverRefresh = null;
    var inputGuard = { stage: null, listener: null, claimed: false, loader: null, previousFocus: null };
    var api = window.cbPumpkinCemeteryCaretaker = { open: open, destroy: destroy };
    window.cbCemeteryAssistant = api;
    window.cbPumpkinNavigator = api; // Existing menu dispatchers remain usable until restart.

    function norm(value) { return String(value || '').replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function inputFocused() {
        var element = document.activeElement, panel = document.getElementById(id);
        return !!(element && panel && $('#' + hostId).is(':visible') && $.contains(panel, element) &&
            $(element).is('input[type="text"],input[type="number"],textarea,[contenteditable="true"]'));
    }
    function claimInputFocus() {
        if (!inputFocused()) return;
        try {
            var stage = window.nativeWindow && window.nativeWindow.stage, loader = window.htmlLoader;
            if (!stage || !loader) return;
            if (!inputGuard.claimed) {
                inputGuard.previousFocus = stage.focus === loader ? null : stage.focus;
                inputGuard.loader = loader; inputGuard.claimed = true;
            }
            stage.focus = loader;
        } catch (e) {}
    }
    function releaseInputFocus() {
        if (!inputGuard.claimed) return;
        try {
            var stage = window.nativeWindow && window.nativeWindow.stage;
            if (stage && stage.focus === inputGuard.loader) stage.focus = inputGuard.previousFocus;
        } catch (e) {}
        inputGuard.claimed = false; inputGuard.loader = null; inputGuard.previousFocus = null;
    }
    function installInputGuard(host) {
        var fields = 'input[type="text"],input[type="number"],textarea,[contenteditable="true"]';
        host.on('focusin.pcInputGuard', fields, claimInputFocus)
            .on('focusout.pcInputGuard', fields, releaseInputFocus)
            .on('hide.bs.modal.pcInputGuard', releaseInputFocus)
            .on('keydown.pcInputGuard keypress.pcInputGuard keyup.pcInputGuard', fields, function (event) {
                // Preserve the browser's default text editing, but do not forward
                // these keystrokes to document-level game shortcuts.
                event.stopPropagation();
            });
        try {
            var stage = window.nativeWindow && window.nativeWindow.stage;
            if (!stage || inputGuard.listener) return;
            var listener = function (event) {
                if (!inputFocused()) { releaseInputFocus(); return; }
                claimInputFocus();
                // AIR's Flash map hotkeys are separate from DOM events. Bubble
                // phase runs after HTML editing and before native game listeners.
                event.stopImmediatePropagation();
            };
            stage.addEventListener('keyDown', listener, false, 2147483647);
            stage.addEventListener('keyUp', listener, false, 2147483647);
            inputGuard.stage = stage; inputGuard.listener = listener;
        } catch (e) {}
    }
    function clientInterface() {
        if (typeof EXUDM_GI === 'function') return EXUDM_GI();
        if (typeof swmmo !== 'undefined' && swmmo.application && swmmo.application.mGameInterface) return swmmo.application.mGameInterface;
        return game.gi;
    }
    function label(name) { try { return loca.GetText('BUI', name) || name; } catch (e) { return name; } }
    function classify(name, text) {
        var internal = norm(name), translated = norm(text);
        // Use the client's building labels: do not guess the meaning of numeric suffixes.
        if (/decor|mansion/.test(internal)) return -1;
        var cemetery = /pumpkin.*cemetery|cemetery.*pumpkin/.test(translated) ||
            /^pumpkin(field|cemetery)/.test(internal);
        if (!cemetery) return -1;
        var combined = internal + ' ' + translated;
        if (/noble/.test(combined)) return 0;
        if (/common/.test(combined)) return 1;
        if (/small/.test(combined)) return 2;
        return 3; // Keep unfamiliar/localised cemetery variants accessible.
    }
    function context() {
        try {
            var gi = clientInterface();
            if (!gi || !gi.mCurrentViewedZoneID || gi.mRefreshZoneIsActive) return null;
            if (typeof globalFlash !== 'undefined' && globalFlash && globalFlash.gui &&
                globalFlash.gui.mLoadingZonePanel.IsVisible()) return null;
            var map = gi.mCurrentPlayerZone.mStreetDataMap;
            if (!map) return null;
            return { zone: String(gi.mCurrentViewedZoneID), map: map };
        } catch (e) { return null; }
    }
    function same(c) { return c && c.zone === state.zone && c.map === state.map; }
    function islandName() {
        try {
            var player = clientInterface().FindPlayerFromId(Number(state.zone));
            if (player) return player.GetPlayerName_string();
        } catch (e) {}
        return 'Island ' + state.zone;
    }
    function scan() {
        var c = context();
        state.ready = false; state.rows = []; state.selected = -1;
        if (!c) { state.status = 'Waiting for the island to load.'; render(); return false; }
        state.zone = c.zone; state.map = c.map;
        try {
            var vector = c.map.GetBuildings_vector(), rows = [], seen = {}, skipped = 0;
            for (var i = 0; i < vector.length; i++) {
                try {
                    var b = typeof vector.getItemAt === 'function' ? vector.getItemAt(i) : vector[i];
                    if (!b) continue;
                    var name = String(b.GetBuildingName_string()), text = label(name), type = classify(name, text);
                    if (type < 0) continue;
                    var grid = Number(b.GetGrid());
                    if (!isFinite(grid) || grid < 0 || seen[grid]) continue;
                    seen[grid] = true;
                    rows.push({ grid: grid, name: name, label: text, type: type });
                } catch (e) { skipped++; }
            }
            if (!same(context())) throw Error('Island changed');
            rows.sort(function (a, b) { return a.type - b.type || a.grid - b.grid; });
            var ordinals = {};
            rows.forEach(function (r) {
                ordinals[r.type] = (ordinals[r.type] || 0) + 1;
                r.ordinal = ordinals[r.type]; r.key = r.type + ':' + r.ordinal;
                readDeposit(r);
            });
            state.rows = rows; state.ready = true;
            state.status = rows.length ? rows.length + ' cemeteries found. Choose a number or use Next.' : 'No Pumpkin Cemeteries found on this island.';
            if (skipped) state.status += ' Some buildings could not be read; try Refresh.';
            if (rows.some(function (r) { return r.type === 3; })) state.status += ' Unrecognised types appear under Other cemeteries.';
            render(); return true;
        } catch (e) {
            state.status = 'Buildings are unavailable. Wait for the island to load or click Refresh.';
            render(); return false;
        }
    }
    function go(index, keepEditor) {
        if (!state.ready || !same(context())) { invalidate(); return; }
        var row = state.rows[index];
        if (!row) return;
        try {
            var building = game.zone.GetBuildingFromGridPosition(row.grid);
            if (!building || String(building.GetBuildingName_string()) !== row.name) {
                scan(); state.status = 'The buildings changed. Choose a cemetery from the refreshed list.'; render(); return;
            }
            game.zone.ScrollToGrid(row.grid);
            state.selected = index;
            var ordinal = 0;
            for (var i = 0; i <= index; i++) if (state.rows[i].type === row.type) ordinal++;
            state.status = types[row.type] + ' ' + ordinal + ' - grid ' + row.grid + ' (' + (index + 1) + ' of ' + state.rows.length + ').';
            // Editing must retain the existing input, caret and keyboard guard.
            if (keepEditor) $('#' + id + ' .pcStatus').text(state.status);
            else render();
        } catch (e) { state.status = 'Could not move to this cemetery. Click Refresh and try again.'; render(); }
    }
    function step(delta) {
        var count = state.rows.length;
        if (!count) return;
        go(state.selected < 0 ? (delta > 0 ? 0 : count - 1) : (state.selected + delta + count) % count);
    }
    function invalidate() {
        if (job) stopJob('Island changed or loading. Remaining refills cancelled.', !!job.pending);
        state.ready = false; state.rows = []; state.selected = -1;
        state.status = 'Island changed or loading. Updating cemeteries…';
        lastKey = null; stable = 0; retries = 0; autoPending = true; render();
    }
    function tick() {
        if (destroyed) return;
        try {
            // A server refresh can replace the map and temporarily make context()
            // unavailable. Keep its owner pending instead of treating it as travel.
            if (serverRefresh) { pollServerRefresh(); return; }
            if (uncertain && recovery) {
                try {
                    if (refillConfirmed(recovery)) {
                        uncertain = false; recovery = null;
                        if (state.ready) state.rows.forEach(readDeposit);
                        state.status = 'Previous refill confirmed. Remaining queued refills were cancelled.'; render();
                    }
                } catch (e) {}
            }
            var c = context();
            if (!c) { if (state.ready) invalidate(); stable = 0; return; }
            if (!same(c)) {
                state.zone = c.zone; state.map = c.map; invalidate();
            }
            if (lastKey !== c.zone) { lastKey = c.zone; stable = 0; }
            stable++;
            if (stable < 2 || (!state.open && !state.autoShow && !job)) return;
            // A few bounded follow-up scans cover late building population after travel.
            if (!state.ready || (state.rows.length === 0 && retries < 5)) {
                if (scan()) {
                    retries++;
                }
            }
            if (autoPending && state.autoShow && isFriendIsland(c) && state.ready && !otherDialogs().length) show();
            if (job) processJob();
        } finally { if (!destroyed) timer = setTimeout(tick, 1000); }
    }
    function isFriendIsland(c) {
        try { return Number(c.zone) > 0 && !clientInterface().isOnHomzone(); } catch (e) { return false; }
    }
    function save() {
        try { settings.store({ autoShow: state.autoShow, moveOnEdit: state.moveOnEdit, sameType: state.sameType, tab: tab, choices: choices }, scope); }
        catch (e) { state.status = 'Preference works for this session; it could not be saved.'; render(); }
    }
    function readDeposit(row) {
        row.current = null; row.depositGrid = null; row.resource = null;
        try {
            var buildings = state.map.mBuildingContainer;
            var b = buildings ? buildings.get(row.grid) : game.zone.GetBuildingFromGridPosition(row.grid);
            if (!b || String(b.GetBuildingName_string()) !== row.name) return null;
            var deposits = state.map.mDepositContainer, d = deposits.get(row.grid);
            if (!d && b.GetResourceCreation()) d = deposits.get(b.GetResourceCreation().GetDepositBuildingGridPos());
            // The native pumpkin deposit/refill resource is HalloweenResource.
            // Keep the legacy Pumpkin alias for clients using that resource ID.
            if (!d || ['halloweenresource', 'pumpkin'].indexOf(norm(d.GetName_string())) < 0) return null;
            var amount = Number(d.GetAmount());
            if (!isFinite(amount) || amount < 0 || Math.floor(amount) !== amount) return null;
            row.current = amount; row.depositGrid = Number(d.GetGrid()); row.resource = String(d.GetName_string());
            return d;
        } catch (e) { return null; }
    }
    function integer(value) {
        if (!/^\d+$/.test(String(value))) return null;
        var n = Number(value);
        return n <= 2147483647 ? n : null;
    }
    function amounts(row, choice) {
        choice = choice || choices[row.key];
        if (!choice || choice.value === '') return { add: '', total: '', valid: false, blank: true };
        var n = integer(choice.value);
        if (n === null || row.current === null) return { add: choice.mode === 'add' ? choice.value : '', total: choice.mode === 'total' ? choice.value : '', valid: false, negative: Number(choice.value) < 0 };
        var add = choice.mode === 'total' ? n - row.current : n;
        var total = row.current + add;
        return { add: add, total: total, valid: add > 0 && add <= 1000 && total <= 2147483647, negative: add < 0 };
    }
    function editChoice() {
        if (job || serverRefresh) return;
        var input = $(this), tr = input.closest('tr'), row = state.rows[Number(tr.attr('data-index'))];
        if (!row) return;
        var mode = input.attr('data-mode');
        var value = input.val();
        state.rows.forEach(function (target, index) {
            if (target !== row && (!state.sameType || target.type !== row.type)) return;
            choices[target.key] = { mode: mode, value: value };
            // Keep the active editor intact so typing/caret and AIR focus survive.
            updateRefillRow($('#' + id + ' .pcFillTable tbody tr[data-index="' + index + '"]'), target, input[0]);
        });
        $('#' + id + ' .pcAddAll').prop('disabled', uncertain || !state.rows.some(function (r) { return amounts(r).valid; }));
        save();
    }
    function updateRefillRow(tr, row, editor) {
        var values = amounts(row);
        tr.find('.pcNumber').each(function () { if (this !== editor) $(this).val(values[$(this).attr('data-mode')]); });
        tr.find('.pcNumber').toggleClass('pcInvalid', !values.blank && !values.valid && values.add !== 0 && !values.negative);
        tr.find('.pcNumber').each(function () { $(this).toggleClass('pcNegative', Number($(this).val()) < 0); });
        tr.find('.pcAddRow').prop('disabled', !state.ready || uncertain || !values.valid);
    }
    function renderRefillStock() {
        var label = $('#' + id + ' .pcOwnStock');
        try {
            var gi = clientInterface(), player = gi.mCurrentPlayer || gi.mHomePlayer;
            var vector = player.getAvailableBuffs_vector(), available = 0, pending = 0;
            for (var i = 0; i < vector.length; i++) {
                var buff = typeof vector.getItemAt === 'function' ? vector.getItemAt(i) : vector[i];
                if (String(buff.GetBuffDefinition().GetName_string()).indexOf('FillDeposit') !== 0 ||
                    ['halloweenresource', 'pumpkin'].indexOf(norm(buff.GetResourceName_string())) < 0) continue;
                var amount = Number(buff.GetAmount()), waiting = Number(buff.GetWaitingForServerCount());
                if (!isFinite(amount) || amount < 0 || !isFinite(waiting)) throw Error('Stock unavailable');
                var reserved = job && job.reservations[uidKey(buff.GetUniqueId())];
                var outstanding = reserved ? Math.max(0, reserved.sent - Math.max(0, reserved.before - amount)) : 0;
                var held = Math.min(amount, Math.max(0, waiting, outstanding));
                available += amount - held; pending += held;
            }
            label.text('Your pumpkin refills: ' + available + (pending ? ' (' + pending + ' pending)' : ''));
        } catch (e) { label.text('Your pumpkin refills: unavailable'); }
    }
    function renderRefills() {
        renderRefillStock();
        var target = $('#' + id + ' .pcRefillRows').empty();
        if (!state.rows.length) { target.text(state.ready ? 'No Pumpkin Cemeteries found.' : 'Waiting for the island to load.'); $('#' + id + ' .pcAddAll').prop('disabled', true); return; }
        var table = $('<table class="pcFillTable"><thead><tr><th>Cem / Stock</th><th>Add</th><th>Total</th><th></th></tr></thead><tbody></tbody></table>');
        state.rows.forEach(function (row, index) {
            var values = amounts(row), tr = $('<tr>').attr('data-index', index);
            tr.append($('<td>').append($('<span>').text(types[row.type] + ' ' + row.ordinal))
                .append($('<span class="pcCurrent">').text(row.current === null ? 'Current: unavailable' : 'Current: ' + row.current)));
            ['add', 'total'].forEach(function (mode) {
                tr.append($('<td>').append($('<input type="text" inputmode="numeric" class="pcNumber">')
                    .attr('data-mode', mode).attr('aria-label', types[row.type] + ' ' + row.ordinal + ' ' + mode)
                    .attr('title', mode === 'add' ? 'Pumpkins to add (maximum 1000)' : 'Desired total pumpkins (maximum top-up 1000)')
                    .val(values[mode]).prop('disabled', !!job || row.current === null)
                    .toggleClass('pcInvalid', !values.blank && !values.valid && values.add !== 0 && !values.negative)
                    .toggleClass('pcNegative', Number(values[mode]) < 0)));
            });
            tr.append($('<td>').append($('<button type="button" class="pcAddRow">').text('Add').attr('data-index', index)
                .prop('disabled', !!job || uncertain || !state.ready || !values.valid))
                .append($('<button type="button" class="pcClearRow">').text('Clear').attr('data-index', index).prop('disabled', !!job || !!serverRefresh)));
            table.find('tbody').append(tr);
        });
        target.append(table);
        $('#' + id + ' .pcAddAll').prop('disabled', !!job || uncertain || !state.ready || !state.rows.some(function (r) { return amounts(r).valid; }));
    }
    function clearChoices(index) {
        if (job || serverRefresh) return;
        if (index === null) {
            // Store explicit blanks: Settings.store deep-merges objects, so
            // deleting keys would leave the old saved choices behind.
            Object.keys(choices).forEach(function (key) { choices[key] = { mode: 'add', value: '' }; });
            state.rows.forEach(function (row) { choices[row.key] = { mode: 'add', value: '' }; });
        } else {
            var row = state.rows[index];
            if (!row) return;
            choices[row.key] = { mode: 'add', value: '' };
        }
        save(); render();
    }
    function refillStock(row) {
        var gi = clientInterface(), player = gi.mCurrentPlayer || gi.mHomePlayer;
        var vector = player.getAvailableBuffs_vector(), result = [];
        for (var i = 0; i < vector.length; i++) {
            var buff = typeof vector.getItemAt === 'function' ? vector.getItemAt(i) : vector[i];
            var def = buff.GetBuffDefinition();
            if (String(def.GetName_string()).indexOf('FillDeposit') !== 0 || String(buff.GetResourceName_string()) !== row.resource) continue;
            var available = Number(buff.GetAmount()) - Number(buff.GetWaitingForServerCount());
            if (job && job.reservations) {
                var reserved = job.reservations[uidKey(buff.GetUniqueId())];
                if (reserved) available -= Math.max(0, reserved.sent - Math.max(0, reserved.before - Number(buff.GetAmount())));
            }
            if (!(available > 0)) continue;
            // Native validation covers the friend's island, deposit type and target permissions.
            var target = buff.IsApplyable(gi.mCurrentPlayer, gi, row.depositGrid);
            if (!target || typeof target.GetGrid !== 'function' || Number(target.GetGrid()) !== row.depositGrid) continue;
            result.push({ buff: buff, amount: available });
        }
        return result;
    }
    function uidKey(uid) { return String(uid.uniqueID1) + '_' + String(uid.uniqueID2); }
    function currentRefillAmount(pending) {
        // Zone/Star refreshes can replace cBuff instances. Resolve the UID again
        // instead of waiting on the cached object used when sending the request.
        var gi = clientInterface(), player = gi.mCurrentPlayer || gi.mHomePlayer;
        var vector = player.getAvailableBuffs_vector();
        for (var i = 0; i < vector.length; i++) {
            var b = typeof vector.getItemAt === 'function' ? vector.getItemAt(i) : vector[i];
            if (uidKey(b.GetUniqueId()) === pending.uid) return Number(b.GetAmount());
        }
        return 0;
    }
    function resourceRefillAmount(resource) {
        var gi = clientInterface(), player = gi.mCurrentPlayer || gi.mHomePlayer;
        var vector = player.getAvailableBuffs_vector(), total = 0;
        for (var i = 0; i < vector.length; i++) {
            var b = typeof vector.getItemAt === 'function' ? vector.getItemAt(i) : vector[i];
            if (String(b.GetBuffDefinition().GetName_string()).indexOf('FillDeposit') !== 0 || String(b.GetResourceName_string()) !== resource) continue;
            var n = Number(b.GetAmount());
            if (!isFinite(n) || n < 0) throw Error('Current refill stock is unavailable.');
            total += n;
        }
        return total;
    }
    function refillConfirmed(pending) {
        if (!pending.acknowledged || (!pending.refreshed && recovery !== pending)) return false;
        var currentStock = currentRefillAmount(pending), currentTotal = resourceRefillAmount(pending.resource);
        var deposit = state.map.mDepositContainer.get(pending.grid);
        var currentDeposit = deposit ? Number(deposit.GetAmount()) : null;
        lastRefill.currentStock = currentStock; lastRefill.currentDeposit = currentDeposit; lastRefill.currentTotalStock = currentTotal;
        return pending.beforeTotal - currentTotal >= pending.amount || (pending.refreshed && currentDeposit !== null && currentDeposit >= pending.beforeDeposit + pending.amount);
    }
    function requestServerRefresh(reason, onReady, onFail) {
        if (serverRefresh) return false;
        var task = serverRefresh = { zone: state.zone, at: Date.now(), reason: reason,
            onReady: onReady, onFail: onFail, sent: false, replied: false, verifyAt: 0, failure: null };
        state.status = reason; render(); pollServerRefresh(); return true;
    }
    function finishServerRefresh(task, failure) {
        if (serverRefresh !== task) return;
        serverRefresh = null;
        if (failure) { task.onFail(failure); return; }
        var c = context();
        if (!c || c.zone !== task.zone) { task.onFail('The island changed during server refresh.'); return; }
        state.zone = c.zone; state.map = c.map;
        if (job) job.map = c.map;
        if (!scan()) { task.onFail('The refreshed cemetery data could not be read.'); return; }
        task.onReady();
    }
    function pollServerRefresh() {
        var task = serverRefresh;
        if (!task || destroyed) return;
        try {
            var gi = clientInterface(), now = Date.now();
            if (String(gi.mCurrentViewedZoneID) !== task.zone) { finishServerRefresh(task, 'Island changed. Remaining refills cancelled.'); return; }
            if (task.failure) { finishServerRefresh(task, task.failure); return; }
            if (now - task.at > 60000) { finishServerRefresh(task, 'Server refresh timed out. No refill was retried.'); return; }
            if (!task.sent) {
                if (!context()) return;
                task.sent = true;
                if (typeof _exudMissions_Last_SecureBuffMinimalInfo !== 'undefined') _exudMissions_Last_SecureBuffMinimalInfo = null;
                var responder = game.createResponder(function (command, result) {
                    if (destroyed || serverRefresh !== task) return;
                    if (result && Number(result.errorCode)) { task.failure = 'Server refresh rejected (error ' + result.errorCode + ').'; return; }
                    task.replied = true; task.verifyAt = Date.now() + 7000;
                }, function (command, result) { if (serverRefresh === task) task.failure = 'Server refresh failed' + (result ? ' (error ' + result.errorCode + ')' : '') + '.'; });
                // Same native refresh request used by UpdateStarMenu/Alarms,
                // addressed to the captured island rather than a later view.
                gi.mClientMessages.SendMessagetoServer(1037, Number(task.zone), null, responder);
                return;
            }
            if (!task.replied || now < task.verifyAt || !context()) return;
            finishServerRefresh(task, null);
        } catch (e) { finishServerRefresh(task, 'Could not refresh from server: ' + (e.message || e)); }
    }
    function returnedRefillAction(result) {
        if (!result || !result.data) return null;
        var tick = result.data, action = tick;
        if (tick.data && tick.data.grid != null) action = tick.data;
        var out = {};
        ['mode', 'playerID', 'time'].forEach(function (key) { try { if (tick[key] != null) out[key] = Number(tick[key]); } catch (e) {} });
        ['type', 'grid', 'endGrid'].forEach(function (key) { try { if (action[key] != null) out[key] = Number(action[key]); } catch (e) {} });
        try { if (action.data && action.data.uniqueID1 != null) out.uid = uidKey(action.data); } catch (e) {}
        try { if (tick.time != null) out.queuedForMS = Number(tick.time) - Number(clientInterface().GetClientTime()); } catch (e) {}
        return out;
    }
    function refillReply(active, pending, result, failed) {
        if (destroyed) return;
        var code = result && result.errorCode != null ? Number(result.errorCode) : null;
        lastRefill.replyAt = Date.now(); lastRefill.errorCode = code;
        var returned = returnedRefillAction(result);
        if (returned) lastRefill.returnedAction = returned;
        if (failed || (code !== null && code !== 0)) {
            var error = code === null ? 'No server reply (connection fault).' : 'Server rejected the refill (error ' + code + ').';
            try { if (code !== null) error = 'Server rejected the refill: ' + game.def('Enums::ERROR_CODES').toString(code) + ' (' + code + ').'; } catch (e) {}
            lastRefill.result = error;
            if (job === active && active.pending === pending) stopJob(error, code === null);
            else if (recovery === pending && code !== null) {
                recovery = null; uncertain = false; state.status = error + ' Remaining queued refills were cancelled.'; render();
            }
            return;
        }
        if (returned && returned.endGrid != null && returned.endGrid <= 0) {
            lastRefill.result = 'Server returned a non-applying refill amount: ' + returned.endGrid + '.';
            if (job === active && active.pending === pending) stopJob(lastRefill.result + ' Nothing was retried.', false);
            return;
        }
        if (returned && ((returned.grid != null && returned.grid !== pending.grid) || (returned.uid && returned.uid !== pending.uid))) {
            lastRefill.result = 'The returned refill action does not match the requested cemetery or item.';
            if (job === active) stopJob(lastRefill.result, true);
            return;
        }
        pending.acknowledged = true;
        lastRefill.result = 'Server accepted; batch is continuing before the final refresh.';
        if (job === active && active.pending === pending) {
            state.status = 'Refill accepted - continuing the batch before refreshing.'; render();
            processJob();
        }
    }
    function sendRefill(active, row, item, amount) {
        var gi = clientInterface(), id = item.buff.GetUniqueId();
        var deposit = state.map.mDepositContainer.get(row.depositGrid);
        lastRefill = { version: version, zone: active.zone, grid: row.depositGrid, resource: row.resource,
            uid: uidKey(id), amount: amount, result: 'Checking native refill conditions.' };
        if (!deposit || Number(deposit.GetAccessibleType()) !== Number(game.def('Enums::DEPOSIT_ACCESSIBLE_TYPES').ACCESSIBLE))
            { lastRefill.result = 'This cemetery deposit is not accessible for refilling. No request was sent.'; throw Error(lastRefill.result); }
        var nativeAmount = Number(item.buff.calculateBuffResult(gi.mCurrentPlayer, gi, deposit, amount, null));
        lastRefill.nativeAmount = nativeAmount; lastRefill.accessibility = Number(deposit.GetAccessibleType());
        if (nativeAmount !== amount) { lastRefill.result = 'Native refill validation returned ' + nativeAmount + ' for the requested ' + amount + '. No request was sent.'; throw Error(lastRefill.result); }
        if (!isFinite(Number(id.uniqueID1)) || !isFinite(Number(id.uniqueID2))) throw Error('Refill item ID is unavailable. Refresh the Star Menu and try again.');
        var Action = game.def('Communication.VO::dServerAction');
        var packet = new Action();
        packet.type = 0; packet.grid = row.depositGrid; packet.endGrid = amount;
        packet.data = game.def('Communication.VO::dUniqueID').Create(Number(id.uniqueID1), Number(id.uniqueID2));
        var pending = { uid: uidKey(id), before: Number(item.buff.GetAmount()), beforeDeposit: row.current, grid: row.depositGrid,
            beforeTotal: resourceRefillAmount(row.resource), resource: row.resource, zone: active.zone,
            amount: amount, at: Date.now(), acknowledged: false };
        var responder = game.createResponder(function (command, result) { refillReply(active, pending, result, false); },
            function (command, result) { refillReply(active, pending, result, true); });
        lastRefill = { version: version, zone: active.zone, grid: row.depositGrid, resource: row.resource,
            refill: String(item.buff.GetBuffDefinition().GetName_string()), uid: pending.uid, amount: amount,
            beforeDeposit: row.current, beforeStock: pending.before, sentAt: pending.at, result: 'Waiting for server reply.' };
        lastRefill.accessibility = Number(deposit.GetAccessibleType()); lastRefill.nativeAmount = nativeAmount;
        lastRefill.beforeTotalStock = pending.beforeTotal;
        state.status = 'Adding ' + amount + ' to ' + types[row.type] + ' ' + row.ordinal + ' - waiting for server reply...';
        active.pending = pending;
        var reservation = active.reservations[pending.uid];
        if (!reservation) reservation = active.reservations[pending.uid] = { before: pending.before, sent: 0 };
        reservation.sent += amount;
        render();
        var delay = 1000 + Math.floor(Math.random() * 2001);
        active.nextAt = pending.at + delay;
        clearTimeout(dropTimer);
        dropTimer = setTimeout(function () { if (!destroyed && job === active) processJob(); }, delay);
        // Same explicit packet and current-zone destination used by the working
        // _exudMissions_ApplyBuffAmount and guild-quest refill scripts. Our own
        // queue reserves this request; do not mutate the native waiting counters.
        gi.mClientMessages.SendMessagetoServer(61, Number(active.zone), packet, responder);
    }
    function stopJob(message, unconfirmed) {
        clearTimeout(dropTimer); dropTimer = null;
        if (unconfirmed && job) recovery = job.pending;
        job = null;
        if (unconfirmed) uncertain = true;
        state.status = message + (unconfirmed ? ' A sent refill is still unconfirmed; further refills are paused while waiting for the client to update.' : '');
        render();
    }
    function startJob(index) {
        if (job || uncertain || serverRefresh) return;
        if (!state.ready || !same(context())) { invalidate(); return; }
        var entries = [], budget = {};
        try {
            state.rows.forEach(function (row, i) {
                if (index !== null && index !== i && (!state.sameType || row.type !== state.rows[index].type)) return;
                var choice = choices[row.key];
                if (!choice || choice.value === '') return;
                if (!readDeposit(row)) throw Error(types[row.type] + ' ' + row.ordinal + ': deposit unavailable.');
                var values = amounts(row);
                if (values.add === 0 || values.negative) return;
                if (!values.valid) throw Error('Each top-up must be a whole number from 1 to 1000.');
                var deposit = state.map.mDepositContainer.get(row.depositGrid);
                if (!deposit || !deposit.IsRefillable()) throw Error('This cemetery cannot currently be refilled.');
                var stock = refillStock(row), total = stock.reduce(function (sum, item) { return sum + item.amount; }, 0);
                budget[row.resource] = (budget[row.resource] || 0) + values.add;
                if (budget[row.resource] > total) throw Error('Not enough usable pumpkin refills in your Star Menu. Need ' + budget[row.resource] + ', available ' + total + '.');
                entries.push({ grid: row.grid, name: row.name, choice: { mode: choice.mode, value: choice.value }, amount: null, applied: 0 });
            });
            if (!entries.length) { state.status = 'No positive Add amounts to apply.'; render(); return; }
            var runTotal = Object.keys(budget).reduce(function (sum, resource) { return sum + budget[resource]; }, 0);
            if (runTotal > 1000) throw Error('This run would add ' + runTotal + ' pumpkins. Maximum per adding run: 1000. Adjust the Add or Total values; nothing was sent.');
            var beforeTotals = {};
            Object.keys(budget).forEach(function (resource) { beforeTotals[resource] = resourceRefillAmount(resource); });
            job = { zone: state.zone, map: state.map, entries: entries, index: 0, pending: null, applied: 0,
                reservations: {}, sent: [], nextAt: 0, beforeTotals: beforeTotals, finishing: false };
            processJob();
        } catch (e) { state.status = String(e.message || e); render(); }
    }
    function processJob() {
        var active = job;
        if (!active) return;
        if (active.finishing) return;
        if (!same(context()) || active.zone !== state.zone || active.map !== state.map) {
            stopJob('Island changed. Remaining refills cancelled.', !!active.pending); return;
        }
        try {
            var entry = active.entries[active.index], row = null;
            state.rows.forEach(function (r) { if (r.grid === entry.grid && r.name === entry.name) row = r; });
            if (!row || !readDeposit(row)) throw Error('Cemetery changed or its deposit is unavailable. Remaining refills cancelled.');
            if (active.pending) {
                var p = active.pending;
                if (p.acknowledged) {
                    active.sent.push(p);
                    entry.applied += p.amount; active.applied += p.amount; active.pending = null;
                    render();
                } else {
                    if (Date.now() - p.at > 45000) {
                        lastRefill.result = p.refreshed ? 'Server-refreshed data did not confirm any refill effect. No request was retried.' : 'No confirmed refill result before timeout.';
                        stopJob(p.refreshed ? 'Server-refreshed data shows no confirmed refill effect. Nothing was retried. Use Refresh to check the latest server amounts.' : p.acknowledged ? 'Server accepted the refill, but fresh server data was not available for confirmation. Nothing was retried.' : 'Server reply timed out. Nothing was retried.', true); return;
                    }
                    return;
                }
            }
            // Fix the row's amount at dispatch time. A Total entry uses the current
            // deposit; subsequent chunks never recalculate and overshoot that plan.
            if (entry.amount === null) { entry.beforeDeposit = row.current; entry.amount = Math.max(0, Number(amounts(row, entry.choice).add)); }
            if (entry.amount > 1000) throw Error('This top-up now exceeds 1000. Adjust its Add or Total value.');
            var remaining = entry.amount - entry.applied;
            if (active.applied + remaining > 1000) throw Error('This run would exceed 1000 pumpkins. Remaining drops cancelled. Adjust the Add or Total values.');
            if (!(remaining > 0)) {
                active.index++;
                if (active.index >= active.entries.length) {
                    finishBatch(active); return;
                }
                processJob(); return;
            }
            if (Date.now() < active.nextAt) return;
            var stock = refillStock(row);
            if (!stock.length) throw Error('No usable pumpkin refills remain. Remaining refills cancelled.');
            var item = stock[0], amount = Math.min(remaining, item.amount);
            sendRefill(active, row, item, amount);
        } catch (e) { stopJob(String(e.message || e), !!(active && active.pending)); }
    }
    function finishBatch(active) {
        if (job !== active || active.finishing) return;
        active.finishing = true;
        requestServerRefresh('All ' + active.sent.length + ' refill drops sent - refreshing once from the server...', function () {
            if (job !== active) return;
            var requested = {}, depositConfirmed = true;
            active.sent.forEach(function (p) { p.refreshed = true; requested[p.resource] = (requested[p.resource] || 0) + p.amount; });
            active.entries.forEach(function (entry) {
                var row = null;
                state.rows.forEach(function (r) { if (r.grid === entry.grid && r.name === entry.name) row = r; });
                if (!row || row.current === null || row.current < entry.beforeDeposit + entry.applied) depositConfirmed = false;
            });
            var stockConfirmed = Object.keys(requested).every(function (resource) { return active.beforeTotals[resource] - resourceRefillAmount(resource) >= requested[resource]; });
            lastRefill.batch = active.sent.map(function (p) { return { grid: p.grid, amount: p.amount, sentAt: p.at }; });
            lastRefill.refreshCompletedAt = Date.now(); lastRefill.verified = stockConfirmed || depositConfirmed;
            if (!lastRefill.verified) {
                lastRefill.result = 'Batch sent, but server-refreshed data did not confirm its effect.';
                active.pending = active.sent[active.sent.length - 1];
                stopJob(lastRefill.result + ' Nothing was retried. Use Refresh to check the latest server amounts.', true); return;
            }
            var applied = active.applied; job = null;
            lastRefill.result = 'Batch confirmed after one final server refresh.';
            state.status = 'Added ' + applied + ' pumpkins. All drops completed; amounts refreshed from the server.'; render();
        }, function (error) {
            if (job === active) { active.pending = active.sent[active.sent.length - 1]; stopJob(error, true); }
        });
    }
    function createPanel() {
        if ($('#' + id).length) return;
        // The client Modal activates the HTMLLoader above the Flash game. A plain
        // body element is hidden behind Flash until an unrelated modal opens.
        createModalWindow(hostId, 'Pumpkin Cemetery Caretaker v.' + version, false);
        var host = $('#' + hostId);
        host.removeClass('fade');
        host.find('.modal-header,.modal-footer').hide();
        host.find('.modal-body').css('padding', 0);
        host.on('hidden.bs.modal.pcNavigator', function () { state.open = false; });
        if (!$('#' + id + 'Style').length) $('head').append($('<style>', { id: id + 'Style' }).text(
            '#' + hostId + ' .modal-dialog{width:440px;max-width:95%;margin:100px 24px 20px auto;}' +
            '#' + hostId + ' .modal-content,#' + hostId + ' .modal-body{height:auto;min-height:0;background:transparent;border:0;box-shadow:none;}' +
            '#' + id + '{width:100%;max-height:80vh;overflow:auto;background:#29251f;color:#f7edd8;border:1px solid #b69b62;border-radius:6px;box-shadow:0 3px 16px #000;font:13px Arial,sans-serif;}' +
            '#' + id + ' .pcHead{padding:9px 10px;background:#493c29;cursor:move;font-weight:bold;}' +
            '#' + id + ' .pcClose{float:right;cursor:pointer;background:none;border:0;color:#fff;font-size:18px;line-height:18px;}' +
            '#' + id + ' .pcBody{padding:10px;}#' + id + ' .pcIsland{margin-bottom:8px;word-wrap:break-word;}' +
            '#' + id + ' .pcRow{display:table-row;}#' + id + ' .pcType{white-space:nowrap;color:#f7edd8 !important;}' +
            '#' + id + ' table{width:100%;border-collapse:collapse;color:inherit;table-layout:fixed;}' +
            '#' + id + ' th,#' + id + ' td{padding:4px 3px;text-align:center;vertical-align:middle;font-size:13px;line-height:1.2;}' +
            '#' + id + ' table th,#' + id + ' table td{color:#f7edd8 !important;}' +
            '#' + id + ' .pcNavTable td{white-space:nowrap;word-break:normal;overflow-wrap:normal;}' +
            '#' + id + ' th:first-child,#' + id + ' td:first-child{text-align:left;}' +
            '#' + id + ' .pcNavTable td:first-child{width:115px;}#' + id + ' .pcType{width:auto;}' +
            '#' + id + ' .pcFillTable th:first-child{width:125px;}#' + id + ' .pcFillTable th:last-child{width:97px;}' +
            '#' + id + ' .pcFillTable td{border-bottom:1px solid #514630;}#' + id + ' input.pcNumber{width:100%;box-sizing:border-box;background:#fff7e5;color:#201a12;border:1px solid #a88f60;border-radius:3px;padding:5px;}' +
            '#' + id + ' input.pcInvalid{border:2px solid #ff8476;}#' + id + ' .pcCurrent{display:block;color:#dfcfab;font-size:12px;}' +
            '#' + id + ' input.pcNegative{color:#b00020 !important;}' +
            '#' + id + ' .pcClearRow{margin-left:3px;}#' + id + ' .pcFillTable input.pcNumber{max-width:75px;}' +
            '#' + id + ' .pcFillTable th:first-child{white-space:nowrap;}#' + id + ' .pcOwnStock{margin-bottom:8px;color:#dfcfab;}' +
            '#' + id + ' .pcToolbar{display:table;width:100%;margin-bottom:12px;border-bottom:1px solid #8a7346;padding-bottom:8px;}' +
            '#' + id + ' .pcTabs,#' + id + ' .pcOptions{display:table-cell;vertical-align:top;white-space:nowrap;}' +
            '#' + id + ' .pcTabs button{margin-right:7px;}#' + id + ' .pcTabs button:last-child{margin-right:0;}' +
            '#' + id + ' .pcOptions{width:1%;text-align:left;padding-left:8px;}#' + id + ' .pcOptions label{display:block;font-size:12px;font-weight:normal;line-height:18px;margin:0;}' +
            '#' + id + ' .pcOptions input{vertical-align:middle;margin:0 3px 0 0;}' +
            '#' + id + ' .pcTabs button.pcActive{background:#e9ab42;}#' + id + ' .pcRefillNote{font-size:12px;margin-top:10px;line-height:1.4;}' +
            '#' + id + ' .pcNumbers{flex:1;}#' + id + ' .pcBody button{background:#eee4cf;color:#292117;border:1px solid #b69b62;border-radius:4px;padding:5px 8px;font-size:12px;}' +
            '#' + id + ' .pcBody button:hover{background:#fff3da;}#' + id + ' .pcBody button:disabled{opacity:.45;cursor:default;}' +
            '#' + id + ' button.pcGo{min-width:30px;margin:2px;padding:4px 8px;}' +
            '#' + id + ' .pcBody button.pcSelected,#' + id + ' .pcBody button.pcSelected:hover{background:#e9ab42;color:#17120b;border-color:#ffe3a0;}' +
            '#' + id + ' .pcStatus{margin:10px 0;line-height:1.4;}'
        ));
        var panel = $('<div>', { id: id, role: 'region', 'aria-label': 'Pumpkin Cemetery Caretaker' }).hide();
        panel.html('<div class="pcHead"><button type="button" class="pcClose" aria-label="Close Pumpkin Cemetery Caretaker">×</button>Pumpkin Cemetery Caretaker v.' + version + '</div>' +
            '<div class="pcBody"><div class="pcIsland"></div>' +
            '<div class="pcToolbar"><div class="pcTabs" role="tablist"><button type="button" role="tab" data-tab="navigation">Navigation</button><button type="button" role="tab" data-tab="refilling">Refilling</button></div>' +
            '<div class="pcOptions"><label class="pcMoveOnEdit"><input type="checkbox"> Move to cemetery when editing</label>' +
            '<label class="pcAuto"><input type="checkbox"> Show when visiting friends</label>' +
            '<label class="pcSameType" title="Copy Add or Total edits to this type. A row Add refills all cemeteries of that type."><input type="checkbox"> Apply to same cemetery type</label></div></div>' +
            '<div class="pcNavigation" role="tabpanel"><div class="pcRows"></div>' +
            '<button type="button" class="btn btn-sm btn-default pcPrev">Previous</button> ' +
            '<button type="button" class="btn btn-sm btn-default pcNext">Next</button></div>' +
            '<div class="pcRefilling" role="tabpanel"><div class="pcOwnStock" role="status" aria-live="polite"></div><div class="pcRefillRows"></div>' +
            '<button type="button" class="pcAddAll">Add all</button> <button type="button" class="pcClearAll">Clear all</button> <button type="button" class="pcLocalRefresh" title="Reread cemetery and refill stock from local client data">Refresh</button><div class="pcRefillNote">Enter Add or Total. Maximum top-up: 1000 per field and 1000 per adding run. The last field edited is remembered for this type and numbered cemetery on the next island.</div></div>' +
            '<div class="pcStatus" role="status" aria-live="polite"></div>' +
            '<button type="button" class="btn btn-sm btn-default pcRefresh">Refresh from server</button>' +
            ' <button type="button" class="pcDetails" style="display:none">Refill details</button><textarea class="pcDetailsText" readonly style="display:none;width:100%;height:160px;background:#fff7e5;color:#201a12;margin-top:8px"></textarea></div>');
        host.find('.modal-body').empty().append(panel);
        installInputGuard(host);
        panel.find('.pcClose').on('click', function () { autoPending = false; host.modal('hide'); });
        panel.find('.pcPrev').on('click', function () { step(-1); });
        panel.find('.pcNext').on('click', function () { step(1); });
        panel.find('.pcRefresh').on('click', function () {
            if (job || serverRefresh) return;
            requestServerRefresh('Refreshing this island from the server...', function () {
                if (recovery) {
                    recovery.refreshed = true;
                    if (refillConfirmed(recovery)) { recovery = null; uncertain = false; }
                }
                state.status = uncertain ? 'Server data refreshed. The previous refill still has no confirmed effect. Nothing was retried.' : 'Cemetery amounts refreshed from the server.';
                render();
            }, function (error) { state.status = error; render(); });
        });
        panel.find('.pcDetails').on('click', function () {
            var details = lastRefill ? JSON.parse(JSON.stringify(lastRefill)) : { version: version, result: 'No refill request sent in this session.' };
            try { if (job && job.pending) details.currentStock = currentRefillAmount(job.pending); } catch (e) { details.readError = String(e); }
            panel.find('.pcDetailsText').val(JSON.stringify(details, null, 2)).toggle();
        });
        panel.on('click', '.pcTabs button', function () { tab = $(this).attr('data-tab'); save(); render(); });
        panel.on('input', '.pcNumber', editChoice);
        panel.on('focusin', '.pcNumber', function () {
            if (!state.moveOnEdit || job || serverRefresh) return;
            claimInputFocus();
            go(Number($(this).closest('tr').attr('data-index')), true);
            claimInputFocus();
        });
        panel.on('click', '.pcAddRow', function () { startJob(Number($(this).attr('data-index'))); });
        panel.find('.pcAddAll').on('click', function () { startJob(null); });
        panel.on('click', '.pcClearRow', function () { clearChoices(Number($(this).attr('data-index'))); });
        panel.find('.pcClearAll').on('click', function () { clearChoices(null); });
        panel.find('.pcLocalRefresh').on('click', function () {
            if (job || serverRefresh) return;
            if (!scan()) return;
            state.status = 'Cemetery and refill stock updated from local data.'; render();
        });
        panel.find('.pcAuto input').prop('checked', state.autoShow).on('change', function () { state.autoShow = this.checked; save(); });
        panel.find('.pcMoveOnEdit input').prop('checked', state.moveOnEdit).on('change', function () { state.moveOnEdit = this.checked; save(); });
        panel.find('.pcSameType input').prop('checked', state.sameType).on('change', function () { state.sameType = this.checked; save(); });
        panel.on('click', '.pcGo', function () { go(Number($(this).attr('data-index'))); });
        if ($.fn.draggable) host.find('.modal-dialog').draggable({ handle: '.pcHead', containment: 'window', cancel: 'button' });
    }
    function render() {
        var panel = $('#' + id);
        if (!panel.length) return;
        panel.find('.pcIsland').text(state.zone ? islandName() : 'Loading island…');
        panel.find('.pcNavigation').toggle(tab === 'navigation');
        panel.find('.pcRefilling').toggle(tab === 'refilling');
        panel.find('.pcTabs button').each(function () { var active = $(this).attr('data-tab') === tab; $(this).toggleClass('pcActive', active).attr('aria-selected', active ? 'true' : 'false'); });
        var table = $('<table class="pcNavTable"><tbody></tbody></table>'), container = table.find('tbody');
        types.forEach(function (type, group) {
            var matching = [];
            state.rows.forEach(function (r, index) { if (r.type === group) matching.push({ row: r, index: index }); });
            if (group === 3 && !matching.length) return;
            var line = $('<tr class="pcRow">').css('display', 'table-row');
            if (!matching.length) {
                line.append($('<td colspan="4" class="pcType">').text(type + ' - ' + (state.ready ? 'none found' : 'loading...')));
                container.append(line); return;
            }
            line.append($('<td class="pcType">').text(type));
            matching.forEach(function (entry, ordinal) {
                line.append($('<td>').append($('<button type="button" class="btn btn-default pcGo">')
                    .attr('data-index', entry.index).attr('title', entry.row.label + ' - grid ' + entry.row.grid)
                    .attr('aria-label', type + ' ' + (ordinal + 1) + ', grid ' + entry.row.grid)
                    .attr('aria-pressed', entry.index === state.selected ? 'true' : 'false')
                    .toggleClass('pcSelected', entry.index === state.selected).prop('disabled', !state.ready).text(ordinal + 1)));
            });
            for (var empty = matching.length; empty < 3; empty++) line.append('<td></td>');
            container.append(line);
        });
        panel.find('.pcRows').empty().append(table);
        renderRefills();
        panel.find('.pcStatus').text(state.status);
        panel.find('.pcPrev,.pcNext').prop('disabled', !state.ready || !state.rows.length);
        panel.find('.pcRefresh').prop('disabled', !!job || !!serverRefresh);
        panel.find('.pcClearAll,.pcLocalRefresh').prop('disabled', !!job || !!serverRefresh);
        if (serverRefresh) panel.find('.pcNumber,.pcAddRow,.pcAddAll,.pcClearRow').prop('disabled', true);
    }
    function otherDialogs() { return $("div[role='dialog']:not(#" + hostId + "):visible"); }
    function show() {
        createPanel();
        // Finish an outgoing fade before activating our dialog: each client
        // show/hide event swaps the Flash and HTML display layers exactly once.
        otherDialogs().removeClass('fade').modal('hide');
        state.open = true; autoPending = false;
        $('#' + id).show();
        if (!$('#' + hostId).is(':visible')) $('#' + hostId).modal({ backdrop: false, keyboard: true, show: true });
        render();
    }
    function open() { show(); if (!serverRefresh) { retries = 0; scan(); } }
    function boot() {
        if (destroyed) return;
        if (typeof addToolsMenuItem !== 'function' || typeof createModalWindow !== 'function' || typeof $ === 'undefined' || typeof game === 'undefined' || !game || !game.gi) {
            bootTimer = setTimeout(boot, 1000); return;
        }
        try {
            if (!settings.read(null, scope)) {
                var legacy = settings.read(null, 'cbPumpkinNavigator');
                if (legacy) settings.store(legacy, scope);
            }
            state.autoShow = !!settings.read('autoShow', scope);
            state.moveOnEdit = !!settings.read('moveOnEdit', scope);
            state.sameType = !!settings.read('sameType', scope);
            tab = settings.read('tab', scope) === 'refilling' ? 'refilling' : 'navigation';
            var saved = settings.read('choices', scope);
            if (saved && typeof saved === 'object') choices = saved;
        } catch (e) {}
        installMenu();
        tick();
    }
    function installMenu() {
        // Reload Scripts clears Tools without clearing window globals. Inspect the
        // actual menu instead of a persistent boolean that outlives its entry.
        var oldLabels = ['Pumpkin Cemeteries', 'CB Cemetery Assistant', 'CB Pumpkin Cemetery Caretaker'];
        try {
            var toolsMenu = menu.nativeMenu.getItemByName('Tools').submenu;
            for (var i = toolsMenu.numItems - 1; i >= 0; i--) {
                if (oldLabels.indexOf(String(toolsMenu.getItemAt(i).label)) >= 0) toolsMenu.removeItemAt(i);
            }
        } catch (e) {}
        addToolsMenuItem('CB Pumpkin Cemetery Caretaker', function () { window.cbPumpkinCemeteryCaretaker.open(); });
    }
    function destroy() {
        releaseInputFocus();
        if (inputGuard.stage && inputGuard.listener) {
            try {
                inputGuard.stage.removeEventListener('keyDown', inputGuard.listener, false);
                inputGuard.stage.removeEventListener('keyUp', inputGuard.listener, false);
            } catch (e) {}
        }
        clearTimeout(dropTimer);
        serverRefresh = null;
        job = null;
        destroyed = true; clearTimeout(timer); clearTimeout(bootTimer);
        if (typeof $ !== 'undefined') {
            var host = $('#' + hostId);
            if (host.is(':visible')) host.removeClass('fade').modal('hide');
            host.remove();
            $('#' + id).remove(); $('#' + id + 'Style').remove();
        }
    }
    boot();
}());
