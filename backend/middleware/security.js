const helmet = require('helmet');

const securityHeaders = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            manifestSrc: ["'self'"],
            workerSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: process.env.NODE_ENV === 'production'
});

module.exports = { securityHeaders };
