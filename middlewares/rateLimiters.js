const rateLimit = require('express-rate-limit');

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'Demasiados intentos de login. Intenta en 15 minutos.'
    }
});

const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        error: 'Demasiados uploads. Espera 5 minutos.'
    }
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => rateLimit.ipKeyGenerator(req),
});


module.exports = { generalLimiter, uploadLimiter, loginLimiter };