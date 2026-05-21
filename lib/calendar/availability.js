"use strict";
/**
 * Agendra — Availability Core
 * Handles calculation of free slots based on:
 * 1. Working Hours (from persona_config)
 * 2. Service Duration
 * 3. Busy intervals (Google Calendar + local events)
 * 4. Timezone resolution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAvailableSlots = calculateAvailableSlots;
function calculateAvailableSlots(options) {
    var timezone = options.timezone, workingHours = options.workingHours, durationMinutes = options.durationMinutes, busyIntervals = options.busyIntervals, daysAhead = options.daysAhead, _a = options.bufferMinutes, bufferMinutes = _a === void 0 ? 0 : _a, providedNow = options.now;
    var now = providedNow || new Date();
    var rangeEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    var dayNames = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
    var ptDays = {
        mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta',
        fri: 'Sexta', sat: 'Sábado', sun: 'Domingo',
    };
    var ptMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var availableSlots = [];
    var cursor = new Date(now);
    // Start from the next whole hour or 30min block to keep it clean
    // We round UP to the next 30min mark
    var minutes = cursor.getMinutes();
    if (minutes < 30) {
        cursor.setMinutes(30, 0, 0);
    }
    else {
        cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    }
    // Ensure at least 1h buffer from "now" for AI bookings to avoid impossible slots
    if (cursor.getTime() < now.getTime() + 60 * 60 * 1000) {
        cursor.setMinutes(cursor.getMinutes() + 60);
    }
    // Returns UTC offset in minutes for a given timezone at a given UTC moment.
    function getOffsetMinutes(utcDate, tz) {
        try {
            var formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            var parts_1 = formatter.formatToParts(utcDate);
            var getPart = function (type) { var _a; return (_a = parts_1.find(function (p) { return p.type === type; })) === null || _a === void 0 ? void 0 : _a.value; };
            var localDate = new Date(Date.UTC(Number(getPart('year')), Number(getPart('month')) - 1, Number(getPart('day')), Number(getPart('hour')), Number(getPart('minute')), Number(getPart('second'))));
            return (localDate.getTime() - utcDate.getTime()) / 60000;
        }
        catch (e) {
            console.error('Error calculating offset:', e);
            return -180; // Default to BRT
        }
    }
    var _loop_1 = function () {
        var offsetMin = getOffsetMinutes(cursor, timezone);
        var offsetMs = offsetMin * 60000;
        var localCursor = new Date(cursor.getTime() + offsetMs);
        var localDayOfWeek = localCursor.getUTCDay();
        var localHour = localCursor.getUTCHours();
        var localMinute = localCursor.getUTCMinutes();
        var dayKey = dayNames[localDayOfWeek];
        var hours = workingHours[dayKey];
        if (hours) {
            var _b = hours[0].split(':').map(Number), startHH = _b[0], startMM = _b[1];
            var _c = hours[1].split(':').map(Number), endHH = _c[0], endMM = _c[1];
            var localMinutes = localHour * 60 + localMinute;
            var workStart = startHH * 60 + startMM;
            var workEnd = endHH * 60 + endMM;
            var totalSlotDuration = durationMinutes + bufferMinutes;
            var slotEndLocalMinutes = localMinutes + totalSlotDuration;
            if (localMinutes >= workStart && slotEndLocalMinutes <= workEnd) {
                var slotEnd_1 = new Date(cursor.getTime() + durationMinutes * 60000);
                // Check if overlaps with any busy interval
                var isBusy = busyIntervals.some(function (busy) { return busy.start < slotEnd_1 && busy.end > cursor; });
                if (!isBusy) {
                    var pad = function (n) { return String(n).padStart(2, '0'); };
                    var endLocal = new Date(cursor.getTime() + offsetMs + durationMinutes * 60000);
                    var label = "".concat(ptDays[dayKey], ", ").concat(pad(localCursor.getUTCDate()), " ").concat(ptMonths[localCursor.getUTCMonth()], " \u00B7 ").concat(pad(localHour), ":").concat(pad(localMinute), "\u2013").concat(pad(endLocal.getUTCHours()), ":").concat(pad(endLocal.getUTCMinutes()));
                    availableSlots.push({
                        start: cursor.toISOString(),
                        end: slotEnd_1.toISOString(),
                        label: label
                    });
                }
                else {
                    // console.log(`[Avail] Slot ${localHour}:${localMinute} is BUSY`);
                }
            }
            // Step by 30 minutes for better density
            cursor = new Date(cursor.getTime() + 30 * 60000);
            // If we passed the end of working hours for the day, skip to next day
            if (localMinutes >= workEnd) {
                var nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
                nextLocalMidnight.setUTCHours(0, 0, 0, 0);
                cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
            }
        }
        else {
            // Not a working day, skip to next day
            var nextLocalMidnight = new Date(localCursor.getTime() + 24 * 60 * 60 * 1000);
            nextLocalMidnight.setUTCHours(0, 0, 0, 0);
            cursor = new Date(nextLocalMidnight.getTime() - offsetMs);
        }
    };
    while (cursor < rangeEnd && availableSlots.length < 15) {
        _loop_1();
    }
    return availableSlots;
}
