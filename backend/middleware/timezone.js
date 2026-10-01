const TZ_PATTERN = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;

function isValidTimeZone(tz) {
    if (typeof tz !== 'string' || !TZ_PATTERN.test(tz)) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
    } catch (error) {
        return false;
    }
}

// Sets req.tz from the X-Timezone header (IANA name), defaulting to UTC.
function timezone(req, res, next) {
    const header = req.get('x-timezone');
    req.tz = isValidTimeZone(header) ? header : 'UTC';
    next();
}

module.exports = { timezone, isValidTimeZone };
